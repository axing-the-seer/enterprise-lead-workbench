import {
  LeadSchema,
  type Lead,
  type Provenance,
  type RiskSnapshot,
} from "../../domain/types";
import {
  cleanString,
  finiteNumber,
  maskEmail,
  maskPhone,
  nonNegativeInteger,
  normalizeCreditCode,
  normalizeDate,
  normalizeStatus,
  nullMeaning,
  stableLeadId,
  uniqueStrings,
} from "../../domain/normalize";
import {
  adapterContext,
  createProviderAdapter,
  type ProviderContext,
} from "../contracts";
import {
  KC_PROVIDER_ID,
  KC_PROVIDER_NAME,
  type KcAdapterOptions,
} from "./adapter";

export type KcRiskEntInfo = {
  name?: unknown;
  econKind?: unknown;
  registCapi?: unknown;
  address?: unknown;
  scope?: unknown;
  belongOrg?: unknown;
  operName?: unknown;
  startDate?: unknown;
  checkDate?: unknown;
  status?: unknown;
  creditNo?: unknown;
  province?: unknown;
  city?: unknown;
  domains?: unknown;
  abnormalItems?: unknown;
  contact?: { telephone?: unknown; email?: unknown } | null;
  [key: string]: unknown;
};

export type KcRiskEvaluation = {
  score?: unknown;
  level?: unknown;
  number?: unknown;
  riskNotice?: unknown;
  [key: string]: unknown;
};

export type KcRiskRawReport = {
  entInfo?: KcRiskEntInfo | null;
  courtGgList?: unknown;
  wenshuList?: unknown;
  underTaker?: unknown;
  disruptinfo?: unknown;
  overduetaxList?: unknown;
  entcaseList?: unknown;
  mortgageList?: unknown;
  sharesfrosts?: unknown;
  stockpawns?: unknown;
  entEval?: KcRiskEvaluation | null;
  [key: string]: unknown;
};

type KcRiskCategorySourceField =
  | "entInfo.abnormalItems"
  | "courtGgList"
  | "wenshuList"
  | "underTaker"
  | "disruptinfo"
  | "overduetaxList"
  | "entcaseList"
  | "mortgageList"
  | "sharesfrosts"
  | "stockpawns";

type RiskCategory = {
  sourceField: KcRiskCategorySourceField;
  code: string;
  label: string;
};

const RISK_CATEGORIES: readonly RiskCategory[] = [
  {
    sourceField: "entInfo.abnormalItems",
    code: "kc:business_abnormal",
    label: "经营异常",
  },
  {
    sourceField: "entcaseList",
    code: "kc:administrative_penalty",
    label: "行政处罚",
  },
  { sourceField: "overduetaxList", code: "kc:tax_arrears", label: "欠税" },
  { sourceField: "disruptinfo", code: "kc:dishonest", label: "失信被执行人" },
  { sourceField: "underTaker", code: "kc:enforcement", label: "被执行人" },
  {
    sourceField: "courtGgList",
    code: "kc:court_announcement",
    label: "法院公告",
  },
  {
    sourceField: "wenshuList",
    code: "kc:judicial_document",
    label: "裁判文书",
  },
  { sourceField: "sharesfrosts", code: "kc:equity_freeze", label: "股权冻结" },
  { sourceField: "stockpawns", code: "kc:equity_pledge", label: "股权出质" },
  {
    sourceField: "mortgageList",
    code: "kc:chattel_mortgage",
    label: "动产抵押",
  },
];

type CategoryState = {
  category: RiskCategory;
  present: boolean | null;
  count: number | null;
};

function categoryValue(
  report: KcRiskRawReport,
  category: RiskCategory,
): unknown {
  return category.sourceField === "entInfo.abnormalItems"
    ? report.entInfo?.abnormalItems
    : report[category.sourceField];
}

function categoryState(
  report: KcRiskRawReport,
  category: RiskCategory,
): CategoryState {
  const value = categoryValue(report, category);
  if (value === null || value === undefined)
    return { category, present: null, count: null };
  if (Array.isArray(value)) {
    return { category, present: value.length > 0, count: value.length };
  }
  if (typeof value === "object") {
    return {
      category,
      present: Object.keys(value as Record<string, unknown>).length > 0,
      count: null,
    };
  }
  return { category, present: false, count: null };
}

function parseKcCapital(value: unknown): Lead["registeredCapital"] {
  const raw =
    typeof value === "string" || typeof value === "number" ? value : null;
  if (raw === null) {
    return {
      valueWan: null,
      raw: null,
      currency: "CNY",
      unit: "万元",
      nullMeaning: "not_provided",
    };
  }
  const numeric = finiteNumber(
    typeof raw === "string" ? raw.replace(/[^\d.+-]/g, "") : raw,
  );
  const text = typeof raw === "string" ? raw : "";
  const unit = /(亿元|亿人民币)/.test(text)
    ? "yi_cny"
    : /(万元|万人民币)/.test(text)
      ? "wan_cny"
      : /(人民币元|元人民币|CNY|元$)/i.test(text)
        ? "cny"
        : null;
  if (numeric === null || numeric < 0 || !unit) {
    return {
      valueWan: null,
      raw,
      currency: "CNY",
      unit: "万元",
      nullMeaning: "unknown",
    };
  }
  const valueWan =
    unit === "yi_cny"
      ? numeric * 10000
      : unit === "cny"
        ? numeric * 0.0001
        : numeric;
  return {
    valueWan,
    raw,
    currency: "CNY",
    unit: "万元",
    nullMeaning: "provided",
  };
}

function riskNotices(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(
    value.map((notice) => {
      if (
        typeof notice !== "object" ||
        notice === null ||
        Array.isArray(notice)
      )
        return notice;
      const record = notice as Record<string, unknown>;
      return cleanString(record.value) ?? cleanString(record.key);
    }),
  );
}

function makeAssessment(report: KcRiskRawReport, retrievedAt: string) {
  const score = finiteNumber(report.entEval?.score);
  const validScore =
    score !== null && score >= 0 && score <= 1000 ? score : null;
  const grade = cleanString(report.entEval?.level);
  const itemCount = nonNegativeInteger(report.entEval?.number);
  const notices = riskNotices(report.entEval?.riskNotice);
  if (
    validScore === null &&
    !grade &&
    itemCount === null &&
    notices.length === 0
  )
    return [];
  return [
    {
      providerId: KC_PROVIDER_ID,
      score: validScore,
      scaleMin: 0,
      scaleMax: 1000,
      grade,
      itemCount,
      notices,
      assessedAt: retrievedAt,
      note: "供应商评分和评级原样保留；不转换为工作台自有风险结论。",
    },
  ];
}

function makeProvenance(
  report: KcRiskRawReport,
  context: ProviderContext,
  providerName: string,
): Provenance[] {
  const entInfo = report.entInfo ?? {};
  const base: Array<
    [string, string, unknown, Provenance["unit"], Provenance["evidenceClass"]]
  > = [
    ["companyName", "entInfo.name", entInfo.name, "text", "registry_fact"],
    [
      "creditCode",
      "entInfo.creditNo",
      entInfo.creditNo,
      "text",
      "registry_fact",
    ],
    [
      "legalPerson",
      "entInfo.operName",
      entInfo.operName,
      "text",
      "registry_fact",
    ],
    [
      "companyType",
      "entInfo.econKind",
      entInfo.econKind,
      "text",
      "registry_fact",
    ],
    [
      "registeredCapital.valueWan",
      "entInfo.registCapi",
      entInfo.registCapi,
      "wan_cny",
      "registry_fact",
    ],
    [
      "establishedDate",
      "entInfo.startDate",
      entInfo.startDate,
      "date",
      "registry_fact",
    ],
    [
      "approvedDate",
      "entInfo.checkDate",
      entInfo.checkDate,
      "date",
      "registry_fact",
    ],
    [
      "registrationAuthority",
      "entInfo.belongOrg",
      entInfo.belongOrg,
      "text",
      "registry_fact",
    ],
    [
      "status.normalized",
      "entInfo.status",
      entInfo.status,
      "text",
      "registry_fact",
    ],
    [
      "industry.l2",
      "entInfo.domains",
      entInfo.domains,
      "text",
      "provider_fact",
    ],
    [
      "region.province",
      "entInfo.province",
      entInfo.province,
      "text",
      "provider_fact",
    ],
    ["region.city", "entInfo.city", entInfo.city, "text", "provider_fact"],
    [
      "registeredAddress",
      "entInfo.address",
      entInfo.address,
      "text",
      "registry_fact",
    ],
    ["businessScope", "entInfo.scope", entInfo.scope, "text", "registry_fact"],
    [
      "contact.phoneMasked",
      "entInfo.contact.telephone",
      entInfo.contact?.telephone,
      "text",
      "provider_fact",
    ],
    [
      "contact.emailMasked",
      "entInfo.contact.email",
      entInfo.contact?.email,
      "text",
      "provider_fact",
    ],
    [
      "providerRiskAssessments.0.score",
      "entEval.score",
      report.entEval?.score,
      "none",
      "provider_fact",
    ],
    [
      "providerRiskAssessments.0.grade",
      "entEval.level",
      report.entEval?.level,
      "text",
      "provider_fact",
    ],
    [
      "providerRiskAssessments.0.itemCount",
      "entEval.number",
      report.entEval?.number,
      "count",
      "provider_fact",
    ],
    [
      "providerRiskAssessments.0.notices",
      "entEval.riskNotice",
      report.entEval?.riskNotice,
      "text",
      "provider_fact",
    ],
  ];
  const provenance = base.map(
    ([fieldPath, sourceField, raw, unit, evidenceClass]): Provenance => ({
      fieldPath,
      providerId: KC_PROVIDER_ID,
      providerName,
      channel: "authorized_api",
      evidenceClass,
      sourceField,
      retrievedAt: context.retrievedAt,
      sourceUpdatedAt: null,
      sourceUrl: null,
      unit,
      nullMeaning: nullMeaning(raw),
      confidence: 1,
      usageScope: "internal_analysis",
      note: sourceField.startsWith("entInfo.contact")
        ? "仅保存脱敏联系方式"
        : sourceField.startsWith("entEval")
          ? "供应商评价原样保留，不改写为自有结论"
          : null,
    }),
  );
  const categoryStates = RISK_CATEGORIES.map((category) =>
    categoryState(report, category),
  );
  for (const state of categoryStates) {
    const raw = categoryValue(report, state.category);
    const shared = {
      providerId: KC_PROVIDER_ID,
      providerName,
      channel: "authorized_api" as const,
      evidenceClass: "provider_fact" as const,
      sourceField: state.category.sourceField,
      retrievedAt: context.retrievedAt,
      sourceUpdatedAt: null,
      sourceUrl: null,
      nullMeaning: nullMeaning(raw),
      confidence: 1,
      usageScope: "internal_analysis" as const,
      note: "风险区块只映射是否命中和明确列表条数，不自动定性。",
    };
    provenance.push({
      ...shared,
      fieldPath: "riskSnapshot.signals",
      unit: "count",
    });
  }
  provenance.push({
    fieldPath: "tags.risk",
    providerId: KC_PROVIDER_ID,
    providerName,
    channel: "authorized_api",
    evidenceClass: "provider_fact",
    sourceField: RISK_CATEGORIES.map((category) => category.sourceField).join(
      ",",
    ),
    retrievedAt: context.retrievedAt,
    sourceUpdatedAt: null,
    sourceUrl: null,
    unit: "text",
    nullMeaning: categoryStates.every((state) => state.present !== null)
      ? "provided"
      : "not_provided",
    confidence: 1,
    usageScope: "internal_analysis",
    note: "风险标签是已命中区块的并集；任一区块未返回时，空集不表示完整无风险。",
  });
  return provenance;
}

function sanitizeRiskReport(report: KcRiskRawReport): Record<string, unknown> {
  const entInfo = report.entInfo ?? {};
  const categories = Object.fromEntries(
    RISK_CATEGORIES.map((category) => {
      const state = categoryState(report, category);
      return [
        category.sourceField,
        { present: state.present, count: state.count },
      ];
    }),
  );
  return {
    entInfo: {
      name: entInfo.name ?? null,
      econKind: entInfo.econKind ?? null,
      registCapi: entInfo.registCapi ?? null,
      address: entInfo.address ?? null,
      scope: entInfo.scope ?? null,
      belongOrg: entInfo.belongOrg ?? null,
      operName: entInfo.operName ?? null,
      startDate: entInfo.startDate ?? null,
      checkDate: entInfo.checkDate ?? null,
      status: entInfo.status ?? null,
      creditNo: entInfo.creditNo ?? null,
      province: entInfo.province ?? null,
      city: entInfo.city ?? null,
      domains: entInfo.domains ?? null,
      contact: {
        telephone: maskPhone(entInfo.contact?.telephone),
        email: maskEmail(entInfo.contact?.email),
      },
    },
    riskCategories: categories,
    entEval: {
      score: report.entEval?.score ?? null,
      level: report.entEval?.level ?? null,
      number: report.entEval?.number ?? null,
      notices: riskNotices(report.entEval?.riskNotice),
    },
  };
}

function mapRiskReport(
  report: KcRiskRawReport,
  context: ProviderContext,
): Lead {
  const entInfo = report.entInfo;
  const companyName = cleanString(entInfo?.name);
  if (!companyName) throw new Error("获客助手工商司法报告缺少企业名称");
  const providerName = context.providerName ?? KC_PROVIDER_NAME;
  const creditCode = normalizeCreditCode(entInfo?.creditNo);
  const registeredCapital = parseKcCapital(entInfo?.registCapi);
  const states = RISK_CATEGORIES.map((category) =>
    categoryState(report, category),
  );
  const positive = states.filter((state) => state.present === true);
  const signals: RiskSnapshot["signals"] = states.map((state) => ({
    code: state.category.code,
    label: state.category.label,
    present: state.present,
    ...(state.count === null ? {} : { count: state.count }),
    severity: "unknown",
    sourceProviderIds: [KC_PROVIDER_ID],
  }));
  const riskTags = uniqueStrings(positive.map((state) => state.category.label));
  const provenance = makeProvenance(report, context, providerName);

  return LeadSchema.parse({
    leadId: stableLeadId(creditCode, companyName),
    companyName,
    creditCode,
    legalPerson: cleanString(entInfo?.operName),
    legalChangeDate: null,
    legalPersonSharePercent: null,
    companyType: cleanString(entInfo?.econKind),
    registeredCapital,
    paidInCapital: {
      valueWan: null,
      raw: null,
      currency: "CNY",
      unit: "万元",
      nullMeaning: "not_collected",
    },
    establishedDate: normalizeDate(entInfo?.startDate),
    approvedDate: normalizeDate(entInfo?.checkDate),
    registrationAuthority: cleanString(entInfo?.belongOrg),
    status: normalizeStatus(entInfo?.status),
    industry: { l1: null, l2: cleanString(entInfo?.domains) },
    region: {
      raw: null,
      province: cleanString(entInfo?.province),
      city: cleanString(entInfo?.city),
      district: null,
    },
    personnelScale: { raw: null, lowerBound: null, upperBound: null },
    insuredCount: null,
    registeredAddress: cleanString(entInfo?.address),
    businessScope: cleanString(entInfo?.scope),
    contact: {
      phoneMasked: maskPhone(entInfo?.contact?.telephone),
      emailMasked: maskEmail(entInfo?.contact?.email),
      phoneCount: null,
      emailCount: null,
      phoneSourceYear: null,
      emailSourceYear: null,
    },
    tags: { qualifications: [], risk: riskTags, operational: [] },
    riskSnapshot: {
      asOf: context.retrievedAt,
      severity: "unknown",
      signals,
      note:
        positive.length > 0
          ? "工商司法报告返回了风险区块；事件等级未由数据契约定义，保持 unknown。"
          : "未返回风险区块不等于企业无风险；结果可能受产品权限和数据时点影响。",
    },
    providerRiskAssessments: makeAssessment(report, context.retrievedAt),
    webEvidence: [],
    provenance,
    conflicts: [],
  });
}

export const kcRiskAdapter = createProviderAdapter<
  KcRiskRawReport,
  Record<string, never>
>({
  descriptor: {
    id: KC_PROVIDER_ID,
    name: `${KC_PROVIDER_NAME}·工商司法报告`,
    channel: "authorized_api",
    capabilities: ["company_registration", "risk_triage"],
    adapterVersion: "1.0.0",
  },
  normalizeRecord(report, context, _options, sourceIndex) {
    const canonical = mapRiskReport(report, context);
    return {
      sourceIndex,
      sanitizedRaw: sanitizeRiskReport(report),
      canonical,
      provenance: canonical.provenance,
    };
  },
});

export function normalizeKcRiskReport(
  report: KcRiskRawReport,
  options: KcAdapterOptions = {},
): Lead {
  return kcRiskAdapter.normalizeRecord(report, adapterContext(options), {}, 0)
    .canonical;
}
