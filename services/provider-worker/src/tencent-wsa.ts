import { z } from "zod";
import { WebClaimTypeSchema, type WebClaimType } from "../../../src/providers";
import { WorkerError } from "./errors";
import { resolveEnvironmentSecret } from "./kc-api";

export const TENCENT_WSA_ENDPOINT =
  "https://api.wsa.cloud.tencent.com/SearchPro";

const EvidenceCriteriaSchema = z
  .object({
    companyId: z.union([
      z.number().int().positive(),
      z.string().regex(/^[1-9][0-9]{0,18}$/),
    ]),
    claimType: WebClaimTypeSchema,
    extraKeywords: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
    site: z
      .string()
      .trim()
      .max(253)
      .regex(
        /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i,
      )
      .optional(),
    maxResults: z.number().int().min(1).max(10).default(10),
  })
  .strict();

export type TencentWsaEvidenceCriteria = z.infer<typeof EvidenceCriteriaSchema>;

const claimKeywords: Record<WebClaimType, string> = {
  official_website: "官方网站 官网",
  product: "产品 服务",
  award: "获奖 荣誉",
  tender: "招标 中标",
  recruiting: "招聘",
  news: "新闻 动态",
  other: "",
};

function fixedEndpoint(configured: unknown): string {
  if (configured === undefined || configured === null || configured === "") {
    return TENCENT_WSA_ENDPOINT;
  }
  if (configured !== TENCENT_WSA_ENDPOINT) {
    throw new WorkerError(
      "WEB_SEARCH_ENDPOINT_NOT_ALLOWED",
      "Web 证据执行器只允许腾讯云 WSA 固定服务地址。",
    );
  }
  return TENCENT_WSA_ENDPOINT;
}

function credential(reference: string | null): string {
  if (reference !== "env://TENCENTCLOUD_WSA_APIKEY") {
    throw new WorkerError(
      "WEB_SEARCH_SECRET_REFERENCE_INVALID",
      "Web 证据必须使用服务器变量 TENCENTCLOUD_WSA_APIKEY。",
    );
  }
  const value = resolveEnvironmentSecret(reference);
  if (!value || value.length < 16 || value.length > 512 || /\s/.test(value)) {
    throw new WorkerError(
      "WEB_SEARCH_API_KEY_INVALID",
      "腾讯云 WSA 服务 API KEY 格式无效。",
    );
  }
  return value;
}

export function validateTencentWsaCriteria(
  input: Record<string, unknown>,
): TencentWsaEvidenceCriteria {
  const parsed = EvidenceCriteriaSchema.safeParse(input);
  if (!parsed.success) {
    throw new WorkerError(
      "WEB_SEARCH_QUERY_INVALID",
      `Web 证据查询条件无效：${parsed.error.issues[0]?.message ?? "请检查填写内容"}`,
    );
  }
  return parsed.data;
}

export function buildTencentWsaQuery(input: {
  companyName: string;
  creditCode?: string | null;
  claimType: WebClaimType;
  extraKeywords?: string[];
}): string {
  const companyName = input.companyName.replace(/["\r\n]/g, " ").trim();
  if (companyName.length < 2 || companyName.length > 200) {
    throw new WorkerError(
      "WEB_SEARCH_COMPANY_INVALID",
      "企业名称不适合发起 Web 证据检索。",
    );
  }
  const parts = [`"${companyName}"`];
  if (input.creditCode && /^[0-9A-Z]{18}$/.test(input.creditCode)) {
    parts.push(input.creditCode);
  }
  const category = claimKeywords[input.claimType];
  if (category) parts.push(category);
  const extras = [...new Set(input.extraKeywords ?? [])]
    .map((item) => item.replace(/["\r\n]/g, " ").trim())
    .filter(Boolean);
  parts.push(...extras);
  const query = parts.join(" ").replace(/\s+/g, " ").trim();
  if (query.length > 400) {
    throw new WorkerError(
      "WEB_SEARCH_QUERY_TOO_LONG",
      "Web 证据检索词过长，请减少附加关键词。",
    );
  }
  return query;
}

export class TencentWsaClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: {
    endpoint?: unknown;
    secretReference: string | null;
    fetchImpl?: typeof fetch;
  }) {
    this.endpoint = fixedEndpoint(options.endpoint);
    this.apiKey = credential(options.secretReference);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  configurationStatus() {
    return {
      endpointHost: new URL(this.endpoint).hostname,
      credentialMode: "server_environment",
      apiProduct: "Tencent Cloud WSA SearchPro",
    };
  }

  async search(input: { query: string; site?: string }): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          Query: input.query,
          Mode: 0,
          ...(input.site ? { Site: input.site } : {}),
        }),
        signal: controller.signal,
        redirect: "error",
      });
      const body = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (!response.ok || !body) {
        throw new WorkerError(
          response.status === 401 || response.status === 403
            ? "WEB_SEARCH_AUTH_FAILED"
            : response.status === 429
              ? "WEB_SEARCH_RATE_LIMITED"
              : "WEB_SEARCH_HTTP_FAILED",
          response.status === 401 || response.status === 403
            ? "腾讯云 WSA 鉴权失败。"
            : response.status === 429
              ? "腾讯云 WSA 当前请求过于频繁。"
              : `腾讯云 WSA 请求失败（HTTP ${response.status}）。`,
        );
      }
      const responseBody =
        body.Response &&
        typeof body.Response === "object" &&
        !Array.isArray(body.Response)
          ? (body.Response as Record<string, unknown>)
          : body;
      const error = responseBody.Error;
      if (error && typeof error === "object" && !Array.isArray(error)) {
        const code = String((error as Record<string, unknown>).Code ?? "");
        throw new WorkerError(
          code === "UnauthorizedOperation"
            ? "WEB_SEARCH_AUTH_FAILED"
            : code === "RequestLimitExceeded"
              ? "WEB_SEARCH_RATE_LIMITED"
              : "WEB_SEARCH_PROVIDER_REJECTED",
          code === "UnauthorizedOperation"
            ? "腾讯云 WSA 未授权或服务密钥无效。"
            : code === "RequestLimitExceeded"
              ? "腾讯云 WSA 超过当前频率限制。"
              : "腾讯云 WSA 拒绝了本次检索。",
        );
      }
      return body;
    } catch (error) {
      if (error instanceof WorkerError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new WorkerError(
          "WEB_SEARCH_TIMEOUT",
          "腾讯云 WSA 检索超时，请稍后重试。",
        );
      }
      throw new WorkerError(
        "WEB_SEARCH_UNAVAILABLE",
        "腾讯云 WSA 服务暂时不可用。",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
