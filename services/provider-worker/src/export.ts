import ExcelJS from "exceljs";
import Papa from "papaparse";
import { getPath, safeDisplayValue } from "../../../src/domain";
import { WorkerError } from "./errors";
import { sha256Bytes } from "./stable-json";
import type {
  ClaimedWorkbenchJob,
  ExportContext,
  WorkbenchStore,
} from "./types";

const DEFAULT_FIELDS = [
  "companyName",
  "creditCode",
  "status.raw",
  "companyType",
  "registeredCapital.valueWan",
  "establishedDate",
  "industry.l2",
  "insuredCount",
  "registeredAddress",
  "decision",
] as const;

const ALLOWED_FIELDS = new Set([
  ...DEFAULT_FIELDS,
  "legalPerson",
  "paidInCapital.valueWan",
  "approvedDate",
  "registrationAuthority",
  "region.raw",
  "region.province",
  "region.city",
  "region.district",
  "personnelScale.raw",
  "businessScope",
  "contact.phoneMasked",
  "contact.emailMasked",
  "tags.qualifications",
  "tags.risk",
  "tags.operational",
  "riskSnapshot.severity",
]);

const FIELD_LABELS: Record<string, string> = {
  companyName: "企业名称",
  creditCode: "统一社会信用代码",
  legalPerson: "法定代表人",
  "status.raw": "登记状态",
  companyType: "企业类型",
  "registeredCapital.valueWan": "注册资本（万元）",
  "paidInCapital.valueWan": "实缴资本（万元）",
  establishedDate: "成立日期",
  approvedDate: "核准日期",
  registrationAuthority: "登记机关",
  "industry.l2": "行业",
  insuredCount: "参保人数",
  "region.raw": "所属地区",
  "region.province": "省",
  "region.city": "市",
  "region.district": "区县",
  "personnelScale.raw": "人员规模",
  registeredAddress: "注册地址",
  businessScope: "经营范围",
  "contact.phoneMasked": "脱敏电话",
  "contact.emailMasked": "脱敏邮箱",
  "tags.qualifications": "资质标签",
  "tags.risk": "风险标签",
  "tags.operational": "经营标签",
  "riskSnapshot.severity": "风险关注度",
  decision: "规则结果",
};

function selectedFields(value: unknown): string[] {
  const fields =
    Array.isArray(value) && value.length ? value : [...DEFAULT_FIELDS];
  const normalized = fields.filter(
    (field): field is string => typeof field === "string",
  );
  if (normalized.length === 0 || normalized.length > 200) {
    throw new WorkerError("EXPORT_FIELDS_INVALID", "导出字段数量无效。");
  }
  const unknown = normalized.filter((field) => !ALLOWED_FIELDS.has(field));
  if (unknown.length) {
    throw new WorkerError(
      "EXPORT_FIELD_UNSUPPORTED",
      `存在未开放的导出字段：${unknown.slice(0, 5).join("、")}`,
    );
  }
  return [...new Set(normalized)];
}

function exportRows(
  context: ExportContext,
  fields: string[],
  filter: Record<string, unknown>,
): Record<string, unknown>[] {
  const allowedDecisions = Array.isArray(filter.decisions)
    ? new Set(
        filter.decisions.filter(
          (value): value is string => typeof value === "string",
        ),
      )
    : null;
  return context.records
    .filter(({ companyId }) => {
      const decision = context.decisions.get(companyId);
      return (
        !allowedDecisions ||
        (decision
          ? allowedDecisions.has(decision)
          : allowedDecisions.has("unscored"))
      );
    })
    .map(({ companyId, lead }) =>
      Object.fromEntries(
        fields.map((field) => [
          FIELD_LABELS[field] ?? field,
          field === "decision"
            ? (context.decisions.get(companyId) ?? "unscored")
            : (getPath(lead, field) ?? null),
        ]),
      ),
    );
}

function formulaSafe(value: unknown): unknown {
  if (Array.isArray(value)) return value.join("；");
  if (value && typeof value === "object") return safeDisplayValue(value);
  if (typeof value !== "string") return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function escapeHtml(value: unknown): string {
  return safeDisplayValue(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function render(
  format: string,
  rows: Record<string, unknown>[],
): Promise<{ content: Uint8Array; mediaType: string; extension: string }> {
  if (format === "json") {
    return {
      content: bytes(JSON.stringify({ schemaVersion: "1.0", rows }, null, 2)),
      mediaType: "application/json",
      extension: "json",
    };
  }
  if (format === "csv") {
    const safeRows = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, formulaSafe(value)]),
      ),
    );
    return {
      content: bytes(`\uFEFF${Papa.unparse(safeRows, { newline: "\r\n" })}`),
      mediaType: "text/csv",
      extension: "csv",
    };
  }
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "企业名单工作台";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("企业名单");
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    sheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: 22,
    }));
    for (const row of rows) {
      sheet.addRow(
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key, formulaSafe(value)]),
        ),
      );
    }
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = headers.length
      ? { from: "A1", to: `${sheet.getColumn(headers.length).letter}1` }
      : undefined;
    const buffer = await workbook.xlsx.writeBuffer();
    return {
      content: new Uint8Array(buffer),
      mediaType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
    };
  }
  if (format === "html") {
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    const tableRows = rows
      .map(
        (row) =>
          `<tr>${headers.map((header) => `<td>${escapeHtml(row[header])}</td>`).join("")}</tr>`,
      )
      .join("");
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>企业名单</title><style>body{font:14px system-ui,sans-serif;margin:24px;color:#17212b}table{border-collapse:collapse;width:100%}th,td{padding:9px 10px;border:1px solid #d8dee6;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#f5f7f9}</style></head><body><h1>企业名单</h1><p>共 ${rows.length} 条。此文件是导出时点快照。</p><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
    return { content: bytes(html), mediaType: "text/html", extension: "html" };
  }
  throw new WorkerError("EXPORT_FORMAT_UNSUPPORTED", "不支持该导出格式。");
}

export async function processExport(
  job: ClaimedWorkbenchJob,
  store: WorkbenchStore,
): Promise<Record<string, unknown>> {
  const format = String(job.payload.export_format ?? "").toLocaleLowerCase(
    "en-US",
  );
  const fields = selectedFields(job.payload.selected_fields);
  const filter =
    job.payload.filter_definition &&
    typeof job.payload.filter_definition === "object" &&
    !Array.isArray(job.payload.filter_definition)
      ? (job.payload.filter_definition as Record<string, unknown>)
      : {};
  const context = await store.loadExportContext(job);
  const rows = exportRows(context, fields, filter);
  const rendered = await render(format, rows);
  const requestedBy = String(job.payload.requested_by ?? "service");
  const path = `${job.workspace_id}/${requestedBy}/${job.job_id}.${rendered.extension}`;
  await store.uploadExport(path, rendered.mediaType, rendered.content);
  return {
    storage_bucket: "workbench-exports",
    storage_path: path,
    checksum_sha256: sha256Bytes(rendered.content),
    file_size_bytes: rendered.content.byteLength,
    row_count: rows.length,
    selected_fields: fields,
  };
}
