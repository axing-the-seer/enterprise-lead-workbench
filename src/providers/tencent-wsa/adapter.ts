import { z } from "zod";
import { WebEvidenceSchema, type WebEvidence } from "../../domain/types";

export const TENCENT_WSA_PROVIDER_ID = "tencent_wsa";
export const TENCENT_WSA_PROVIDER_NAME = "腾讯云联网搜索 API";

export const WebClaimTypeSchema = WebEvidenceSchema.shape.claimType;
export type WebClaimType = z.infer<typeof WebClaimTypeSchema>;

const WsaPageSchema = z
  .object({
    title: z.unknown().optional(),
    date: z.unknown().optional(),
    url: z.unknown().optional(),
    passage: z.unknown().optional(),
    site: z.unknown().optional(),
    score: z.unknown().optional(),
    authority_level: z.unknown().optional(),
  })
  .passthrough();

export type TencentWsaSanitizedPage = {
  title: string;
  date: string | null;
  url: string;
  passage: string;
  site: string | null;
  score: number | null;
  authorityLevel: number | null;
};

export type TencentWsaMappedResponse = {
  query: string | null;
  version: string | null;
  requestId: string | null;
  sanitizedPages: TencentWsaSanitizedPage[];
  evidence: WebEvidence[];
};

function text(value: unknown, maximum = 2_000): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function finite(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function httpUrl(value: unknown): string | null {
  const candidate = text(value, 4_096);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function publishedAt(value: unknown): string | null {
  const raw = text(value, 80);
  if (!raw) return null;
  const normalized = raw.replace(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    (_all, year, month, day, hour = "00", minute = "00", second = "00") =>
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute}:${second}+08:00`,
  );
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function responseObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("腾讯云联网搜索响应必须是 JSON 对象");
  }
  const envelope = raw as Record<string, unknown>;
  const nested = envelope.Response;
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : envelope;
}

function parsePage(value: unknown): TencentWsaSanitizedPage | null {
  let decoded = value;
  if (typeof value === "string") {
    try {
      decoded = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const parsed = WsaPageSchema.safeParse(decoded);
  if (!parsed.success) return null;
  const title = text(parsed.data.title, 500);
  const url = httpUrl(parsed.data.url);
  if (!title || !url) return null;
  const score = finite(parsed.data.score);
  const authorityLevel = finite(parsed.data.authority_level);
  return {
    title,
    date: text(parsed.data.date, 80),
    url,
    passage: text(parsed.data.passage, 2_000) ?? "",
    site: text(parsed.data.site, 200),
    score: score === null ? null : Math.min(1, Math.max(0, score)),
    authorityLevel:
      authorityLevel === null ? null : Math.min(5, Math.max(0, authorityLevel)),
  };
}

/**
 * Maps only the documented WSA title/date/url/passage/site/score fields.
 * Dynamic content, pictures, favicons, deep links and unknown vendor fields are
 * deliberately excluded from persisted evidence.
 */
export function mapTencentWsaResponse(input: {
  raw: unknown;
  companyName: string;
  claimType: WebClaimType;
  retrievedAt: string;
  maxResults?: number;
}): TencentWsaMappedResponse {
  const envelope = responseObject(input.raw);
  const pages = Array.isArray(envelope.Pages) ? envelope.Pages : [];
  const maxResults = Math.min(10, Math.max(1, input.maxResults ?? 10));
  const seenUrls = new Set<string>();
  const sanitizedPages = pages
    .map(parsePage)
    .filter((page): page is TencentWsaSanitizedPage => {
      if (!page || seenUrls.has(page.url)) return false;
      seenUrls.add(page.url);
      return true;
    })
    .slice(0, maxResults);

  const evidence = sanitizedPages.map((page, index) =>
    WebEvidenceSchema.parse({
      evidenceId: `${TENCENT_WSA_PROVIDER_ID}:${index + 1}:${page.url}`,
      companyName: input.companyName,
      title: page.title,
      snippet: page.passage,
      url: page.url,
      sourceName: page.site,
      publishedAt: publishedAt(page.date),
      retrievedAt: input.retrievedAt,
      claimType: input.claimType,
      confidence: page.score ?? 0,
      usageScope: "link_only",
    }),
  );

  return {
    query: text(envelope.Query, 400),
    version: text(envelope.Version, 80),
    requestId: text(envelope.RequestId, 200),
    sanitizedPages,
    evidence,
  };
}
