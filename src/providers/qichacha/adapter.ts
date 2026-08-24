import {
  LeadSchema,
  type Lead,
  type Provenance,
  type RiskSnapshot,
} from "../../domain/types";
import {
  cleanString,
  finiteNumber,
  getPath,
  maskEmail,
  maskPhone,
  nonNegativeInteger,
  normalizeCreditCode,
  normalizeDate,
  normalizePersonnelScale,
  normalizeStatus,
  nullMeaning,
  stableLeadId,
  uniqueStrings,
} from "../../domain/normalize";
import {
  adapterContext,
  createProviderAdapter,
  type ProviderAdapter,
  type ProviderContext,
} from "../contracts";

export const QICHACHA_PROVIDER_ID = "qichacha";
export const QICHACHA_PROVIDER_NAME = "企查查（已授权接口）";

export type QichachaNormalizedStatus = Lead["status"]["normalized"];
type RiskSeverity = RiskSnapshot["signals"][number]["severity"];

export type QichachaRiskScanContract = {
  countsPath: string;
  dimensions: Record<
    string,
    { code: string; label: string; severity: RiskSeverity }
  >;
  expectedDimensionCount: number;
  zeroMeansNoCurrentRecord: boolean;
};

/**
 * QCC surfaces can return different JSON shapes (MCP, CLI and purchased APIs).
 * Every shape must be locked to an explicit, reviewed contract. No source path,
 * unit or status code is inferred inside the adapter.
 */
export type QichachaMappingContract = {
  contractVersion: "1.0";
  apiProduct: string;
  apiVersion: string;
  mappingReviewedAt: string;
  usageScope: Provenance["usageScope"];
  fields: {
    companyName: string;
    creditCode?: string;
    legalPerson?: string;
    legalChangeDate?: string;
    legalPersonSharePercent?: string;
    companyType?: string;
    registeredCapital?: string;
    paidInCapital?: string;
    establishedDate?: string;
    approvedDate?: string;
    registrationAuthority?: string;
    status?: string;
    industryL1?: string;
    industryL2?: string;
    regionRaw?: string;
    province?: string;
    city?: string;
    district?: string;
    personnelScale?: string;
    insuredCount?: string;
    registeredAddress?: string;
    businessScope?: string;
    phone?: string;
    email?: string;
    qualificationTags?: string;
    riskTags?: string;
    operationalTags?: string;
    sourceUpdatedAt?: string;
    sourceUrl?: string;
  };
  units?: {
    registeredCapital?: "wan_cny" | "cny" | "million_cny" | "yi_cny";
    paidInCapital?: "wan_cny" | "cny" | "million_cny" | "yi_cny";
    legalPersonShare?: "percent" | "ratio";
  };
  statusValues?: Record<string, QichachaNormalizedStatus>;
  riskTagSeverities?: Record<string, "medium" | "high" | "critical">;
  riskScan?: QichachaRiskScanContract;
  tagSeparator?: RegExp | string;
  allowContactProcessing?: boolean;
};

export type QichachaAdapterOptions = {
  retrievedAt?: string;
  providerName?: string;
};

export const QICHACHA_CLI_CN_REGISTRATION_CONTRACT: QichachaMappingContract = {
  contractVersion: "1.0",
  apiProduct: "qcc-agent-cli/get_company_registration_info",
  apiVersion: "1.0.10-cn-json",
  mappingReviewedAt: "2026-08-20",
  usageScope: "internal_analysis",
  fields: {
    companyName: "企业名称",
    creditCode: "统一社会信用代码",
    legalPerson: "法定代表人",
    companyType: "企业类型",
    registeredCapital: "注册资本",
    paidInCapital: "实缴资本",
    establishedDate: "成立日期",
    approvedDate: "核准日期",
    registrationAuthority: "登记机关",
    status: "登记状态",
    industryL2: "国标行业",
    regionRaw: "所属地区",
    personnelScale: "人员规模",
    insuredCount: "参保人数",
    registeredAddress: "注册地址",
    businessScope: "经营范围",
    sourceUpdatedAt: "核准日期",
  },
  units: { registeredCapital: "wan_cny", paidInCapital: "wan_cny" },
  statusValues: {
    正常: "active",
    在业: "active",
    存续: "active",
    清算: "liquidating",
    迁入: "relocated",
    迁出: "relocated",
    停业: "suspended",
    歇业: "suspended",
    撤销: "inactive",
    责令关闭: "inactive",
    除名: "inactive",
    吊销: "revoked",
    注销: "cancelled",
    虚假注册: "inactive",
  },
};

function validateContract(contract: QichachaMappingContract): void {
  if (!contract || contract.contractVersion !== "1.0") {
    throw new Error("企查查 adapter 需要版本为 1.0 的显式映射契约");
  }
  if (!cleanString(contract.apiProduct) || !cleanString(contract.apiVersion)) {
    throw new Error("企查查映射契约必须标明已开通的 API 产品名和文档版本");
  }
  if (!cleanString(contract.mappingReviewedAt)) {
    throw new Error("企查查映射契约必须记录最近评审日期");
  }
  if (!cleanString(contract.fields?.companyName)) {
    throw new Error("企查查映射契约必须由官方文档或已验证响应确认企业名称路径");
  }
  if (contract.fields.registeredCapital && !contract.units?.registeredCapital) {
    throw new Error("企查查注册资本字段必须显式声明原始单位，禁止猜测");
  }
  if (contract.fields.paidInCapital && !contract.units?.paidInCapital) {
    throw new Error("企查查实缴资本字段必须显式声明原始单位，禁止猜测");
  }
  if (contract.fields.status && !contract.statusValues) {
    throw new Error("企查查经营状态字段必须提供该产品的值域映射");
  }
  if (contract.fields.riskTags && !contract.riskTagSeverities) {
    throw new Error("企查查风险标签字段必须提供该产品的等级映射");
  }
  if (
    (contract.fields.phone || contract.fields.email) &&
    !contract.allowContactProcessing
  ) {
    throw new Error("企查查联系方式字段需要先确认授权范围并显式开启处理");
  }
  if (!contract.riskScan) return;
  const { countsPath, dimensions, expectedDimensionCount } = contract.riskScan;
  if (!cleanString(countsPath)) {
    throw new Error("企查查风险 scan 必须声明计数对象的响应路径");
  }
  const entries = Object.entries(dimensions ?? {});
  if (!Number.isInteger(expectedDimensionCount) || expectedDimensionCount < 1) {
    throw new Error("企查查风险 scan 必须声明正整数维度数");
  }
  if (entries.length !== expectedDimensionCount) {
    throw new Error("企查查风险 scan 维度映射数与契约期望不一致");
  }
  if (
    entries.some(
      ([key, dimension]) =>
        !cleanString(key) ||
        !cleanString(dimension.code) ||
        !cleanString(dimension.label) ||
        !cleanString(dimension.severity),
    )
  ) {
    throw new Error(
      "企查查风险 scan 的每个原始维度都必须映射 code、名称和等级",
    );
  }
}

function arrayFrom(value: unknown, separator: RegExp | string): string[] {
  if (Array.isArray(value)) return uniqueStrings(value);
  const text = cleanString(value);
  return text ? uniqueStrings(text.split(separator)) : [];
}

function toWan(
  value: unknown,
  unit: "wan_cny" | "cny" | "million_cny" | "yi_cny" | undefined,
): number | null {
  const numeric = finiteNumber(
    typeof value === "string" ? value.replace(/[^\d.+-]/g, "") : value,
  );
  if (numeric === null || numeric < 0 || !unit) return null;
  const multiplier =
    unit === "cny"
      ? 0.0001
      : unit === "million_cny"
        ? 100
        : unit === "yi_cny"
          ? 10000
          : 1;
  return numeric * multiplier;
}

function parseShare(
  value: unknown,
  unit: "percent" | "ratio" | undefined,
): number | null {
  const raw = cleanString(value);
  if (!raw) return null;
  const numeric = finiteNumber(raw.replace("%", ""));
  if (numeric === null) return null;
  const result =
    unit === "ratio" && !raw.includes("%") ? numeric * 100 : numeric;
  return result >= 0 && result <= 100 ? result : null;
}

function parseRiskScan(
  record: Record<string, unknown>,
  contract: QichachaRiskScanContract | undefined,
): {
  signals: RiskSnapshot["signals"];
  positiveLabels: string[];
  completeAllZero: boolean;
} {
  if (!contract)
    return { signals: [], positiveLabels: [], completeAllZero: false };
  const raw = getPath(record, contract.countsPath);
  if (raw === null || raw === undefined) {
    return { signals: [], positiveLabels: [], completeAllZero: false };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("企查查风险 scan 契约指定的响应必须是维度计数对象");
  }
  const counts = raw as Record<string, unknown>;
  const actualKeys = Object.keys(counts).sort();
  const expectedKeys = Object.keys(contract.dimensions).sort();
  const unknownKeys = actualKeys.filter((key) => !contract.dimensions[key]);
  const missingKeys = expectedKeys.filter(
    (key) => !Object.prototype.hasOwnProperty.call(counts, key),
  );
  if (unknownKeys.length || missingKeys.length) {
    throw new Error(
      `企查查风险 scan 响应维度已漂移；新增 ${unknownKeys.length} 个，缺失 ${missingKeys.length} 个`,
    );
  }
  const signals = expectedKeys.map((key) => {
    const count = nonNegativeInteger(counts[key]);
    if (count === null)
      throw new Error(`企查查风险 scan 维度 ${key} 不是非负整数`);
    const dimension = contract.dimensions[key];
    return {
      code: dimension.code,
      label: dimension.label,
      present: count > 0,
      count,
      severity: dimension.severity,
      sourceProviderIds: [QICHACHA_PROVIDER_ID],
    };
  });
  const positiveLabels = signals
    .filter((signal) => signal.present)
    .map((signal) => signal.label);
  return {
    signals,
    positiveLabels,
    completeAllZero:
      contract.zeroMeansNoCurrentRecord &&
      signals.length === contract.expectedDimensionCount &&
      signals.every((signal) => signal.count === 0),
  };
}

function makeRiskSnapshot(
  explicitTags: string[],
  scanSignals: RiskSnapshot["signals"],
  completeScanAllZero: boolean,
  retrievedAt: string,
  severityMapping: Record<string, "medium" | "high" | "critical">,
): RiskSnapshot {
  const tagSignals: RiskSnapshot["signals"] = explicitTags.map((label) => ({
    code: `qichacha_contract_tag:${label}`,
    label,
    present: true,
    severity: severityMapping[label] ?? "unknown",
    sourceProviderIds: [QICHACHA_PROVIDER_ID],
  }));
  const positive = [
    ...tagSignals,
    ...scanSignals.filter((signal) => signal.present),
  ];
  const rank = {
    unknown: 0,
    info: 1,
    low: 2,
    medium: 3,
    high: 4,
    critical: 5,
  } as const;
  const strongest = positive
    .map((signal) => signal.severity)
    .sort((left, right) => rank[right] - rank[left])[0];
  return {
    asOf: retrievedAt,
    severity: strongest ?? (completeScanAllZero ? "none" : "unknown"),
    signals: [...tagSignals, ...scanSignals],
    note: scanSignals.length
      ? "企查查风险扫描只做分诊；单维计数原样保留，禁止跨维求和。"
      : "未调用或未完整返回风险扫描时，风险保持 unknown。",
  };
}

function sanitizeQichachaRaw(
  record: Record<string, unknown>,
  contract: QichachaMappingContract,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [field, path] of Object.entries(contract.fields)) {
    if (!path) continue;
    const value = getPath(record, path);
    sanitized[path] =
      field === "phone"
        ? maskPhone(value)
        : field === "email"
          ? maskEmail(value)
          : (value ?? null);
  }
  if (contract.riskScan) {
    sanitized[contract.riskScan.countsPath] =
      getPath(record, contract.riskScan.countsPath) ?? null;
  }
  return sanitized;
}

function mapRecord(
  record: Record<string, unknown>,
  contract: QichachaMappingContract,
  context: ProviderContext,
): Lead {
  const read = (field: keyof QichachaMappingContract["fields"]): unknown => {
    const path = contract.fields[field];
    return path ? getPath(record, path) : undefined;
  };
  const companyName = cleanString(read("companyName"));
  if (!companyName) throw new Error("缺少契约指定的企业名称");
  const providerName = context.providerName ?? QICHACHA_PROVIDER_NAME;
  const creditCode = normalizeCreditCode(read("creditCode"));
  const rawStatus = cleanString(read("status"));
  const separator = contract.tagSeparator ?? /[，,;；|/]+/;
  const qualifications = arrayFrom(read("qualificationTags"), separator);
  const explicitRiskTags = arrayFrom(read("riskTags"), separator);
  const riskScan = parseRiskScan(record, contract.riskScan);
  const riskTags = uniqueStrings([
    ...explicitRiskTags,
    ...riskScan.positiveLabels,
  ]);
  const operational = arrayFrom(read("operationalTags"), separator);
  const rawCapital = read("registeredCapital");
  const valueWan = toWan(rawCapital, contract.units?.registeredCapital);
  const rawPaidInCapital = read("paidInCapital");
  const paidInValueWan = toWan(rawPaidInCapital, contract.units?.paidInCapital);
  const personnelScale = normalizePersonnelScale(read("personnelScale"));
  const sourceUpdatedAt = cleanString(read("sourceUpdatedAt"));
  const sourceUrlValue = cleanString(read("sourceUrl"));
  const sourceUrl =
    sourceUrlValue && /^https?:\/\//.test(sourceUrlValue)
      ? sourceUrlValue
      : null;

  const fields: Array<
    [
      string,
      keyof QichachaMappingContract["fields"],
      Provenance["unit"],
      Provenance["evidenceClass"],
    ]
  > = [
    ["companyName", "companyName", "text", "registry_fact"],
    ["creditCode", "creditCode", "text", "registry_fact"],
    ["legalPerson", "legalPerson", "text", "registry_fact"],
    ["legalChangeDate", "legalChangeDate", "date", "registry_fact"],
    [
      "legalPersonSharePercent",
      "legalPersonSharePercent",
      "percent",
      "registry_fact",
    ],
    ["companyType", "companyType", "text", "registry_fact"],
    [
      "registeredCapital.valueWan",
      "registeredCapital",
      "wan_cny",
      "registry_fact",
    ],
    ["paidInCapital.valueWan", "paidInCapital", "wan_cny", "registry_fact"],
    ["establishedDate", "establishedDate", "date", "registry_fact"],
    ["approvedDate", "approvedDate", "date", "registry_fact"],
    ["registrationAuthority", "registrationAuthority", "text", "registry_fact"],
    ["status.normalized", "status", "text", "registry_fact"],
    ["industry.l1", "industryL1", "text", "provider_fact"],
    ["industry.l2", "industryL2", "text", "provider_fact"],
    ["region.raw", "regionRaw", "text", "provider_fact"],
    ["region.province", "province", "text", "provider_fact"],
    ["region.city", "city", "text", "provider_fact"],
    ["region.district", "district", "text", "provider_fact"],
    ["personnelScale.raw", "personnelScale", "text", "provider_fact"],
    ["personnelScale.lowerBound", "personnelScale", "person", "provider_fact"],
    ["personnelScale.upperBound", "personnelScale", "person", "provider_fact"],
    ["insuredCount", "insuredCount", "person", "provider_fact"],
    ["registeredAddress", "registeredAddress", "text", "registry_fact"],
    ["businessScope", "businessScope", "text", "registry_fact"],
    ["contact.phoneMasked", "phone", "text", "provider_fact"],
    ["contact.emailMasked", "email", "text", "provider_fact"],
    ["tags.qualifications", "qualificationTags", "text", "provider_tag"],
    ["tags.risk", "riskTags", "text", "provider_tag"],
    ["tags.operational", "operationalTags", "text", "provider_tag"],
  ];
  const provenance = fields
    .filter(([, field]) => Boolean(contract.fields[field]))
    .map(
      ([fieldPath, field, unit, evidenceClass]): Provenance => ({
        fieldPath,
        providerId: QICHACHA_PROVIDER_ID,
        providerName,
        channel: "authorized_api",
        evidenceClass,
        sourceField: contract.fields[field] ?? null,
        retrievedAt: context.retrievedAt,
        sourceUpdatedAt,
        sourceUrl,
        unit,
        nullMeaning:
          fieldPath === "registeredCapital.valueWan"
            ? rawCapital === null || rawCapital === undefined
              ? "not_provided"
              : valueWan === null
                ? "unknown"
                : "provided"
            : fieldPath === "paidInCapital.valueWan"
              ? rawPaidInCapital === null || rawPaidInCapital === undefined
                ? "not_provided"
                : paidInValueWan === null
                  ? "unknown"
                  : "provided"
              : nullMeaning(read(field)),
        confidence: 1,
        usageScope: contract.usageScope,
        note: `映射契约：${contract.apiProduct} / ${contract.apiVersion}`,
      }),
    );
  if (contract.riskScan) {
    const scanValue = getPath(record, contract.riskScan.countsPath);
    const shared = {
      providerId: QICHACHA_PROVIDER_ID,
      providerName,
      channel: "authorized_api" as const,
      evidenceClass: "provider_tag" as const,
      sourceField: contract.riskScan.countsPath,
      retrievedAt: context.retrievedAt,
      sourceUpdatedAt,
      sourceUrl,
      nullMeaning: riskScan.signals.length
        ? ("provided" as const)
        : nullMeaning(scanValue),
      confidence: 1,
      usageScope: contract.usageScope,
      note: `企查查 risk scan；${contract.riskScan.expectedDimensionCount} 维契约，不跨维求和`,
    };
    provenance.push(
      { ...shared, fieldPath: "riskSnapshot.signals", unit: "count" },
      { ...shared, fieldPath: "tags.risk", unit: "text" },
    );
  }

  return LeadSchema.parse({
    leadId: stableLeadId(creditCode, companyName),
    companyName,
    creditCode,
    legalPerson: cleanString(read("legalPerson")),
    legalChangeDate: normalizeDate(read("legalChangeDate")),
    legalPersonSharePercent: parseShare(
      read("legalPersonSharePercent"),
      contract.units?.legalPersonShare,
    ),
    companyType: cleanString(read("companyType")),
    registeredCapital: {
      valueWan,
      raw:
        typeof rawCapital === "string" || typeof rawCapital === "number"
          ? rawCapital
          : null,
      currency: "CNY",
      unit: "万元",
      nullMeaning:
        rawCapital === null || rawCapital === undefined
          ? "not_provided"
          : valueWan === null
            ? "unknown"
            : "provided",
    },
    paidInCapital: {
      valueWan: paidInValueWan,
      raw:
        typeof rawPaidInCapital === "string" ||
        typeof rawPaidInCapital === "number"
          ? rawPaidInCapital
          : null,
      currency: "CNY",
      unit: "万元",
      nullMeaning:
        rawPaidInCapital === null || rawPaidInCapital === undefined
          ? "not_provided"
          : paidInValueWan === null
            ? "unknown"
            : "provided",
    },
    establishedDate: normalizeDate(read("establishedDate")),
    approvedDate: normalizeDate(read("approvedDate")),
    registrationAuthority: cleanString(read("registrationAuthority")),
    status: {
      raw: rawStatus,
      normalized: rawStatus
        ? (contract.statusValues?.[rawStatus] ??
          normalizeStatus(rawStatus).normalized)
        : "unknown",
    },
    industry: {
      l1: cleanString(read("industryL1")),
      l2: cleanString(read("industryL2")),
    },
    region: {
      raw: cleanString(read("regionRaw")),
      province: cleanString(read("province")),
      city: cleanString(read("city")),
      district: cleanString(read("district")),
    },
    personnelScale,
    insuredCount: nonNegativeInteger(read("insuredCount")),
    registeredAddress: cleanString(read("registeredAddress")),
    businessScope: cleanString(read("businessScope")),
    contact: {
      phoneMasked: contract.allowContactProcessing
        ? maskPhone(read("phone"))
        : null,
      emailMasked: contract.allowContactProcessing
        ? maskEmail(read("email"))
        : null,
      phoneCount: null,
      emailCount: null,
      phoneSourceYear: null,
      emailSourceYear: null,
    },
    tags: { qualifications, risk: riskTags, operational },
    riskSnapshot: makeRiskSnapshot(
      explicitRiskTags,
      riskScan.signals,
      riskScan.completeAllZero,
      context.retrievedAt,
      contract.riskTagSeverities ?? {},
    ),
    providerRiskAssessments: [],
    webEvidence: [],
    provenance,
    conflicts: [],
  });
}

export function createQichachaAdapter(
  contract: QichachaMappingContract,
): ProviderAdapter<Record<string, unknown>, Record<string, never>> {
  validateContract(contract);
  return createProviderAdapter({
    descriptor: {
      id: QICHACHA_PROVIDER_ID,
      name: QICHACHA_PROVIDER_NAME,
      channel: "authorized_api",
      capabilities: ["company_registration", "risk_triage"],
      adapterVersion: `1.0.0+${contract.contractVersion}`,
    },
    normalizeRecord(record, context, _options, sourceIndex) {
      const canonical = mapRecord(record, contract, context);
      return {
        sourceIndex,
        sanitizedRaw: sanitizeQichachaRaw(record, contract),
        canonical,
        provenance: canonical.provenance,
      };
    },
  });
}

export const qichachaCliAdapter = createQichachaAdapter(
  QICHACHA_CLI_CN_REGISTRATION_CONTRACT,
);

export function normalizeQichachaDataset(
  records: readonly Record<string, unknown>[],
  contract: QichachaMappingContract,
  options: QichachaAdapterOptions = {},
): Lead[] {
  return [
    ...createQichachaAdapter(contract).normalizeBatch(
      records,
      adapterContext(options),
      {},
    ).canonicalRecords,
  ];
}

export function normalizeQichachaCliDataset(
  records: readonly Record<string, unknown>[],
  options: QichachaAdapterOptions = {},
): Lead[] {
  return [
    ...qichachaCliAdapter.normalizeBatch(records, adapterContext(options), {})
      .canonicalRecords,
  ];
}
