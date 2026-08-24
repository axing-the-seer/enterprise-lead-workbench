import type { RuleResult } from "./types";

type SourceConflictCandidate = {
  providerId: string;
  displayValue: string;
};

export type SourceConflict = {
  fieldPath: string;
  resolution: string;
  chosenProviderId: string;
  candidates: SourceConflictCandidate[];
};

export type CompanySourceConflict = SourceConflict & {
  companyId: string;
  ruleResultId: string;
};

function sourceConflict(value: unknown): SourceConflict | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.fieldPath !== "string" ||
    typeof record.resolution !== "string" ||
    typeof record.chosenProviderId !== "string" ||
    !Array.isArray(record.candidates)
  ) {
    return null;
  }
  const candidates = record.candidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    if (
      typeof item.providerId !== "string" ||
      typeof item.displayValue !== "string"
    ) {
      return [];
    }
    return [{ providerId: item.providerId, displayValue: item.displayValue }];
  });
  if (candidates.length < 2) return null;
  return {
    fieldPath: record.fieldPath,
    resolution: record.resolution,
    chosenProviderId: record.chosenProviderId,
    candidates,
  };
}

export function latestCompanySourceConflicts(
  results: RuleResult[],
): CompanySourceConflict[] {
  const seenCompanies = new Set<string>();
  const conflicts: CompanySourceConflict[] = [];
  for (const result of results) {
    const companyId = String(result.company_id);
    if (seenCompanies.has(companyId)) continue;
    seenCompanies.add(companyId);
    const rawConflicts = result.evaluated_values?.sourceConflicts;
    if (!Array.isArray(rawConflicts)) continue;
    for (const rawConflict of rawConflicts) {
      const parsed = sourceConflict(rawConflict);
      if (!parsed) continue;
      conflicts.push({
        ...parsed,
        companyId,
        ruleResultId: String(result.id),
      });
    }
  }
  return conflicts;
}
