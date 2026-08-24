import JSZip from "jszip";
import { render } from "vitest-browser-react";
import { FilePreviewPanel } from "./BatchesPage";
import { createFilePreview, MAX_PREVIEW_FILE_BYTES } from "./filePreview";

async function fictionalWorkbookBytes(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
      </Types>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="虚构数据" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Target="worksheets/sheet1.xml"
          Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>
      </Relationships>`,
  );
  zip.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">
        <si><t>企业名称</t></si><si><t>测试公式</t></si><si><t>虚构测试主体-X</t></si>
      </sst>`,
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
          <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><f>1+1</f><v>999</v></c></row>
        </sheetData>
      </worksheet>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

describe("文件上传本地预览", () => {
  it("CSV 检测表头并只返回前 10 行", async () => {
    const rows = Array.from(
      { length: 12 },
      (_, index) => `虚构测试主体-${index + 1},${index + 1}`,
    );
    const file = new File(
      [`企业名称,参保人数\n${rows.join("\n")}`],
      "fictional.csv",
      { type: "text/csv" },
    );

    const preview = await createFilePreview(file);

    expect(preview.headers).toEqual(["企业名称", "参保人数"]);
    expect(preview.rows).toHaveLength(10);
    expect(preview.rows[0]).toEqual(["虚构测试主体-1", "1"]);
    expect(preview.rows[9]).toEqual(["虚构测试主体-10", "10"]);
    expect(preview.hasMoreRows).toBe(true);
    expect(preview.totalRowCount).toBeNull();
  });

  it("JSON 复用记录结构并保留空值", async () => {
    const file = new File(
      [
        JSON.stringify({
          records: [
            { 企业名称: "虚构测试主体-A", 注册资本: 120 },
            { 企业名称: "虚构测试主体-B", 注册资本: null },
          ],
        }),
      ],
      "fictional.json",
      { type: "application/json" },
    );

    const preview = await createFilePreview(file);

    expect(preview.headers).toEqual(["企业名称", "注册资本"]);
    expect(preview.rows).toEqual([
      ["虚构测试主体-A", "120"],
      ["虚构测试主体-B", ""],
    ]);
    expect(preview.totalRowCount).toBe(2);
  });

  it("XLSX 以文本显示公式而不采用缓存计算结果", async () => {
    const bytes = await fictionalWorkbookBytes();
    const file = new File([bytes], "fictional.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const preview = await createFilePreview(file);

    expect(preview.headers).toEqual(["企业名称", "测试公式"]);
    expect(preview.rows).toEqual([["虚构测试主体-X", "=1+1"]]);
  });

  it("损坏的 XLSX 返回中文错误", async () => {
    const file = new File(["not-an-xlsx"], "broken.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await expect(createFilePreview(file)).rejects.toThrow(
      "已选 Excel 文件损坏或格式不受支持，无法生成预览。",
    );
  });

  it("超过 20 MiB 时在读取前拒绝", async () => {
    const arrayBuffer = vi.fn();
    const file = {
      name: "oversized.csv",
      size: MAX_PREVIEW_FILE_BYTES + 1,
      type: "text/csv",
      arrayBuffer,
    } as unknown as File;

    await expect(createFilePreview(file)).rejects.toThrow(
      "文件超过 20 MiB，请拆分后重试。",
    );
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("预览单元格仅渲染普通文本", async () => {
    const htmlLikeText = '<img src="x" onerror="globalThis.__unsafe=1">';
    const screen = await render(
      <FilePreviewPanel
        preview={{
          headers: ["企业名称", "备注"],
          rows: [["虚构测试主体-S", htmlLikeText]],
          totalRowCount: 1,
          hasMoreRows: false,
        }}
      />,
    );

    expect(screen.container.querySelector("img")).toBeNull();
    expect(screen.container.textContent).toContain(htmlLikeText);
  });
});
