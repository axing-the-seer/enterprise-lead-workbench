import type { Provenance } from "./types";

export function cleanString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!["string", "number", "boolean", "bigint"].includes(typeof value))
    return null;
  const text = String(value).normalize("NFKC").trim();
  if (!text || ["-", "—", "null", "undefined", "N/A", "暂无"].includes(text))
    return null;
  return text;
}

export function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized =
    typeof value === "string"
      ? value.normalize("NFKC").replaceAll(",", "").trim()
      : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function nonNegativeInteger(value: unknown): number | null {
  const number = finiteNumber(value);
  if (number === null || number < 0 || !Number.isInteger(number)) return null;
  return number;
}

export function normalizeDate(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) return null;
  const match = text
    .replace(/[./]/g, "-")
    .match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeCompanyName(value: unknown): string {
  return (cleanString(value) ?? "")
    .replace(/[\s·•]/g, "")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .toLocaleUpperCase("zh-CN");
}

export function normalizeCreditCode(value: unknown): string | null {
  const code = cleanString(value)?.replace(/\s/g, "").toUpperCase() ?? null;
  return code && /^[0-9A-Z]{15,18}$/.test(code) ? code : null;
}

function fnv1a(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

export function stableLeadId(
  creditCode: string | null,
  companyName: string,
): string {
  const identity = creditCode
    ? `credit:${creditCode}`
    : `name:${normalizeCompanyName(companyName)}`;
  return `lead_${fnv1a(identity)}`;
}

export function normalizeStatus(rawValue: unknown): {
  raw: string | null;
  normalized:
    | "active"
    | "cancelled"
    | "revoked"
    | "suspended"
    | "liquidating"
    | "relocated"
    | "inactive"
    | "unknown";
} {
  const raw = cleanString(rawValue);
  if (!raw) return { raw: null, normalized: "unknown" };
  if (/(正常|存续|在营|在业|开业|在册)/.test(raw))
    return { raw, normalized: "active" };
  if (/注销/.test(raw)) return { raw, normalized: "cancelled" };
  if (/吊销/.test(raw)) return { raw, normalized: "revoked" };
  if (/(停业|歇业)/.test(raw)) return { raw, normalized: "suspended" };
  if (/清算/.test(raw)) return { raw, normalized: "liquidating" };
  if (/(迁出|迁入)/.test(raw)) return { raw, normalized: "relocated" };
  if (/(撤销|非正常|失效|责令关闭|除名|虚假注册)/.test(raw)) {
    return { raw, normalized: "inactive" };
  }
  return { raw, normalized: "unknown" };
}

export function normalizePersonnelScale(value: unknown): {
  raw: string | null;
  lowerBound: number | null;
  upperBound: number | null;
} {
  const raw = cleanString(value);
  if (!raw) return { raw: null, lowerBound: null, upperBound: null };
  const compact = raw.replace(/\s/g, "");
  const exact = compact.match(/^(\d+)人?$/);
  if (exact) {
    const count = Number(exact[1]);
    return { raw, lowerBound: count, upperBound: count };
  }
  const range = compact.match(/^(\d+)[-~至](\d+)人?$/);
  if (range) {
    const lowerBound = Number(range[1]);
    const upperBound = Number(range[2]);
    if (lowerBound <= upperBound) return { raw, lowerBound, upperBound };
  }
  const atLeast = compact.match(/^(\d+)人?以上$/);
  if (atLeast) return { raw, lowerBound: Number(atLeast[1]), upperBound: null };
  const atMost = compact.match(/^(\d+)人?以下$/);
  if (atMost) return { raw, lowerBound: null, upperBound: Number(atMost[1]) };
  return { raw, lowerBound: null, upperBound: null };
}

export function maskPhone(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) return null;
  if (text.includes("*")) return text;
  const digitPositions = [...text.matchAll(/\d/g)].map(
    (match) => match.index ?? 0,
  );
  if (digitPositions.length < 7) return `${text.slice(0, 2)}****`;
  const keepHead = Math.min(3, digitPositions.length - 4);
  const maskedPositions = new Set(digitPositions.slice(keepHead, -4));
  return [...text]
    .map((character, index) => (maskedPositions.has(index) ? "*" : character))
    .join("");
}

export function maskEmail(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) return null;
  if (text.includes("*")) return text;
  const at = text.lastIndexOf("@");
  if (at <= 0) return "****";
  const local = text.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}****@${text.slice(at + 1)}`;
}

export function uniqueStrings(values: readonly unknown[]): string[] {
  const cleaned = values
    .map(cleanString)
    .filter((value): value is string => Boolean(value));
  return [...new Set(cleaned)].sort((left, right) =>
    left.localeCompare(right, "zh-CN"),
  );
}

const QUALIFICATION_PATTERNS = [
  /高新技术企业/,
  /专精特新/,
  /创新型中小企业/,
  /科技型中小企业/,
  /瞪羚企业/,
  /独角兽企业/,
  /A级纳税人/,
  /上市公司/,
  /新三板/,
];

export function classifyProviderTags(values: readonly unknown[]): {
  qualifications: string[];
  operational: string[];
} {
  const tags = uniqueStrings(values);
  return {
    qualifications: tags.filter((tag) =>
      QUALIFICATION_PATTERNS.some((pattern) => pattern.test(tag)),
    ),
    operational: tags.filter(
      (tag) => !QUALIFICATION_PATTERNS.some((pattern) => pattern.test(tag)),
    ),
  };
}

export function nullMeaning(value: unknown): Provenance["nullMeaning"] {
  return value === null || value === undefined || value === ""
    ? "not_provided"
    : "provided";
}

export function getPath(object: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    )
      return undefined;
    return (current as Record<string, unknown>)[segment];
  }, object);
}

export function safeDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.slice(0, 180);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  try {
    return JSON.stringify(value).slice(0, 180);
  } catch {
    return "[不可序列化]";
  }
}
