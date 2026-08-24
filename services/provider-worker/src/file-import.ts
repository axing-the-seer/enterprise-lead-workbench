import ExcelJS from "exceljs";
import Papa from "papaparse";
import { WorkerError } from "./errors";
import { validateXlsxZipArchive } from "./xlsx-zip-security";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 20_000;
const MAX_COLUMNS = 200;

export type ImportedRows = {
  rows: Record<string, unknown>[];
  warnings: string[];
};

function ensureSize(bytes: Uint8Array) {
  if (bytes.byteLength === 0) {
    throw new WorkerError("IMPORT_EMPTY_FILE", "导入文件为空。");
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new WorkerError(
      "IMPORT_FILE_TOO_LARGE",
      "导入文件超过 20 MiB。请拆分后重试。",
    );
  }
}

function ensureRows(rows: Record<string, unknown>[]): ImportedRows {
  if (rows.length === 0) {
    throw new WorkerError("IMPORT_NO_RECORDS", "文件中没有可导入的记录。");
  }
  if (rows.length > MAX_ROWS) {
    throw new WorkerError(
      "IMPORT_TOO_MANY_ROWS",
      `单批最多处理 ${MAX_ROWS} 行，请拆分文件。`,
    );
  }
  const tooWide = rows.find((row) => Object.keys(row).length > MAX_COLUMNS);
  if (tooWide) {
    throw new WorkerError(
      "IMPORT_TOO_MANY_COLUMNS",
      `单表最多处理 ${MAX_COLUMNS} 列。`,
    );
  }
  return { rows, warnings: [] };
}

function parseJson(bytes: Uint8Array): ImportedRows {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    throw new WorkerError(
      "IMPORT_JSON_INVALID",
      "JSON 文件无法按 UTF-8 解析，或内容不是有效 JSON。",
    );
  }
  const records = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as Record<string, unknown>).records)
      ? ((parsed as Record<string, unknown>).records as unknown[])
      : null;
  if (!records) {
    throw new WorkerError(
      "IMPORT_JSON_SHAPE_UNSUPPORTED",
      "JSON 顶层必须是记录数组，或包含 records 数组。",
    );
  }
  if (
    records.some((row) => !row || typeof row !== "object" || Array.isArray(row))
  ) {
    throw new WorkerError("IMPORT_JSON_ROW_INVALID", "JSON 记录必须都是对象。");
  }
  return ensureRows(records as Record<string, unknown>[]);
}

function parseCsv(bytes: Uint8Array): ImportedRows {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, "");
  } catch {
    throw new WorkerError(
      "IMPORT_CSV_ENCODING_UNSUPPORTED",
      "CSV 不是 UTF-8 编码。请在表格工具中另存为 UTF-8 CSV 后重试。",
    );
  }
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.normalize("NFKC").trim(),
  });
  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new WorkerError(
      "IMPORT_CSV_INVALID",
      `CSV 第 ${(first.row ?? 0) + 1} 行无法解析：${first.message}`,
    );
  }
  const imported = ensureRows(result.data);
  const duplicateHeaders =
    Object.keys(result.meta.fields ?? {}).length !==
    new Set(result.meta.fields ?? []).size;
  return duplicateHeaders
    ? { ...imported, warnings: ["检测到重复列名；请在字段映射前复核。"] }
    : imported;
}

function excelCellValue(cell: ExcelJS.Cell): unknown {
  if (cell.type === ExcelJS.ValueType.Null) return null;
  if (cell.type === ExcelJS.ValueType.Date) {
    return cell.value instanceof Date ? cell.value.toISOString() : cell.text;
  }
  if (cell.type === ExcelJS.ValueType.Formula) {
    const result = (cell.value as ExcelJS.CellFormulaValue).result;
    return result instanceof Date ? result.toISOString() : (result ?? null);
  }
  if (cell.type === ExcelJS.ValueType.RichText) return cell.text;
  if (typeof cell.value === "object" && cell.value !== null) return cell.text;
  return cell.value ?? null;
}

async function parseXlsx(bytes: Uint8Array): Promise<ImportedRows> {
  validateXlsxZipArchive(bytes);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes));
  } catch {
    throw new WorkerError(
      "IMPORT_XLSX_INVALID",
      "Excel 文件损坏或格式不受支持。",
    );
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet)
    throw new WorkerError("IMPORT_NO_SHEET", "Excel 文件没有工作表。");
  if (worksheet.actualColumnCount > MAX_COLUMNS) {
    throw new WorkerError(
      "IMPORT_TOO_MANY_COLUMNS",
      `单表最多处理 ${MAX_COLUMNS} 列。`,
    );
  }
  if (worksheet.actualRowCount - 1 > MAX_ROWS) {
    throw new WorkerError(
      "IMPORT_TOO_MANY_ROWS",
      `单批最多处理 ${MAX_ROWS} 行，请拆分文件。`,
    );
  }

  const headerRow = worksheet.getRow(1);
  const headers = Array.from(
    { length: worksheet.actualColumnCount },
    (_, index) =>
      String(excelCellValue(headerRow.getCell(index + 1)) ?? "")
        .normalize("NFKC")
        .trim(),
  );
  if (headers.some((header) => !header)) {
    throw new WorkerError(
      "IMPORT_XLSX_HEADER_MISSING",
      "Excel 第一行存在空列名。",
    );
  }
  if (new Set(headers).size !== headers.length) {
    throw new WorkerError(
      "IMPORT_XLSX_HEADER_DUPLICATE",
      "Excel 第一行存在重复列名。",
    );
  }

  const rows: Record<string, unknown>[] = [];
  for (
    let rowNumber = 2;
    rowNumber <= worksheet.actualRowCount;
    rowNumber += 1
  ) {
    const row = worksheet.getRow(rowNumber);
    const record = Object.fromEntries(
      headers.map((header, index) => [
        header,
        excelCellValue(row.getCell(index + 1)),
      ]),
    );
    if (Object.values(record).some((value) => value !== null && value !== ""))
      rows.push(record);
  }
  return ensureRows(rows);
}

export async function parseImportFile(
  bytes: Uint8Array,
  fileName: string,
  mediaType: string,
): Promise<ImportedRows> {
  ensureSize(bytes);
  const lowerName = fileName.toLocaleLowerCase("en-US");
  if (mediaType === "application/json" || lowerName.endsWith(".json"))
    return parseJson(bytes);
  if (mediaType === "text/csv" || lowerName.endsWith(".csv"))
    return parseCsv(bytes);
  if (
    mediaType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mediaType === "application/vnd.ms-excel" ||
    lowerName.endsWith(".xlsx")
  ) {
    return parseXlsx(bytes);
  }
  throw new WorkerError(
    "IMPORT_MEDIA_TYPE_UNSUPPORTED",
    "当前仅支持 UTF-8 CSV、JSON 和 XLSX。",
  );
}
