import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_XLSX_ZIP_LIMITS,
  validateXlsxZipArchive,
  type XlsxZipLimits,
} from "./xlsx-zip-security";

async function zipBytes(entries: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries))
    zip.file(name, content);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function limits(overrides: Partial<XlsxZipLimits>): XlsxZipLimits {
  return { ...DEFAULT_XLSX_ZIP_LIMITS, ...overrides };
}

describe("XLSX ZIP 预检", () => {
  it("允许正常的 Office Open XML 压缩包", async () => {
    const bytes = await zipBytes({
      "[Content_Types].xml": "<Types />",
      "xl/workbook.xml": "<workbook />",
    });
    expect(() => validateXlsxZipArchive(bytes)).not.toThrow();
  });

  it("在 ExcelJS 解压前阻断总解压体积超限", async () => {
    const bytes = await zipBytes({
      "xl/worksheets/sheet1.xml": "A".repeat(4_096),
      "xl/sharedStrings.xml": "B".repeat(4_096),
    });
    expect(() =>
      validateXlsxZipArchive(
        bytes,
        limits({ maxTotalUncompressedBytes: 6_000 }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "IMPORT_XLSX_UNSAFE_ARCHIVE" }),
    );
  });

  it("阻断异常压缩比和单个 XML 条目超限", async () => {
    const bytes = await zipBytes({
      "xl/worksheets/sheet1.xml": "0".repeat(16_384),
    });
    expect(() =>
      validateXlsxZipArchive(
        bytes,
        limits({
          maxXmlUncompressedBytes: 8_192,
          ratioCheckMinimumBytes: 1,
          maxCompressionRatio: 5,
        }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "IMPORT_XLSX_UNSAFE_ARCHIVE" }),
    );
  });

  it("阻断过多 ZIP 条目和目录穿越路径", async () => {
    const tooMany = await zipBytes({ "a.xml": "a", "b.xml": "b" });
    expect(() =>
      validateXlsxZipArchive(tooMany, limits({ maxEntries: 1 })),
    ).toThrowError(
      expect.objectContaining({ code: "IMPORT_XLSX_UNSAFE_ARCHIVE" }),
    );

    const traversal = await zipBytes({ "../outside.xml": "unsafe" });
    expect(() => validateXlsxZipArchive(traversal)).toThrowError(
      expect.objectContaining({ code: "IMPORT_XLSX_UNSAFE_ARCHIVE" }),
    );
  });
});
