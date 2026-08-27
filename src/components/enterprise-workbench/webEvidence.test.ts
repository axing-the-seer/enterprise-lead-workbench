import type { SourceConnection } from "./types";
import {
  buildPublicReportCriteria,
  buildPublicReportJobPayload,
  isReadyWebEvidenceSource,
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

  it("只生成绑定已有企业的 Ego Lite 报告协议", () => {
    const criteria = buildPublicReportCriteria({
      companyId: "123",
      maxResults: 6,
    });

    expect(criteria).toEqual({
      companyId: 123,
      claimType: "public_report",
      reportMode: true,
      maxResults: 6,
    });
    expect(
      buildPublicReportJobPayload("fictional-web-source-id", criteria),
    ).toEqual({
      sourceConnectionId: "fictional-web-source-id",
      queryKind: "web_evidence",
      criteria,
    });
  });

  it("不接受无效企业标识或超界结果数", () => {
    expect(() =>
      buildPublicReportCriteria({
        companyId: " ",
      }),
    ).toThrow("缺少已入库的有效企业标识");
    expect(() =>
      buildPublicReportCriteria({
        companyId: 123,
        maxResults: 9,
      }),
    ).toThrow("每类资料数必须是 1 到 8 的整数");
  });
});
