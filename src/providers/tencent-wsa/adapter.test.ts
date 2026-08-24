import { describe, expect, it } from "vitest";
import { mapTencentWsaResponse } from "./adapter";

describe("Tencent WSA mapping contract", () => {
  it("maps only documented link evidence fields", () => {
    const mapped = mapTencentWsaResponse({
      companyName: "某某测试有限公司",
      claimType: "news",
      retrievedAt: "2026-08-20T08:00:00.000Z",
      raw: {
        Response: {
          Query: "某某测试有限公司 新闻",
          Version: "standard",
          RequestId: "request-for-test-only",
          Pages: [
            JSON.stringify({
              title: "<em>某某测试有限公司</em>发布新产品",
              url: "https://example.test/news#tracking",
              date: "2026/08/19 09:30:00",
              passage: "这是用于合同测试的虚构摘要。",
              content: "不应落库的动态全文",
              site: "虚构测试站点",
              score: 0.82,
              authority_level: 3,
              api_key: "must-not-survive",
            }),
          ],
        },
      },
    });

    expect(mapped.evidence).toEqual([
      expect.objectContaining({
        companyName: "某某测试有限公司",
        title: "某某测试有限公司发布新产品",
        url: "https://example.test/news",
        publishedAt: "2026-08-19T01:30:00.000Z",
        confidence: 0.82,
        usageScope: "link_only",
      }),
    ]);
    expect(JSON.stringify(mapped.sanitizedPages)).not.toContain("content");
    expect(JSON.stringify(mapped)).not.toContain("must-not-survive");
  });

  it("drops malformed and duplicate URLs without inventing evidence", () => {
    const mapped = mapTencentWsaResponse({
      companyName: "某某测试有限公司",
      claimType: "other",
      retrievedAt: "2026-08-20T08:00:00.000Z",
      raw: {
        Pages: [
          "not-json",
          JSON.stringify({ title: "无效协议", url: "javascript:alert(1)" }),
          JSON.stringify({ title: "结果", url: "https://example.test/a" }),
          JSON.stringify({
            title: "重复",
            url: "https://example.test/a#again",
          }),
        ],
      },
    });
    expect(mapped.evidence).toHaveLength(1);
  });
});
