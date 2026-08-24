import { JSONParser } from "@streamparser/json-whatwg";
import type { JSZipObject } from "jszip";
import Papa from "papaparse";

export const MAX_PREVIEW_FILE_BYTES = 20 * 1024 * 1024;
export const PREVIEW_ROW_LIMIT = 10;

const MAX_PREVIEW_COLUMNS = 200;
const MAX_XLSX_XML_BYTES = 64 * 1024 * 1024;
const MAX_XLSX_METADATA_BYTES = 2 * 1024 * 1024;
const XLSX_RELATIONSHIPS_NAMESPACE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const BUILTIN_EXCEL_DATE_FORMAT_IDS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58,
]);

export type FilePreview = {
  headers: string[];
  rows: string[][];
  totalRowCount: number | null;
  hasMoreRows: boolean;
};

type PreviewFileKind = "csv" | "json" | "xlsx";

class XlsxPreviewError extends Error {}

type ZipObjectWithSize = JSZipObject & {
  _data?: { uncompressedSize?: number };
};

function previewFileKind(file: File): PreviewFileKind {
  const extension = file.name.toLocaleLowerCase("en-US").split(".").pop();
  if (extension === "csv") return "csv";
  if (extension === "json") return "json";
  if (extension === "xlsx") return "xlsx";
  throw new Error("只支持 CSV、JSON 或 XLSX 文件。");
}

function ensurePreviewableFile(file: File) {
  if (file.size === 0) {
    throw new Error("文件为空，请选择包含表头和数据的文件。");
  }
  if (file.size > MAX_PREVIEW_FILE_BYTES) {
    throw new Error("文件超过 20 MiB，请拆分后重试。");
  }
}

function normalizeHeaders(values: unknown[]): string[] {
  if (values.length === 0) {
    throw new Error("未检测到表头。");
  }
  if (values.length > MAX_PREVIEW_COLUMNS) {
    throw new Error("文件超过 200 列，请精简后重试。");
  }
  const headers = values.map((value) =>
    String(value ?? "")
      .replace(/^\uFEFF/, "")
      .normalize("NFKC")
      .trim(),
  );
  if (headers.some((header) => !header)) {
    throw new Error("表头中存在空列名，请补全后重试。");
  }
  return headers;
}

function previewText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "[无法预览]";
  }
}

async function readUtf8(file: File, kind: "CSV" | "JSON"): Promise<string> {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    throw new Error(`${kind} 文件不是有效的 UTF-8 编码。`);
  }
}

async function parseCsvPreview(file: File): Promise<FilePreview> {
  const text = (await readUtf8(file, "CSV")).replace(/^\uFEFF/, "");
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
    preview: PREVIEW_ROW_LIMIT + 2,
  });
  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(
      `CSV 第 ${(first.row ?? 0) + 1} 行无法解析：${first.message}`,
    );
  }
  const [headerValues, ...dataRows] = result.data;
  const headers = normalizeHeaders(headerValues ?? []);
  if (dataRows.length === 0) {
    throw new Error("CSV 文件中没有可预览的数据行。");
  }
  const hasMoreRows = dataRows.length > PREVIEW_ROW_LIMIT;
  const rows = dataRows
    .slice(0, PREVIEW_ROW_LIMIT)
    .map((row) => headers.map((_, index) => previewText(row[index])));
  return {
    headers,
    rows,
    totalRowCount: hasMoreRows ? null : rows.length,
    hasMoreRows,
  };
}

async function parseJsonRoot(file: File): Promise<unknown> {
  const parser = new JSONParser({ paths: ["$"] });
  const reader = file.stream().pipeThrough(parser).getReader();
  let root: unknown;
  let hasRoot = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value.partial) {
        root = value.value;
        hasRoot = true;
      }
    }
  } catch {
    throw new Error("JSON 文件无法解析，请检查编码和语法。");
  }
  if (!hasRoot) {
    throw new Error("JSON 文件无法解析，请检查编码和语法。");
  }
  return root;
}

async function parseJsonPreview(file: File): Promise<FilePreview> {
  const parsed = await parseJsonRoot(file);
  const records = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as Record<string, unknown>).records)
      ? ((parsed as Record<string, unknown>).records as unknown[])
      : null;
  if (!records) {
    throw new Error("JSON 顶层必须是记录数组，或包含 records 数组。");
  }
  if (records.length === 0) {
    throw new Error("JSON 文件中没有可预览的数据行。");
  }
  if (
    records.some(
      (record) =>
        !record || typeof record !== "object" || Array.isArray(record),
    )
  ) {
    throw new Error("JSON 记录必须都是对象。");
  }

  const headers: string[] = [];
  const seenHeaders = new Set<string>();
  for (const record of records as Record<string, unknown>[]) {
    for (const header of Object.keys(record)) {
      if (!header.trim()) {
        throw new Error("表头中存在空列名，请补全后重试。");
      }
      if (!seenHeaders.has(header)) {
        seenHeaders.add(header);
        headers.push(header);
        if (headers.length > MAX_PREVIEW_COLUMNS) {
          throw new Error("文件超过 200 列，请精简后重试。");
        }
      }
    }
  }
  if (headers.length === 0) throw new Error("未检测到表头。");
  const rows = (records as Record<string, unknown>[])
    .slice(0, PREVIEW_ROW_LIMIT)
    .map((record) => headers.map((header) => previewText(record[header])));
  return {
    headers,
    rows,
    totalRowCount: records.length,
    hasMoreRows: records.length > PREVIEW_ROW_LIMIT,
  };
}

function xmlElements(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagNameNS("*", localName));
}

function firstDirectXmlChild(
  element: Element,
  localName: string,
): Element | null {
  return (
    Array.from(element.children).find(
      (child) => child.localName === localName,
    ) ?? null
  );
}

function parseXlsxXml(xml: string, partName: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new XlsxPreviewError(`${partName} 包含不允许的 XML 声明。`);
  }
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (
    document.documentElement.localName === "parsererror" ||
    xmlElements(document, "parsererror").length > 0
  ) {
    throw new XlsxPreviewError(`${partName} 无法解析。`);
  }
  return document;
}

function zipEntrySize(entry: JSZipObject): number | null {
  const value = (entry as ZipObjectWithSize)._data?.uncompressedSize;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function readXlsxPart(
  entry: JSZipObject | null,
  partName: string,
  limit = MAX_XLSX_XML_BYTES,
): Promise<string> {
  if (!entry || entry.dir) {
    throw new XlsxPreviewError(`Excel 缺少 ${partName}。`);
  }
  const declaredSize = zipEntrySize(entry);
  if (declaredSize !== null && declaredSize > limit) {
    throw new XlsxPreviewError(
      "Excel 文件解压后过大，无法在浏览器中安全预览，请拆分文件。",
    );
  }
  const text = await entry.async("string");
  if (text.length > limit) {
    throw new XlsxPreviewError(
      "Excel 文件解压后过大，无法在浏览器中安全预览，请拆分文件。",
    );
  }
  return text;
}

function resolveXlsxTarget(basePart: string, target: string): string {
  if (!target || target.includes("\\") || /^[a-z][a-z\d+.-]*:/i.test(target)) {
    throw new XlsxPreviewError("Excel 工作表路径无效。");
  }
  const parts = target.startsWith("/")
    ? target.slice(1).split("/")
    : [...basePart.split("/").slice(0, -1), ...target.split("/")];
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (resolved.length === 0) {
        throw new XlsxPreviewError("Excel 工作表路径无效。");
      }
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  const path = resolved.join("/");
  if (!path.startsWith("xl/")) {
    throw new XlsxPreviewError("Excel 工作表路径越界。");
  }
  return path;
}

function firstWorksheetPath(
  workbook: Document,
  relationships: Document,
): string {
  const firstSheet = xmlElements(workbook, "sheet")[0];
  if (!firstSheet) {
    throw new XlsxPreviewError("Excel 文件中没有工作表。");
  }
  const relationshipId =
    firstSheet.getAttributeNS(XLSX_RELATIONSHIPS_NAMESPACE, "id") ??
    firstSheet.getAttribute("r:id");
  const relationship = xmlElements(relationships, "Relationship").find(
    (candidate) => candidate.getAttribute("Id") === relationshipId,
  );
  const target = relationship?.getAttribute("Target");
  if (!target) {
    throw new XlsxPreviewError("Excel 工作表关系无效。");
  }
  return resolveXlsxTarget("xl/workbook.xml", target);
}

function sharedStrings(document: Document | null): string[] {
  if (!document) return [];
  return xmlElements(document, "si").map((item) =>
    xmlElements(item, "t")
      .map((text) => text.textContent ?? "")
      .join(""),
  );
}

function customDateFormatIds(styles: Document | null): Set<number> {
  const dateFormatIds = new Set(BUILTIN_EXCEL_DATE_FORMAT_IDS);
  if (!styles) return dateFormatIds;
  for (const format of xmlElements(styles, "numFmt")) {
    const id = Number(format.getAttribute("numFmtId"));
    const code = format.getAttribute("formatCode") ?? "";
    const semanticCode = code
      .replace(/"[^"]*"/g, "")
      .replace(/\\./g, "")
      .replace(/\[(?!h+\]|m+\]|s+\])[^\]]+\]/gi, "")
      .replace(/_.|\*./g, "");
    if (Number.isInteger(id) && /[ymdhs]/i.test(semanticCode)) {
      dateFormatIds.add(id);
    }
  }
  return dateFormatIds;
}

function dateStyleIndexes(styles: Document | null): Set<number> {
  const indexes = new Set<number>();
  if (!styles) return indexes;
  const cellXfs = xmlElements(styles, "cellXfs")[0];
  if (!cellXfs) return indexes;
  const dateFormatIds = customDateFormatIds(styles);
  Array.from(cellXfs.children).forEach((style, index) => {
    const formatId = Number(style.getAttribute("numFmtId") ?? 0);
    if (dateFormatIds.has(formatId)) indexes.add(index);
  });
  return indexes;
}

function excelSerialToIso(value: number, uses1904DateSystem: boolean): string {
  const epoch = uses1904DateSystem
    ? Date.UTC(1904, 0, 1)
    : Date.UTC(1899, 11, 30);
  const date = new Date(epoch + value * 86_400_000);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function cellColumnIndex(cell: Element, fallbackIndex: number): number {
  const reference = cell.getAttribute("r")?.toUpperCase();
  const columnLetters = reference?.match(/^([A-Z]+)\d+$/)?.[1];
  if (!columnLetters) return fallbackIndex;
  let index = 0;
  for (const letter of columnLetters) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }
  return index;
}

function xlsxCellPreviewText(
  cell: Element,
  strings: string[],
  dateStyles: Set<number>,
  uses1904DateSystem: boolean,
): string {
  const formula = firstDirectXmlChild(cell, "f");
  if (formula) {
    const value = formula.textContent?.trim();
    return value ? `=${value.replace(/^=/, "")}` : "[公式单元格]";
  }

  const type = cell.getAttribute("t") ?? "n";
  if (type === "inlineStr") {
    const inlineString = firstDirectXmlChild(cell, "is");
    return inlineString
      ? xmlElements(inlineString, "t")
          .map((text) => text.textContent ?? "")
          .join("")
      : "";
  }

  const raw = firstDirectXmlChild(cell, "v")?.textContent ?? "";
  if (type === "s") {
    const index = Number(raw);
    return Number.isInteger(index) && index >= 0 ? (strings[index] ?? "") : "";
  }
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  if (type === "d") {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? raw : date.toISOString();
  }
  if (type === "e") return raw || "[Excel 错误]";

  const styleIndex = Number(cell.getAttribute("s") ?? 0);
  const numericValue = Number(raw);
  if (
    raw !== "" &&
    Number.isFinite(numericValue) &&
    dateStyles.has(styleIndex)
  ) {
    return excelSerialToIso(numericValue, uses1904DateSystem);
  }
  return raw;
}

function worksheetPreview(
  worksheet: Document,
  strings: string[],
  styles: Document | null,
  uses1904DateSystem: boolean,
): FilePreview {
  const parsedRows: Array<{ rowNumber: number; values: Map<number, string> }> =
    [];
  const dateStyles = dateStyleIndexes(styles);
  let fallbackRowNumber = 0;
  let maximumColumn = 0;

  for (const row of xmlElements(worksheet, "row")) {
    const declaredRowNumber = Number(row.getAttribute("r"));
    const rowNumber =
      Number.isInteger(declaredRowNumber) && declaredRowNumber > 0
        ? declaredRowNumber
        : fallbackRowNumber + 1;
    fallbackRowNumber = rowNumber;
    const values = new Map<number, string>();
    let fallbackColumn = 1;
    for (const cell of Array.from(row.children).filter(
      (child) => child.localName === "c",
    )) {
      const column = cellColumnIndex(cell, fallbackColumn);
      fallbackColumn = column + 1;
      if (column > MAX_PREVIEW_COLUMNS) {
        throw new XlsxPreviewError("文件超过 200 列，请精简后重试。");
      }
      maximumColumn = Math.max(maximumColumn, column);
      values.set(
        column,
        xlsxCellPreviewText(cell, strings, dateStyles, uses1904DateSystem),
      );
    }
    parsedRows.push({ rowNumber, values });
  }

  const header = parsedRows.find((row) => row.rowNumber === 1);
  const headers = normalizeHeaders(
    Array.from({ length: maximumColumn }, (_, index) =>
      header?.values.get(index + 1),
    ),
  );
  const dataRows = parsedRows
    .filter((row) => row.rowNumber > 1)
    .map((row) => headers.map((_, index) => row.values.get(index + 1) ?? ""))
    .filter((row) => row.some((value) => value !== ""));
  if (dataRows.length === 0) {
    throw new XlsxPreviewError("Excel 文件中没有可预览的数据行。");
  }
  return {
    headers,
    rows: dataRows.slice(0, PREVIEW_ROW_LIMIT),
    totalRowCount: dataRows.length,
    hasMoreRows: dataRows.length > PREVIEW_ROW_LIMIT,
  };
}

async function parseXlsxPreview(file: File): Promise<FilePreview> {
  try {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await file.arrayBuffer(), {
      createFolders: false,
    });
    const workbookXml = await readXlsxPart(
      zip.file("xl/workbook.xml"),
      "workbook.xml",
      MAX_XLSX_METADATA_BYTES,
    );
    const relationshipsXml = await readXlsxPart(
      zip.file("xl/_rels/workbook.xml.rels"),
      "workbook.xml.rels",
      MAX_XLSX_METADATA_BYTES,
    );
    const workbook = parseXlsxXml(workbookXml, "workbook.xml");
    const relationships = parseXlsxXml(relationshipsXml, "workbook.xml.rels");
    const worksheetPath = firstWorksheetPath(workbook, relationships);
    const worksheet = parseXlsxXml(
      await readXlsxPart(zip.file(worksheetPath), worksheetPath),
      worksheetPath,
    );
    const sharedStringsEntry = zip.file("xl/sharedStrings.xml");
    const sharedStringsDocument = sharedStringsEntry
      ? parseXlsxXml(
          await readXlsxPart(sharedStringsEntry, "sharedStrings.xml"),
          "sharedStrings.xml",
        )
      : null;
    const stylesEntry = zip.file("xl/styles.xml");
    const stylesDocument = stylesEntry
      ? parseXlsxXml(
          await readXlsxPart(
            stylesEntry,
            "styles.xml",
            MAX_XLSX_METADATA_BYTES,
          ),
          "styles.xml",
        )
      : null;
    const workbookProperties = xmlElements(workbook, "workbookPr")[0];
    const uses1904DateSystem = ["1", "true"].includes(
      workbookProperties?.getAttribute("date1904")?.toLowerCase() ?? "",
    );
    return worksheetPreview(
      worksheet,
      sharedStrings(sharedStringsDocument),
      stylesDocument,
      uses1904DateSystem,
    );
  } catch (error) {
    if (error instanceof XlsxPreviewError) throw error;
    throw new Error("已选 Excel 文件损坏或格式不受支持，无法生成预览。");
  }
}

export async function createFilePreview(file: File): Promise<FilePreview> {
  ensurePreviewableFile(file);
  const kind = previewFileKind(file);
  if (kind === "csv") return parseCsvPreview(file);
  if (kind === "json") return parseJsonPreview(file);
  return parseXlsxPreview(file);
}
