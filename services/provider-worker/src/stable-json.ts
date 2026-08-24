import { createHash } from "node:crypto";

function normalizeForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeForJson(child)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(normalizeForJson(value));
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
