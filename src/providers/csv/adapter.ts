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

type ColumnSpec = string | readonly string[];
type RegisteredCapitalUnit = "wan_cny" | "cny" | "million_cny" | "yi_cny";

export type CsvColumnMapping = {
  companyName?: ColumnSpec;
  creditCode?: ColumnSpec;
  legalPerson?: ColumnSpec;
  legalChangeDate?: ColumnSpec;
  legalPersonSharePercent?: ColumnSpec;
  companyType?: ColumnSpec;
  registeredCapital?: ColumnSpec;
  paidInCapital?: ColumnSpec;
  establishedDate?: ColumnSpec;
  approvedDate?: ColumnSpec;
  registrationAuthority?: ColumnSpec;
  status?: ColumnSpec;
  industryL1?: ColumnSpec;
  industryL2?: ColumnSpec;
  regionRaw?: ColumnSpec;
  province?: ColumnSpec;
  city?: ColumnSpec;
  district?: ColumnSpec;
  personnelScale?: ColumnSpec;
  insuredCount?: ColumnSpec;
  registeredAddress?: ColumnSpec;
  businessScope?: ColumnSpec;
  phone?: ColumnSpec;
  email?: ColumnSpec;
  phoneCount?: ColumnSpec;
  emailCount?: ColumnSpec;
  qualificationTags?: ColumnSpec;
  riskTags?: ColumnSpec;
  operationalTags?: ColumnSpec;
};

export type CsvMappingConfig = {
  columns?: CsvColumnMapping;
  units?: {
    registeredCapital?: RegisteredCapitalUnit;
    paidInCapital?: RegisteredCapitalUnit;
    legalPersonShare?: "percent" | "ratio";
  };
  providerId?: string;
  providerName?: string;
  retrievedAt?: string;
  sourceFileName?: string;
  channel?: "customer_upload" | "customer_system";
  usageScope?: Provenance["usageScope"];
  tagSeparator?: RegExp | string;
};

export const DEFAULT_CSV_COLUMNS: Required<CsvColumnMapping> = {
  companyName: ["企业名称", "公司名称", "客户主体名称", "companyName"],
  creditCode: [
    "统一社会信用代码",
    "统一信用代码",
    "信用代码",
    "creditCode",
    "taxId",
  ],
  legalPerson: ["法定代表人", "法人", "legalPerson"],
  legalChangeDate: ["法人变更日期", "legalChangeDate"],
  legalPersonSharePercent: [
    "法人持股比例",
    "legalPersonSharePercent",
    "stockProportion",
  ],
  companyType: ["企业类型", "组织形式", "companyType"],
  registeredCapital: [
    "注册资本（万元）",
    "注册资本(万元)",
    "注册资本（元）",
    "注册资本(元)",
    "注册资金",
    "注册资本",
    "registeredCapitalWan",
    "registeredCapital",
    "capitalNum",
  ],
  paidInCapital: [
    "实缴资本（万元）",
    "实缴资本(万元)",
    "实缴资本（元）",
    "实缴资本(元)",
    "实缴资本",
    "paidInCapital",
  ],
  establishedDate: ["成立日期", "成立时间", "establishedDate", "establishDate"],
  approvedDate: ["核准日期", "最后核准日期", "approvedDate"],
  registrationAuthority: ["登记机关", "登记单位", "registrationAuthority"],
  status: ["经营状态", "企业状态", "登记状态", "status"],
  industryL1: ["一级行业", "行业门类", "industryL1", "idy1"],
  industryL2: ["二级行业", "所属行业", "国标行业", "industryL2", "idy2"],
  regionRaw: ["所属地区", "地区", "region"],
  province: ["省份", "省", "province"],
  city: ["城市", "市", "city"],
  district: ["区县", "区/县", "district"],
  personnelScale: ["人员规模", "人员规模区间", "personnelScale"],
  insuredCount: ["参保人数", "社保人数", "insuredCount", "insuredNum"],
  registeredAddress: [
    "注册地址",
    "企业地址",
    "地址",
    "registeredAddress",
    "address",
  ],
  businessScope: ["经营范围", "businessScope"],
  phone: ["联系电话", "电话", "phone"],
  email: ["联系邮箱", "邮箱", "email"],
  phoneCount: ["电话数量", "phoneCount", "phoneNum"],
  emailCount: ["邮箱数量", "emailCount", "emailNum"],
  qualificationTags: ["资质标签", "企业资质", "qualificationTags"],
  riskTags: ["风险标签", "风险提示", "riskTags"],
  operationalTags: ["经营标签", "业务标签", "operationalTags"],
};

type ResolvedCell = { column: string | null; value: unknown };
type ResolvedCells = Record<keyof Required<CsvColumnMapping>, ResolvedCell>;

function resolveCell(
  row: Record<string, unknown>,
  spec: ColumnSpec,
): ResolvedCell {
  const candidates = typeof spec === "string" ? [spec] : [...spec];
  const column = candidates.find((candidate) =>
    Object.prototype.hasOwnProperty.call(row, candidate),
  );
  return column
    ? { column, value: row[column] }
    : { column: null, value: undefined };
}

function resolveCells(
  row: Record<string, unknown>,
  columns: Required<CsvColumnMapping>,
): ResolvedCells {
  return Object.fromEntries(
    Object.entries(columns).map(([key, spec]) => [key, resolveCell(row, spec)]),
  ) as ResolvedCells;
}

function splitTags(value: unknown, separator: RegExp | string): string[] {
  if (Array.isArray(value)) return uniqueStrings(value);
  const text = cleanString(value);
  return text ? uniqueStrings(text.split(separator)) : [];
}

function inferCapitalUnit(
  configured: RegisteredCapitalUnit | undefined,
  column: string | null,
  raw: unknown,
): RegisteredCapitalUnit | null {
  if (configured) return configured;
  const explicitText = `${column ?? ""} ${typeof raw === "string" ? raw : ""}`;
  if (/(亿元|亿人民币)/.test(explicitText)) return "yi_cny";
  if (/(百万元|百万人民币)/.test(explicitText)) return "million_cny";
  if (/(万元|万人民币|registeredCapitalWan)/i.test(explicitText))
    return "wan_cny";
  if (/(（元）|\(元\)|人民币元|CNY)/i.test(explicitText)) return "cny";
  return null;
}

function cellNullMeaning(cell: ResolvedCell): Provenance["nullMeaning"] {
  return cell.column ? nullMeaning(cell.value) : "not_collected";
}

function parseCapital(
  cell: ResolvedCell,
  configuredUnit: RegisteredCapitalUnit | undefined,
): {
  valueWan: number | null;
  raw: string | number | null;
  nullMeaning: Provenance["nullMeaning"];
} {
  const raw =
    typeof cell.value === "string" || typeof cell.value === "number"
      ? cell.value
      : null;
  const numeric = finiteNumber(
    typeof raw === "string" ? raw.replace(/[^\d.+-]/g, "") : raw,
  );
  const unit = inferCapitalUnit(configuredUnit, cell.column, raw);
  if (numeric === null)
    return { valueWan: null, raw, nullMeaning: cellNullMeaning(cell) };
  if (!unit) return { valueWan: null, raw, nullMeaning: "unknown" };
  const multiplier =
    unit === "cny"
      ? 0.0001
      : unit === "million_cny"
        ? 100
        : unit === "yi_cny"
          ? 10000
          : 1;
  const valueWan = numeric * multiplier;
  return {
    valueWan: valueWan >= 0 ? valueWan : null,
    raw,
    nullMeaning: valueWan >= 0 ? "provided" : "unknown",
  };
}

function parseShare(
  cell: ResolvedCell,
  unit: "percent" | "ratio" | undefined,
): number | null {
  const raw = cleanString(cell.value);
  if (!raw) return null;
  const numeric = finiteNumber(raw.replace("%", ""));
  if (numeric === null) return null;
  const explicitPercent = raw.includes("%") || cell.column?.includes("比例");
  const result = unit === "ratio" && !explicitPercent ? numeric * 100 : numeric;
  return result >= 0 && result <= 100 ? result : null;
}

function csvRiskSnapshot(
  tags: string[],
  retrievedAt: string,
  providerId: string,
): RiskSnapshot {
  const critical = tags.some((tag) => /(严重违法|失信被执行人)/.test(tag));
  const high = tags.some((tag) => /(股权冻结|限制高消费)/.test(tag));
  return {
    asOf: retrievedAt,
    severity: critical
      ? "critical"
      : high
        ? "high"
        : tags.length
          ? "medium"
          : "unknown",
    signals: tags.map((tag) => ({
      code: `uploaded_tag:${tag}`,
      label: tag,
      present: true,
      severity: /(严重违法|失信被执行人)/.test(tag)
        ? "critical"
        : /(股权冻结|限制高消费)/.test(tag)
          ? "high"
          : "medium",
      sourceProviderIds: [providerId],
    })),
    note: "风险标签来自用户文件；其口径和时点应按原数据字典复核。",
  };
}

function sanitizeCsvRaw(cells: ResolvedCells): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, cell] of Object.entries(cells)) {
    if (!cell.column) continue;
    result[cell.column] =
      key === "phone"
        ? maskPhone(cell.value)
        : key === "email"
          ? maskEmail(cell.value)
          : (cell.value ?? null);
  }
  return result;
}

function mapCsvRecord(
  row: Record<string, unknown>,
  config: CsvMappingConfig,
  context: ProviderContext,
): { canonical: Lead; sanitizedRaw: Record<string, unknown> } {
  const columns = { ...DEFAULT_CSV_COLUMNS, ...(config.columns ?? {}) };
  const cells = resolveCells(row, columns);
  const companyName = cleanString(cells.companyName.value);
  if (!companyName) throw new Error("CSV 行缺少企业名称");

  const providerId = config.providerId ?? "csv-upload";
  const providerName =
    context.providerName ?? config.providerName ?? "用户上传文件";
  const channel = config.channel ?? "customer_upload";
  const creditCode = normalizeCreditCode(cells.creditCode.value);
  const capital = parseCapital(
    cells.registeredCapital,
    config.units?.registeredCapital,
  );
  const paidInCapital = parseCapital(
    cells.paidInCapital,
    config.units?.paidInCapital,
  );
  const personnelScale = normalizePersonnelScale(cells.personnelScale.value);
  const separator = config.tagSeparator ?? /[，,;；|/]+/;
  const qualifications = splitTags(cells.qualificationTags.value, separator);
  const riskTags = splitTags(cells.riskTags.value, separator);
  const operationalTags = splitTags(cells.operationalTags.value, separator);

  const fieldMap: Array<
    [
      string,
      keyof Required<CsvColumnMapping>,
      Provenance["unit"],
      Provenance["evidenceClass"],
    ]
  > = [
    ["companyName", "companyName", "text", "customer_assertion"],
    ["creditCode", "creditCode", "text", "customer_assertion"],
    ["legalPerson", "legalPerson", "text", "customer_assertion"],
    ["legalChangeDate", "legalChangeDate", "date", "customer_assertion"],
    [
      "legalPersonSharePercent",
      "legalPersonSharePercent",
      "percent",
      "customer_assertion",
    ],
    ["companyType", "companyType", "text", "customer_assertion"],
    [
      "registeredCapital.valueWan",
      "registeredCapital",
      "wan_cny",
      "customer_assertion",
    ],
    [
      "paidInCapital.valueWan",
      "paidInCapital",
      "wan_cny",
      "customer_assertion",
    ],
    ["establishedDate", "establishedDate", "date", "customer_assertion"],
    ["approvedDate", "approvedDate", "date", "customer_assertion"],
    [
      "registrationAuthority",
      "registrationAuthority",
      "text",
      "customer_assertion",
    ],
    ["status.normalized", "status", "text", "customer_assertion"],
    ["industry.l1", "industryL1", "text", "customer_assertion"],
    ["industry.l2", "industryL2", "text", "customer_assertion"],
    ["region.raw", "regionRaw", "text", "customer_assertion"],
    ["region.province", "province", "text", "customer_assertion"],
    ["region.city", "city", "text", "customer_assertion"],
    ["region.district", "district", "text", "customer_assertion"],
    ["personnelScale.raw", "personnelScale", "text", "customer_assertion"],
    [
      "personnelScale.lowerBound",
      "personnelScale",
      "person",
      "customer_assertion",
    ],
    [
      "personnelScale.upperBound",
      "personnelScale",
      "person",
      "customer_assertion",
    ],
    ["insuredCount", "insuredCount", "person", "customer_assertion"],
    ["registeredAddress", "registeredAddress", "text", "customer_assertion"],
    ["businessScope", "businessScope", "text", "customer_assertion"],
    ["contact.phoneMasked", "phone", "text", "customer_assertion"],
    ["contact.emailMasked", "email", "text", "customer_assertion"],
    ["tags.qualifications", "qualificationTags", "text", "customer_assertion"],
    ["tags.risk", "riskTags", "text", "customer_assertion"],
    ["tags.operational", "operationalTags", "text", "customer_assertion"],
  ];
  const provenance = fieldMap.map(
    ([fieldPath, key, unit, evidenceClass]): Provenance => ({
      fieldPath,
      providerId,
      providerName,
      channel,
      evidenceClass,
      sourceField: cells[key].column,
      retrievedAt: context.retrievedAt,
      sourceUpdatedAt: null,
      sourceUrl: null,
      unit,
      nullMeaning:
        fieldPath === "registeredCapital.valueWan"
          ? capital.nullMeaning
          : fieldPath === "paidInCapital.valueWan"
            ? paidInCapital.nullMeaning
            : cellNullMeaning(cells[key]),
      confidence: 0.8,
      usageScope: config.usageScope ?? "internal_analysis",
      note: config.sourceFileName ? `来源文件：${config.sourceFileName}` : null,
    }),
  );

  const canonical = LeadSchema.parse({
    leadId: stableLeadId(creditCode, companyName),
    companyName,
    creditCode,
    legalPerson: cleanString(cells.legalPerson.value),
    legalChangeDate: normalizeDate(cells.legalChangeDate.value),
    legalPersonSharePercent: parseShare(
      cells.legalPersonSharePercent,
      config.units?.legalPersonShare,
    ),
    companyType: cleanString(cells.companyType.value),
    registeredCapital: { ...capital, currency: "CNY", unit: "万元" },
    paidInCapital: {
      ...paidInCapital,
      currency: "CNY",
      unit: "万元",
    },
    establishedDate: normalizeDate(cells.establishedDate.value),
    approvedDate: normalizeDate(cells.approvedDate.value),
    registrationAuthority: cleanString(cells.registrationAuthority.value),
    status: normalizeStatus(cells.status.value),
    industry: {
      l1: cleanString(cells.industryL1.value),
      l2: cleanString(cells.industryL2.value),
    },
    region: {
      raw: cleanString(cells.regionRaw.value),
      province: cleanString(cells.province.value),
      city: cleanString(cells.city.value),
      district: cleanString(cells.district.value),
    },
    personnelScale,
    insuredCount: nonNegativeInteger(cells.insuredCount.value),
    registeredAddress: cleanString(cells.registeredAddress.value),
    businessScope: cleanString(cells.businessScope.value),
    contact: {
      phoneMasked: maskPhone(cells.phone.value),
      emailMasked: maskEmail(cells.email.value),
      phoneCount: nonNegativeInteger(cells.phoneCount.value),
      emailCount: nonNegativeInteger(cells.emailCount.value),
      phoneSourceYear: null,
      emailSourceYear: null,
    },
    tags: { qualifications, risk: riskTags, operational: operationalTags },
    riskSnapshot: csvRiskSnapshot(riskTags, context.retrievedAt, providerId),
    providerRiskAssessments: [],
    webEvidence: [],
    provenance,
    conflicts: [],
  });
  return { canonical, sanitizedRaw: sanitizeCsvRaw(cells) };
}

export function createCsvAdapter(
  config: CsvMappingConfig = {},
): ProviderAdapter<Record<string, unknown>, Record<string, never>> {
  return createProviderAdapter({
    descriptor: {
      id: config.providerId ?? "csv-upload",
      name: config.providerName ?? "用户上传文件",
      channel: config.channel ?? "customer_upload",
      capabilities: ["file_import"],
      adapterVersion: "1.0.0",
    },
    normalizeRecord(row, context, _options, sourceIndex) {
      const mapped = mapCsvRecord(row, config, context);
      return {
        sourceIndex,
        sanitizedRaw: mapped.sanitizedRaw,
        canonical: mapped.canonical,
        provenance: mapped.canonical.provenance,
      };
    },
  });
}

export const csvAdapter = createCsvAdapter();

export function normalizeCsvDataset(
  rows: readonly Record<string, unknown>[],
  config: CsvMappingConfig = {},
): Lead[] {
  const adapter = createCsvAdapter(config);
  const context = adapterContext({
    retrievedAt: config.retrievedAt,
    providerName: config.providerName,
  });
  return [...adapter.normalizeBatch(rows, context, {}).canonicalRecords];
}
