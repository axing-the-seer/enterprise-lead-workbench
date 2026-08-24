import { describe, expect, it } from "vitest";
import { buildPublicReportHtml, classifyEvidenceRelevance } from "./ego-report";

describe("Ego Lite public report quality", () => {
  it("distinguishes exact-company evidence from related entities and background", () => {
    expect(
      classifyEvidenceRelevance(
        "上海上药生物医药有限公司",
        "上海上药生物医药有限公司基本情况",
        "成立于 2020 年",
      ),
    ).toBe("exact_company");
    expect(
      classifyEvidenceRelevance(
        "上海上药生物医药有限公司",
        "上海上药生物医药招聘",
        "集团招聘信息",
      ),
    ).toBe("related_entity");
    expect(
      classifyEvidenceRelevance(
        "上海上药生物医药有限公司",
        "生物医药行业观察",
        "产业政策摘要",
      ),
    ).toBe("broad_context");
  });

  it("labels relevance and redirect links in the self-contained HTML", () => {
    const html = buildPublicReportHtml({
      reportId: "ego-v1-test",
      companyName: "测试企业有限公司",
      creditCode: null,
      generatedAt: "2026-08-24T00:00:00.000Z",
      coverage: [
        {
          kind: "official_website",
          query: "测试企业 官网",
          status: "complete",
          note: "完成",
          count: 1,
        },
      ],
      items: [
        {
          kind: "official_website",
          query: "测试企业 官网",
          title: "测试企业有限公司官网",
          url: "https://www.baidu.com/link?url=example",
          snippet: "测试企业有限公司公开介绍",
          sourceName: "官网",
          relevance: "exact_company",
          linkKind: "search_redirect",
        },
      ],
    });
    expect(html).toContain("匹配本企业");
    expect(html).toContain("搜索结果跳转链接");
  });
});
