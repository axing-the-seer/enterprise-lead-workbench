import type { SourceConnection } from "./types";
import {
  buildWebEvidenceCriteria,
  buildWebEvidenceJobPayload,
  isReadyWebEvidenceSource,
  TENCENT_WSA_ENDPOINT,
  TENCENT_WSA_SECRET_REFERENCE,
  webSearchConnectionConfiguration,
} from "./webEvidence";

function fictionalSource(provider: string, status: string): SourceConnection {
  return {
    id: `fictional-${provider}-${status}`,
    workspace_id: "fictional-workspace-id",
    provider,
    name: "虚构测试数据源",
    status,
  };
}

describe("Web 证据 GUI 契约", () => {
  it("只选择 ready 或 degraded 的 web_search 连接", () => {
    expect(
      isReadyWebEvidenceSource(fictionalSource("web_search", "ready")),
    ).toBe(true);
    expect(
      isReadyWebEvidenceSource(fictionalSource("web_search", "degraded")),
    ).toBe(true);
    expect(
      isReadyWebEvidenceSource(fictionalSource("web_search", "draft")),
    ).toBe(false);
    expect(isReadyWebEvidenceSource(fictionalSource("qcc", "ready"))).toBe(
      false,
    );
  });

  it("只生成绑定已有企业的正式 criteria", () => {
    const criteria = buildWebEvidenceCriteria({
      companyId: "fictional-company-id",
      claimType: "tender",
      extraKeywordsText: " 虚构产品 , 虚构产品\n虚构项目 ",
      site: " example.invalid ",
      maxResults: 6,
    });

    expect(criteria).toEqual({
      companyId: "fictional-company-id",
      claimType: "tender",
      extraKeywords: ["虚构产品", "虚构项目"],
      site: "example.invalid",
      maxResults: 6,
    });
    expect(
      buildWebEvidenceJobPayload("fictional-web-source-id", criteria),
    ).toEqual({
      sourceConnectionId: "fictional-web-source-id",
      queryKind: "web_evidence",
      criteria,
    });
  });

  it("不接受空企业标识或超界结果数", () => {
    expect(() =>
      buildWebEvidenceCriteria({
        companyId: " ",
        claimType: "news",
      }),
    ).toThrow("缺少已入库企业标识");
    expect(() =>
      buildWebEvidenceCriteria({
        companyId: "fictional-company-id",
        claimType: "news",
        maxResults: 11,
      }),
    ).toThrow("搜索结果数必须是 1 到 10 的整数");
  });

  it("腾讯云 WSA 配置只切换固定服务器凭证引用", () => {
    expect(webSearchConnectionConfiguration(true)).toEqual({
      secretReference: TENCENT_WSA_SECRET_REFERENCE,
      connectionConfig: { endpoint: TENCENT_WSA_ENDPOINT },
    });
    expect(webSearchConnectionConfiguration(false)).toEqual({
      secretReference: null,
      connectionConfig: { endpoint: TENCENT_WSA_ENDPOINT },
    });
  });
});
