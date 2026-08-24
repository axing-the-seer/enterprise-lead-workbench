import type { Company, SourceSnapshot } from "./types";

type UnknownRecord = Record<string, unknown>;

const STATUS_LABELS: Record<string, string> = {
  active: "正常经营",
  cancelled: "已注销",
  revoked: "已吊销",
  suspended: "停业/歇业",
  liquidating: "清算中",
  relocated: "迁移中",
  inactive: "非正常",
  unknown: "状态待核验",
};

const DIRECT_MUNICIPALITIES = ["北京市", "天津市", "上海市", "重庆市"];
const REGION_PATTERN =
  /(北京市|天津市|上海市|重庆市|[^省市区县]{2,8}省|[^省市区县]{2,12}自治区|香港特别行政区|澳门特别行政区)/;

export function enrichCompanyFromSnapshot(
  company: Company,
  snapshot?: SourceSnapshot,
): Company {
  const payload = asRecord(snapshot?.normalized_payload);
  const contact = asRecord(payload.contact);
  const region = asRecord(payload.region);
  const inferredRegion = inferRegion(
    stringValue(company.address) ?? stringValue(payload.registeredAddress),
  );
  const province =
    company.province ?? stringValue(region.province) ?? inferredRegion.province;
  const city = company.city ?? stringValue(region.city) ?? inferredRegion.city;

  return {
    ...company,
    province,
    city,
    district: company.district ?? stringValue(region.district),
    phone_number:
      company.phone_number ?? company.phone ?? stringValue(contact.phoneMasked),
  };
}

export function operatingStatusLabel(value?: string | null) {
  if (!value) return "状态待核验";
  return STATUS_LABELS[value] ?? value;
}

export function isNormalOperatingStatus(value?: string | null) {
  return Boolean(
    value === "active" ||
      (value && /(正常|在业|存续|在营|开业|在册)/.test(value)),
  );
}

export function formatCapitalWan(amountYuan?: number | null, currency = "CNY") {
  if (amountYuan === null || amountYuan === undefined) return null;
  const amountWan = Number(amountYuan) / 10_000;
  if (!Number.isFinite(amountWan)) return null;
  const formatted = amountWan.toLocaleString("zh-CN", {
    maximumFractionDigits: 4,
  });
  return currency === "CNY"
    ? `${formatted} 万元`
    : `${formatted} 万元（${currency}）`;
}

export function displayCompanyRegion(company?: Company | null) {
  if (!company) return null;
  const parts = [company.province, company.city, company.district]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index);
  return parts.join(" ") || null;
}

export function capitalWanValue(amountYuan?: number | null) {
  if (amountYuan === null || amountYuan === undefined) return null;
  const value = Number(amountYuan) / 10_000;
  return Number.isFinite(value) ? value : null;
}

function inferRegion(address?: string | null): {
  province: string | null;
  city: string | null;
} {
  if (!address) return { province: null, city: null };
  const municipality = DIRECT_MUNICIPALITIES.find((name) =>
    address.includes(name.slice(0, 2)),
  );
  if (municipality) return { province: municipality, city: municipality };
  const province = address.match(REGION_PATTERN)?.[1] ?? null;
  return { province, city: null };
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
