import type { SourceConnection } from "./types";

export const WEB_SEARCH_PROVIDER = "web_search";
export const TENCENT_WSA_ENDPOINT =
  "https://api.wsa.cloud.tencent.com/SearchPro";
export const TENCENT_WSA_SECRET_REFERENCE = "env://TENCENTCLOUD_WSA_APIKEY";

export const webEvidenceClaimTypes = [
  "official_website",
  "product",
  "award",
  "tender",
  "recruiting",
  "news",
  "other",
] as const;

export type WebEvidenceClaimType = (typeof webEvidenceClaimTypes)[number];

export type WebEvidenceCriteria = {
  companyId: string;
  claimType: WebEvidenceClaimType;
  extraKeywords?: string[];
  site?: string;
  maxResults?: number;
};

export type WebEvidenceJobPayload = {
  sourceConnectionId: string;
  queryKind: "web_evidence";
  criteria: WebEvidenceCriteria;
};

export function isReadyWebEvidenceSource(source: SourceConnection) {
  return (
    source.provider === WEB_SEARCH_PROVIDER &&
    (source.status === "ready" || source.status === "degraded")
  );
}

export function webSearchConnectionConfiguration(
  useManagedCredential: boolean,
) {
  return {
    secretReference: useManagedCredential ? TENCENT_WSA_SECRET_REFERENCE : null,
    connectionConfig: { endpoint: TENCENT_WSA_ENDPOINT },
  };
}

export function buildWebEvidenceCriteria(input: {
  companyId: string | number;
  claimType: WebEvidenceClaimType;
  extraKeywordsText?: string;
  site?: string;
  maxResults?: number;
}): WebEvidenceCriteria {
  const companyId = String(input.companyId).trim();
  if (!companyId)
    throw new Error("缺少已入库企业标识，不能发起 Web 证据检索。");
  if (!webEvidenceClaimTypes.includes(input.claimType)) {
    throw new Error("请选择有效的证据类型。");
  }
  if (
    input.maxResults !== undefined &&
    (!Number.isInteger(input.maxResults) ||
      input.maxResults < 1 ||
      input.maxResults > 10)
  ) {
    throw new Error("搜索结果数必须是 1 到 10 的整数。");
  }

  const extraKeywords = Array.from(
    new Set(
      (input.extraKeywordsText ?? "")
        .split(/[\n,，、;]/)
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    ),
  );
  const site = input.site?.trim();
  return {
    companyId,
    claimType: input.claimType,
    ...(extraKeywords.length > 0 ? { extraKeywords } : {}),
    ...(site ? { site } : {}),
    ...(input.maxResults !== undefined ? { maxResults: input.maxResults } : {}),
  };
}

export function buildWebEvidenceJobPayload(
  sourceConnectionId: string,
  criteria: WebEvidenceCriteria,
): WebEvidenceJobPayload {
  if (!sourceConnectionId.trim()) {
    throw new Error("请选择可用的 Web 证据数据源。");
  }
  return {
    sourceConnectionId,
    queryKind: "web_evidence",
    criteria,
  };
}
