import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import type { Lead } from "../../../src/domain";
import { processExport } from "./export";
import { parseImportFile } from "./file-import";
import type { ClaimedWorkbenchJob, WorkbenchStore } from "./types";

const XLSX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function workbookBytes(
  rows: Array<Array<string | number>>,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("测试数据");
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function fictionalLead(index: number, registeredAddress: string): Lead {
  return {
    leadId: `fictional-lead-${index}`,
    companyName: `虚构测试主体-${index}`,
    creditCode: `FICTIONAL-CODE-${index}`,
    legalPerson: null,
    legalChangeDate: null,
    legalPersonSharePercent: null,
    companyType: "测试类型",
    registeredCapital: {
      valueWan: 100 + index,
      raw: 100 + index,
      currency: "CNY",
      unit: "万元",
      nullMeaning: "provided",
    },
    paidInCapital: {
      valueWan: null,
      raw: null,
      currency: "CNY",
      unit: "万元",
      nullMeaning: "not_provided",
    },
    establishedDate: "2024-05-06",
    approvedDate: null,
    registrationAuthority: null,
    status: { raw: "测试状态", normalized: "unknown" },
    industry: { l1: "测试行业", l2: "测试子行业" },
    region: {
      raw: "测试地区",
      province: null,
      city: null,
      district: null,
    },
    personnelScale: { raw: null, lowerBound: null, upperBound: null },
    insuredCount: index,
    registeredAddress,
    businessScope: null,
    contact: {
      phoneMasked: null,
      emailMasked: null,
      phoneCount: null,
      emailCount: null,
      phoneSourceYear: null,
      emailSourceYear: null,
    },
    tags: { qualifications: [], risk: [], operational: [] },
    riskSnapshot: {
      asOf: "2024-05-06T00:00:00.000Z",
      severity: "unknown",
      signals: [],
      note: null,
    },
    providerRiskAssessments: [],
    webEvidence: [],
    provenance: [
      {
        fieldPath: "companyName",
        providerId: "fictional-test-provider",
        providerName: "虚构测试数据源",
        channel: "customer_upload",
        evidenceClass: "customer_assertion",
        sourceField: "企业名称",
        retrievedAt: "2024-05-06T00:00:00.000Z",
        sourceUpdatedAt: null,
        sourceUrl: null,
        unit: "text",
        nullMeaning: "provided",
        confidence: 1,
        usageScope: "internal_analysis",
        note: "仅用于自动化测试的虚构数据",
      },
    ],
    conflicts: [],
  };
}

function exportJob(
  format: "csv" | "xlsx" | "json" | "html",
  selectedFields: string[],
): ClaimedWorkbenchJob {
  return {
    job_type: "export",
    job_id: "22222222-2222-4222-8222-222222222222",
    workspace_id: "11111111-1111-4111-8111-111111111111",
    payload: {
      export_format: format,
      selected_fields: selectedFields,
      requested_by: "33333333-3333-4333-8333-333333333333",
    },
  };
}

function exportStore(leads: Lead[]) {
  let uploaded:
    | { path: string; mediaType: string; content: Uint8Array }
    | undefined;
  const store = {
    loadExportContext: vi.fn().mockResolvedValue({
      records: leads.map((lead, index) => ({
        companyId: index + 1,
        sourceRecordId: null,
        lead,
      })),
      decisions: new Map<number, string>(),
    }),
    uploadExport: vi.fn(
      async (path: string, mediaType: string, content: Uint8Array) => {
        uploaded = { path, mediaType, content };
      },
    ),
  } as unknown as WorkbenchStore;
  return {
    store,
    uploaded: () => {
      if (!uploaded) throw new Error("测试期望生成导出文件。");
      return uploaded;
    },
  };
}

describe("ExcelJS 安全升级回归", () => {
  it("文本导出使用 Supabase 存储白名单中的标准 MIME", async () => {
    const cases = [
      ["json", "application/json"],
      ["csv", "text/csv"],
      ["html", "text/html"],
    ] as const;

    for (const [format, expectedMediaType] of cases) {
      const fixture = exportStore([fictionalLead(1, "虚构测试地址")]);
      await processExport(exportJob(format, ["companyName"]), fixture.store);
      expect(fixture.uploaded().mediaType).toBe(expectedMediaType);
    }
  });

  it("可以从 XLSX 导入基本文本和数值字段", async () => {
    const bytes = await workbookBytes([
      ["企业名称", "注册资本（万元）", "成立日期", "参保人数"],
      ["虚构测试主体-A", 123.45, "2024-05-06", 7],
    ]);

    const imported = await parseImportFile(
      bytes,
      "fictional.xlsx",
      XLSX_MEDIA_TYPE,
    );

    expect(imported).toEqual({
      warnings: [],
      rows: [
        {
          企业名称: "虚构测试主体-A",
          "注册资本(万元)": 123.45,
          成立日期: "2024-05-06",
          参保人数: 7,
        },
      ],
    });
  });

  it("导出的 XLSX 可被 ExcelJS 重新读取", async () => {
    const fixture = exportStore([fictionalLead(1, "虚构测试地址")]);

    const result = await processExport(
      exportJob("xlsx", ["companyName", "insuredCount", "registeredAddress"]),
      fixture.store,
    );
    const upload = fixture.uploaded();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(upload.content));
    const sheet = workbook.getWorksheet("企业名单");

    expect(upload.mediaType).toBe(XLSX_MEDIA_TYPE);
    expect(result).toMatchObject({
      row_count: 1,
      file_size_bytes: upload.content.byteLength,
    });
    expect(sheet).toBeDefined();
    expect(sheet?.getRow(1).values).toEqual([
      undefined,
      "企业名称",
      "参保人数",
      "注册地址",
    ]);
    expect(sheet?.getRow(2).values).toEqual([
      undefined,
      "虚构测试主体-1",
      1,
      "虚构测试地址",
    ]);
  });

  it("损坏的 XLSX 会返回稳定、明确的导入错误", async () => {
    const corrupt = new TextEncoder().encode("this-is-not-an-xlsx-file");

    await expect(
      parseImportFile(corrupt, "corrupt.xlsx", XLSX_MEDIA_TYPE),
    ).rejects.toMatchObject({
      name: "WorkerError",
      code: "IMPORT_XLSX_INVALID",
      message: "Excel 文件损坏或格式不受支持。",
    });
  });

  it("CSV 导出会阻断常见公式注入前缀", async () => {
    const payloads = [
      "=2+2",
      "+SUM(A1:A2)",
      "-10+20",
      "@SUM(A1:A2)",
      "\t=2+2",
      "\r=2+2",
    ];
    const fixture = exportStore(
      payloads.map((payload, index) => fictionalLead(index + 1, payload)),
    );

    await processExport(
      exportJob("csv", ["companyName", "registeredAddress"]),
      fixture.store,
    );
    const upload = fixture.uploaded();
    const parsed = await parseImportFile(
      upload.content,
      "export.csv",
      "text/csv",
    );

    expect(parsed.rows.map((row) => row["注册地址"])).toEqual(
      payloads.map((payload) => `'${payload}`),
    );
  });

  it("XLSX 导出会将常见公式注入前缀写成普通文本", async () => {
    const payloads = [
      "=2+2",
      "+SUM(A1:A2)",
      "-10+20",
      "@SUM(A1:A2)",
      "\t=2+2",
      "\r=2+2",
    ];
    const fixture = exportStore(
      payloads.map((payload, index) => fictionalLead(index + 1, payload)),
    );

    await processExport(
      exportJob("xlsx", ["companyName", "registeredAddress"]),
      fixture.store,
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(fixture.uploaded().content));
    const sheet = workbook.getWorksheet("企业名单");

    expect(sheet).toBeDefined();
    for (let index = 0; index < payloads.length; index += 1) {
      const cell = sheet?.getCell(index + 2, 2);
      expect(cell?.type).toBe(ExcelJS.ValueType.String);
      expect(cell?.value).toEqual(expect.any(String));
      expect(String(cell?.value).startsWith("'")).toBe(true);
    }
  });
});
