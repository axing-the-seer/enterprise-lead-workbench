import { WorkerError } from "./errors";
import { z } from "zod";
import { canonicalizeCatalogSelections } from "./kc-catalog";

const DEFAULT_ORIGIN = "https://loan.kdbank.cn";
const API_PREFIX = "/fcloud/flow-user/workbuddySkill";
const API_KEY_PATTERN =
  /^kc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rangeSchema = z
  .object({
    min: z.number().finite().nonnegative().optional(),
    max: z.number().finite().nonnegative().optional(),
  })
  .strict()
  .refine(
    (value) => value.min !== undefined || value.max !== undefined,
    "区间至少填写一个边界",
  )
  .refine(
    (value) =>
      value.min === undefined ||
      value.max === undefined ||
      value.min <= value.max,
    "区间下限不能大于上限",
  );

const dateRangeSchema = z
  .object({ start: z.iso.date(), end: z.iso.date() })
  .strict()
  .refine((value) => value.start <= value.end, "日期起点不能晚于终点");

const catalogSelectionSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    providerValues: z.array(z.string().trim().min(2).max(120)).min(1).max(500),
  })
  .strict();

const kcSearchCriteriaSchema = z
  .object({
    keyword: z.string().trim().min(2).max(100).optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(10).default(10),
    regions: z.array(catalogSelectionSchema).max(20).optional(),
    industries: z.array(catalogSelectionSchema).max(100).optional(),
    statuses: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
    enterpriseTypes: z
      .array(z.enum(["individual", "cooperative", "company"]))
      .max(2)
      .refine(
        (value) => new Set(value).size === value.length,
        "企业类型不能重复",
      )
      .optional(),
    contactRequirements: z
      .array(z.enum(["phone", "email"]))
      .max(2)
      .optional(),
    riskFlags: z
      .object({
        businessAbnormal: z.enum(["has", "none"]).optional(),
        equityFreeze: z.enum(["has", "none"]).optional(),
        severeViolation: z.enum(["has", "none"]).optional(),
        administrativePenalty: z.enum(["has", "none"]).optional(),
      })
      .strict()
      .optional(),
    qualificationTags: z
      .array(z.string().trim().min(1).max(80))
      .max(50)
      .optional(),
    actualOperatingOnly: z.boolean().optional(),
    smallBusinessOnly: z.boolean().optional(),
    registeredCapitalWan: z.array(rangeSchema).max(10).optional(),
    insuredCount: z.array(rangeSchema).max(10).optional(),
    legalPersonSharePercent: z.array(rangeSchema).max(10).optional(),
    establishedBetween: z.array(dateRangeSchema).max(10).optional(),
    legalChangedBetween: z.array(dateRangeSchema).max(10).optional(),
    legalUnchangedBetween: z.array(dateRangeSchema).max(10).optional(),
  })
  .strict();

export type KcSearchCriteria = z.infer<typeof kcSearchCriteriaSchema>;

function safeOrigin(configured: unknown): string {
  const origin = typeof configured === "string" ? configured : DEFAULT_ORIGIN;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new WorkerError("KC_BASE_URL_INVALID", "获客助手服务地址无效。");
  }
  const allowedHosts = new Set([
    "loan.kdbank.cn",
    ...(process.env.KC_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLocaleLowerCase("en-US"))
      .filter(Boolean),
  ]);
  if (
    parsed.protocol !== "https:" ||
    !allowedHosts.has(parsed.hostname.toLocaleLowerCase("en-US"))
  ) {
    throw new WorkerError(
      "KC_BASE_URL_NOT_ALLOWED",
      "获客助手服务地址不在部署白名单中。",
    );
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new WorkerError(
      "KC_BASE_URL_INVALID",
      "获客助手服务地址不能携带凭证或查询参数。",
    );
  }
  return parsed.origin;
}

export function resolveEnvironmentSecret(
  reference: string | null,
): string | null {
  if (!reference) return null;
  if (!reference.startsWith("env://")) {
    throw new WorkerError(
      "SECRET_REFERENCE_UNSUPPORTED",
      "当前自托管执行器只接受 env:// 环境变量凭证引用。",
    );
  }
  const variable = reference.slice("env://".length);
  if (!/^[A-Z][A-Z0-9_]{2,80}$/.test(variable)) {
    throw new WorkerError("SECRET_REFERENCE_INVALID", "凭证引用格式无效。");
  }
  const value = process.env[variable]?.trim();
  if (!value)
    throw new WorkerError("SECRET_NOT_CONFIGURED", "部署环境尚未配置该凭证。");
  return value;
}

function validateApiKey(value: string | null): string | null {
  if (value === null) return null;
  if (!API_KEY_PATTERN.test(value)) {
    throw new WorkerError("KC_API_KEY_INVALID", "获客助手凭证格式无效。");
  }
  return value;
}

function validateSearchCriteria(
  input: Record<string, unknown>,
): KcSearchCriteria {
  const parsed = kcSearchCriteriaSchema.safeParse(input);
  if (!parsed.success) {
    throw new WorkerError(
      "KC_QUERY_INVALID",
      `获客助手查询条件无效：${parsed.error.issues[0]?.message ?? "请检查填写内容"}`,
    );
  }
  const value = parsed.data;
  const hasAnchor = Boolean(
    value.keyword ||
      value.regions?.length ||
      value.industries?.length ||
      value.statuses?.length ||
      value.enterpriseTypes?.length ||
      value.contactRequirements?.length ||
      value.riskFlags ||
      value.qualificationTags?.length ||
      value.actualOperatingOnly ||
      value.smallBusinessOnly ||
      value.registeredCapitalWan?.length ||
      value.insuredCount?.length ||
      value.legalPersonSharePercent?.length ||
      value.establishedBetween?.length ||
      value.legalChangedBetween?.length ||
      value.legalUnchangedBetween?.length,
  );
  if (!hasAnchor) {
    throw new WorkerError(
      "KC_QUERY_ANCHOR_REQUIRED",
      "至少需要一个明确的企业筛选条件。",
    );
  }
  return value;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function toProviderFilter(criteria: KcSearchCriteria): Record<string, unknown> {
  const enterpriseTypes = {
    individual: 1,
    cooperative: 2,
    company: 3,
  } as const;
  const contacts = { phone: 1, email: 2 } as const;
  const riskCodes = {
    businessAbnormal: { none: 10, has: 11 },
    equityFreeze: { none: 20, has: 21 },
    severeViolation: { none: 30, has: 31 },
    administrativePenalty: { none: 40, has: 41 },
  } as const;
  const filter: Record<string, unknown> = { keyword: criteria.keyword ?? "" };
  if (criteria.regions?.length) {
    const regions = canonicalizeCatalogSelections("regions", criteria.regions);
    filter.region = unique(
      regions?.flatMap((selection) => selection.providerValues) ?? [],
    );
  }
  if (criteria.industries?.length) {
    const industries = canonicalizeCatalogSelections(
      "industries",
      criteria.industries,
    );
    filter.industry = unique(
      industries?.flatMap((selection) => selection.providerValues) ?? [],
    );
  }
  if (criteria.statuses?.length) filter.status = unique(criteria.statuses);
  if (criteria.enterpriseTypes?.length) {
    filter.enpType = criteria.enterpriseTypes.map(
      (value) => enterpriseTypes[value],
    );
  }
  if (criteria.contactRequirements?.length) {
    filter.contact = [...new Set(criteria.contactRequirements)].map(
      (value) => contacts[value],
    );
  }
  if (criteria.riskFlags) {
    filter.badNews = Object.entries(criteria.riskFlags).map(
      ([dimension, state]) =>
        riskCodes[dimension as keyof typeof riskCodes][state as "has" | "none"],
    );
  }
  const qualificationTags = [...(criteria.qualificationTags ?? [])];
  if (criteria.smallBusinessOnly) qualificationTags.push("小微企业");
  if (qualificationTags.length) filter.honorList = unique(qualificationTags);
  if (criteria.actualOperatingOnly) filter.isActualOperate = 1;
  if (criteria.registeredCapitalWan?.length)
    filter.capitalNum = criteria.registeredCapitalWan;
  if (criteria.insuredCount?.length) filter.insuredNum = criteria.insuredCount;
  if (criteria.legalPersonSharePercent?.length) {
    filter.stockProportion = criteria.legalPersonSharePercent;
  }
  if (criteria.establishedBetween?.length)
    filter.establishDate = criteria.establishedBetween;
  if (criteria.legalChangedBetween?.length)
    filter.legalChange = criteria.legalChangedBetween;
  if (criteria.legalUnchangedBetween?.length)
    filter.legalNoChange = criteria.legalUnchangedBetween;
  return filter;
}

export class KcApiClient {
  private readonly origin: string;
  private readonly apiKey: string | null;

  constructor(options: { baseUrl?: unknown; secretReference: string | null }) {
    this.origin = safeOrigin(options.baseUrl);
    this.apiKey = validateApiKey(
      resolveEnvironmentSecret(options.secretReference),
    );
  }

  configurationStatus() {
    return {
      originHost: new URL(this.origin).hostname,
      credentialMode: this.apiKey ? "configured" : "free_tier",
    };
  }

  async searchCompanies(input: Record<string, unknown>): Promise<unknown> {
    const criteria = validateSearchCriteria(input);
    return this.request("/searchCompany", {
      page: criteria.page,
      limit: criteria.pageSize,
      filter: toProviderFilter(criteria),
    });
  }

  async checkRisk(searchKey: string): Promise<unknown> {
    const normalized = searchKey.trim();
    if (
      normalized.length < 2 ||
      normalized.length > 100 ||
      [...normalized].some((character) => character.charCodeAt(0) < 32)
    ) {
      throw new WorkerError("KC_QUERY_INVALID", "企业名称或信用代码格式无效。");
    }
    return this.request("/checkRisk", { keyword: normalized }, true);
  }

  private async request(
    path: "/searchCompany" | "/checkRisk",
    body: Record<string, unknown>,
    retainEnvelope = false,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    try {
      const response = await fetch(`${this.origin}${API_PREFIX}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...(this.apiKey ? { cloudToken: this.apiKey } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: "error",
      });
      const result = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (!response.ok || !result) {
        throw new WorkerError(
          response.status === 401 || response.status === 403
            ? "KC_AUTH_FAILED"
            : "KC_HTTP_FAILED",
          response.status === 401 || response.status === 403
            ? "获客助手鉴权失败。"
            : `获客助手请求失败（HTTP ${response.status}）。`,
        );
      }
      const code = result.code;
      if (code !== 0 && code !== 200) {
        const message =
          typeof result.msg === "string" ? result.msg : "服务返回异常";
        const exhausted = message.includes("今日免费额度已用完");
        throw new WorkerError(
          exhausted ? "KC_FREE_TIER_EXHAUSTED" : "KC_PROVIDER_REJECTED",
          exhausted
            ? "获客助手今日免费额度已用完，请配置已授权凭证。"
            : message,
        );
      }
      return retainEnvelope ? result : result.data;
    } catch (error) {
      if (error instanceof WorkerError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new WorkerError("KC_TIMEOUT", "获客助手查询超时，请稍后重试。");
      }
      throw new WorkerError("KC_UNAVAILABLE", "获客助手服务暂时不可用。");
    } finally {
      clearTimeout(timeout);
    }
  }
}
