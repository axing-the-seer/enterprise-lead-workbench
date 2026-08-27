import type { SourceConnection } from "./types";

export const WEB_SEARCH_PROVIDER = "web_search";
export type PublicReportCriteria = {
  companyId: number;
  claimType: "public_report";
  reportMode: true;
  maxResults: number;
};

export type PublicReportJobPayload = {
  sourceConnectionId: string;
  queryKind: "web_evidence";
  criteria: PublicReportCriteria;
};

export function isReadyWebEvidenceSource(source: SourceConnection) {
  return (
    source.provider === WEB_SEARCH_PROVIDER &&
    (source.status === "ready" || source.status === "degraded")
  );
}

export function buildPublicReportCriteria(input: {
  companyId: string | number;
  maxResults?: number;
}): PublicReportCriteria {
  const companyId = Number(input.companyId);
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new Error("缺少已入库的有效企业标识，不能采集报告资料。");
  }

  const maxResults = input.maxResults ?? 6;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 8) {
    throw new Error("每类资料数必须是 1 到 8 的整数。");
  }

  return {
    companyId,
    claimType: "public_report",
    reportMode: true,
    maxResults,
  };
}

export function buildPublicReportJobPayload(
  sourceConnectionId: string,
  criteria: PublicReportCriteria,
): PublicReportJobPayload {
  if (!sourceConnectionId.trim()) {
    throw new Error("请选择可用的 Ego Lite 资料源。");
  }
  return {
    sourceConnectionId,
    queryKind: "web_evidence",
    criteria,
  };
}
