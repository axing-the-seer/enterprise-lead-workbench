import { describe, expect, it } from "vitest";
import { csvCell } from "./listExport";

describe("名单快捷导出", () => {
  it("阻断会被表格软件解释为公式的文本前缀", () => {
    expect(csvCell("=2+2")).toBe("'=2+2");
    expect(csvCell("+SUM(A1:A2)")).toBe("'+SUM(A1:A2)");
    expect(csvCell("-10+20")).toBe("'-10+20");
    expect(csvCell("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
    expect(csvCell("\t=2+2")).toBe("'\t=2+2");
    expect(csvCell("\r=2+2")).toBe('"\'\r=2+2"');
  });

  it("仍按 CSV 规则转义引号和换行", () => {
    expect(csvCell('杭州,"滨江"\n网商路')).toBe('"杭州,""滨江""\n网商路"');
  });
});
