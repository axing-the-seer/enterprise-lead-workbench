import JSZip from "jszip";
import type { Company } from "./types";
import { capitalWanValue, operatingStatusLabel } from "./companyPresentation";

const columns: Array<[string, (company: Company) => unknown]> = [
  ["企业名称", (company) => company.name],
  ["统一社会信用代码", (company) => company.unified_social_credit_code],
  ["省", (company) => company.province],
  ["市", (company) => company.city],
  ["区县", (company) => company.district],
  ["行业", (company) => company.industry_name],
  ["经营状态", (company) => operatingStatusLabel(company.operating_status)],
  ["法定代表人", (company) => company.legal_representative],
  [
    "注册资本（万元）",
    (company) => capitalWanValue(company.registered_capital_amount),
  ],
  ["注册资本币种", (company) => company.registered_capital_currency ?? "CNY"],
  ["成立日期", (company) => company.established_on],
  ["参保人数", (company) => company.insured_employee_count],
  ["联系电话（脱敏）", (company) => company.phone_number ?? company.phone],
  ["网站", (company) => company.website],
  ["注册地址", (company) => company.address],
  ["主要数据来源", (company) => company.primary_source],
  ["最近核验时间", (company) => company.last_verified_at],
];

export async function exportCompanies(
  companies: Company[],
  format: "csv" | "json" | "xlsx",
  fileName: string,
) {
  if (companies.length === 0) throw new Error("没有可导出的企业");
  if (format === "json") {
    download(
      new Blob([JSON.stringify(companies.map(jsonRecord), null, 2)], {
        type: "application/json;charset=utf-8",
      }),
      `${fileName}.json`,
    );
    return;
  }
  if (format === "csv") {
    const rows = [
      columns.map(([label]) => label),
      ...companies.map((company) =>
        columns.map(([, read]) => cell(read(company))),
      ),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    download(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
      `${fileName}.csv`,
    );
    return;
  }
  download(await buildXlsxBlob(companies), `${fileName}.xlsx`);
}

async function buildXlsxBlob(companies: Company[]) {
  const zip = new JSZip();
  const rows = [
    columns.map(([label]) => label),
    ...companies.map((company) =>
      columns.map(([, read]) => cell(read(company))),
    ),
  ];
  const lastColumn = columnName(columns.length);
  const columnDefinitions = columns
    .map(([header], index) => {
      const width = Math.max(14, Math.min(42, header.length * 2 + 4));
      return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
    })
    .join("");
  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map(
          (value, columnIndex) =>
            `<c r="${columnName(columnIndex + 1)}${rowIndex + 1}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`,
        )
        .join("");
      return `<row r="${rowIndex + 1}"${rowIndex === 0 ? ' ht="24" customHeight="1"' : ""}>${cells}</row>`;
    })
    .join("");

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
  );
  zip.file(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>企业名单工作台</dc:creator><cp:lastModifiedBy>企业名单工作台</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`,
  );
  zip.file(
    "docProps/app.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>企业名单工作台</Application></Properties>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="企业名单" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file(
    "xl/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B2A56"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${columnDefinitions}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${lastColumn}1"/></worksheet>`,
  );

  return zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

function jsonRecord(company: Company) {
  return {
    schema_version: "enterprise-list-export.v1",
    company_name: company.name,
    unified_social_credit_code: company.unified_social_credit_code ?? null,
    region: {
      province: company.province ?? null,
      city: company.city ?? null,
      district: company.district ?? null,
      address: company.address ?? null,
    },
    industry_name: company.industry_name ?? null,
    operating_status: {
      code: company.operating_status ?? "unknown",
      label: operatingStatusLabel(company.operating_status),
    },
    legal_representative: company.legal_representative ?? null,
    registered_capital: {
      amount_wan: capitalWanValue(company.registered_capital_amount),
      currency: company.registered_capital_currency ?? "CNY",
      unit: "万元",
    },
    established_on: company.established_on ?? null,
    insured_employee_count: company.insured_employee_count ?? null,
    contact: {
      phone_masked: company.phone_number ?? company.phone ?? null,
      website: company.website ?? null,
    },
    source: {
      primary: company.primary_source ?? null,
      last_verified_at: company.last_verified_at ?? null,
    },
  };
}

function cell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function csvCell(value: string) {
  const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safeValue)
    ? `"${safeValue.replaceAll('"', '""')}"`
    : safeValue;
}

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sanitizeFileName(fileName);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").slice(0, 120);
}

function columnName(index: number) {
  let result = "";
  let value = index;
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}
