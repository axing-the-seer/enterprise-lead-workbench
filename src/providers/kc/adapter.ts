import {
  LeadSchema,
  type Lead,
  type Provenance,
  type RiskSnapshot,
} from "../../domain/types";
import {
  classifyProviderTags,
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

export const KC_PROVIDER_ID = "kingdee-credit-kc-assistant";
export const KC_PROVIDER_NAME = "金蝶征信有限公司·获客助手";

export type KcRawRecord = {
  companyName?: unknown;
  taxId?: unknown;
  legalPerson?: unknown;
  capitalNum?: unknown;
  establishDate?: unknown;
  status?: unknown;
  address?: unknown;
  businessScope?: unknown;
  legalChangeDate?: unknown;
  stockProportion?: unknown;
  idy1?: unknown;
  idy2?: unknown;
  insuredNum?: unknown;
  phone?: unknown;
  email?: unknown;
  phoneNum?: unknown;
  emailNum?: unknown;
  phoneSource?: unknown;
  emailSource?: unknown;
  tag?: { blue?: unknown; red?: unknown } | null;
  [key: string]: unknown;
};

export type KcAdapterOptions = {
  retrievedAt?: string;
  providerName?: string;
};

const FIELD_CONFIG: Record<
  string,
  {
    sourceField: string;
    unit: Provenance["unit"];
    evidenceClass?: Provenance["evidenceClass"];
  }
> = {
  companyName: { sourceField: "companyName", unit: "text" },
  creditCode: { sourceField: "taxId", unit: "text" },
  legalPerson: { sourceField: "legalPerson", unit: "text" },
  legalChangeDate: { sourceField: "legalChangeDate", unit: "date" },
  legalPersonSharePercent: { sourceField: "stockProportion", unit: "percent" },
  "registeredCapital.valueWan": { sourceField: "capitalNum", unit: "wan_cny" },
  establishedDate: { sourceField: "establishDate", unit: "date" },
  "status.raw": { sourceField: "status", unit: "text" },
  "status.normalized": { sourceField: "status", unit: "text" },
  "industry.l1": { sourceField: "idy1", unit: "text" },
  "industry.l2": { sourceField: "idy2", unit: "text" },
  insuredCount: { sourceField: "insuredNum", unit: "person" },
  registeredAddress: { sourceField: "address", unit: "text" },
  businessScope: { sourceField: "businessScope", unit: "text" },
  "contact.phoneMasked": { sourceField: "phone", unit: "text" },
  "contact.emailMasked": { sourceField: "email", unit: "text" },
  "contact.phoneCount": { sourceField: "phoneNum", unit: "count" },
  "contact.emailCount": { sourceField: "emailNum", unit: "count" },
  "tags.qualifications": {
    sourceField: "tag.blue",
    unit: "text",
    evidenceClass: "provider_tag",
  },
  "tags.operational": {
    sourceField: "tag.blue",
    unit: "text",
    evidenceClass: "provider_tag",
  },
  "tags.risk": {
    sourceField: "tag.red",
    unit: "text",
    evidenceClass: "provider_tag",
  },
};

function rawValue(record: KcRawRecord, sourceField: string): unknown {
  if (sourceField === "tag.blue") return record.tag?.blue;
  if (sourceField === "tag.red") return record.tag?.red;
  return record[sourceField];
}

function makeProvenance(
  record: KcRawRecord,
  retrievedAt: string,
  providerName: string,
): Provenance[] {
  return Object.entries(FIELD_CONFIG).map(([fieldPath, config]) => {
    const value = rawValue(record, config.sourceField);
    const sourceUpdatedAt =
      config.sourceField === "phone" || config.sourceField === "phoneNum"
        ? cleanString(record.phoneSource)
        : config.sourceField === "email" || config.sourceField === "emailNum"
          ? cleanString(record.emailSource)
          : null;
    return {
      fieldPath,
      providerId: KC_PROVIDER_ID,
      providerName,
      channel: "authorized_api",
      evidenceClass: config.evidenceClass ?? "provider_fact",
      sourceField: config.sourceField,
      retrievedAt,
      sourceUpdatedAt,
      sourceUrl: null,
      unit: config.unit,
      nullMeaning: nullMeaning(value),
      confidence: 1,
      usageScope: "internal_analysis",
      note:
        config.sourceField === "phone" || config.sourceField === "email"
          ? "仅保存供应商返回的脱敏联系方式"
          : null,
    };
  });
}

function parseSharePercent(value: unknown): number | null {
  const text = cleanString(value);
  if (!text) return null;
  const parsed = finiteNumber(text.replace("%", ""));
  return parsed !== null && parsed >= 0 && parsed <= 100 ? parsed : null;
}

const RISK_SEVERITY: Record<string, "medium" | "high" | "critical"> = {
  经营异常: "medium",
  行政处罚: "medium",
  股权冻结: "high",
  限制高消费: "high",
  严重违法: "critical",
  失信被执行人: "critical",
};

function makeRiskSnapshot(
  riskTags: string[],
  retrievedAt: string,
): RiskSnapshot {
  const signals = riskTags.map((label) => ({
    code: `provider_tag:${label}`,
    label,
    present: true,
    severity: RISK_SEVERITY[label] ?? ("medium" as const),
    sourceProviderIds: [KC_PROVIDER_ID],
  }));
  const rank = { none: 0, medium: 1, high: 2, critical: 3 } as const;
  const severity = signals.reduce<"none" | "medium" | "high" | "critical">(
    (current, signal) =>
      rank[signal.severity as keyof typeof rank] > rank[current]
        ? (signal.severity as typeof current)
        : current,
    "none",
  );
  return {
    asOf: retrievedAt,
    severity: riskTags.length > 0 ? severity : "unknown",
    signals,
    note:
      riskTags.length > 0
        ? "风险标签来自获客助手名单记录；重点企业仍应做单企工商司法核验。"
        : "名单记录未返回风险标签不等于已完成完整尽调。",
  };
}

function sanitizeKcRaw(record: KcRawRecord): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const allowed = new Set(
    Object.values(FIELD_CONFIG).map((config) => config.sourceField),
  );
  for (const field of allowed) {
    const value = rawValue(record, field);
    if (field === "phone") sanitized[field] = maskPhone(value);
    else if (field === "email") sanitized[field] = maskEmail(value);
    else sanitized[field] = value ?? null;
  }
  return sanitized;
}

function mapKcRecord(raw: KcRawRecord, context: ProviderContext): Lead {
  const providerName = context.providerName ?? KC_PROVIDER_NAME;
  const companyName = cleanString(raw.companyName);
  if (!companyName)
    throw new Error("获客助手记录缺少企业名称，无法建立名单主体");

  const creditCode = normalizeCreditCode(raw.taxId);
  const blue = Array.isArray(raw.tag?.blue) ? raw.tag.blue : [];
  const red = Array.isArray(raw.tag?.red) ? raw.tag.red : [];
  const classified = classifyProviderTags(blue);
  const riskTags = uniqueStrings(red);
  const capital = finiteNumber(raw.capitalNum);
  const provenance = makeProvenance(raw, context.retrievedAt, providerName);

  return LeadSchema.parse({
    leadId: stableLeadId(creditCode, companyName),
    companyName,
    creditCode,
    legalPerson: cleanString(raw.legalPerson),
    legalChangeDate: normalizeDate(raw.legalChangeDate),
    legalPersonSharePercent: parseSharePercent(raw.stockProportion),
    companyType: null,
    registeredCapital: {
      valueWan: capital !== null && capital >= 0 ? capital : null,
      raw:
        typeof raw.capitalNum === "number" || typeof raw.capitalNum === "string"
          ? raw.capitalNum
          : null,
      currency: "CNY",
      unit: "万元",
      nullMeaning:
        capital !== null && capital < 0
          ? "unknown"
          : nullMeaning(raw.capitalNum),
    },
    paidInCapital: {
      valueWan: null,
      raw: null,
      currency: "CNY",
      unit: "万元",
      nullMeaning: "not_collected",
    },
    establishedDate: normalizeDate(raw.establishDate),
    approvedDate: null,
    registrationAuthority: null,
    status: normalizeStatus(raw.status),
    industry: { l1: cleanString(raw.idy1), l2: cleanString(raw.idy2) },
    region: { raw: null, province: null, city: null, district: null },
    personnelScale: { raw: null, lowerBound: null, upperBound: null },
    insuredCount: nonNegativeInteger(raw.insuredNum),
    registeredAddress: cleanString(raw.address),
    businessScope: cleanString(raw.businessScope),
    contact: {
      phoneMasked: maskPhone(raw.phone),
      emailMasked: maskEmail(raw.email),
      phoneCount: nonNegativeInteger(raw.phoneNum),
      emailCount: nonNegativeInteger(raw.emailNum),
      phoneSourceYear: cleanString(raw.phoneSource),
      emailSourceYear: cleanString(raw.emailSource),
    },
    tags: {
      qualifications: classified.qualifications,
      operational: classified.operational,
      risk: riskTags,
    },
    riskSnapshot: makeRiskSnapshot(riskTags, context.retrievedAt),
    providerRiskAssessments: [],
    webEvidence: [],
    provenance,
    conflicts: [],
  });
}

export const kcAdapter = createProviderAdapter<
  KcRawRecord,
  Record<string, never>
>({
  descriptor: {
    id: KC_PROVIDER_ID,
    name: KC_PROVIDER_NAME,
    channel: "authorized_api",
    capabilities: ["company_search", "company_registration", "risk_triage"],
    adapterVersion: "1.0.0",
  },
  normalizeRecord(raw, context, _options, sourceIndex) {
    const canonical = mapKcRecord(raw, context);
    return {
      sourceIndex,
      sanitizedRaw: sanitizeKcRaw(raw),
      canonical,
      provenance: canonical.provenance,
    };
  },
});

export function normalizeKcRecord(
  raw: KcRawRecord,
  options: KcAdapterOptions = {},
): Lead {
  return kcAdapter.normalizeRecord(raw, adapterContext(options), {}, 0)
    .canonical;
}

export function normalizeKcDataset(
  records: readonly KcRawRecord[],
  options: KcAdapterOptions = {},
): Lead[] {
  return [
    ...kcAdapter.normalizeBatch(records, adapterContext(options), {})
      .canonicalRecords,
  ];
}
