import {
  LeadSchema,
  mergeLeadDatasetsWithOptions,
  type Lead,
} from "../../../src/domain";
import type { LeadRecord } from "./types";

export type PersistedLeadSnapshot = {
  company_id: number | string;
  captured_at: string;
  normalized_payload: unknown;
};

function snapshotProviderKey(lead: Lead): string {
  const providers = [
    ...new Set(lead.provenance.map((item) => item.providerId).filter(Boolean)),
  ].sort();
  return providers.length > 0 ? providers.join("|") : "unknown";
}

/**
 * Build one deterministic, source-aware record per persisted company.
 *
 * Web-only snapshots and malformed historic payloads are deliberately skipped:
 * they remain auditable in source_snapshots/company_evidence, but they are not
 * allowed to replace a canonical Lead used by rules or exports.
 */
export function mergeLatestLeadSnapshots(
  snapshots: readonly PersistedLeadSnapshot[],
  sourceRecordByCompany: ReadonlyMap<number, string | null>,
  providerPriorities: Record<string, number> = {},
): LeadRecord[] {
  const latestByCompanyAndProvider = new Map<number, Map<string, Lead>>();

  for (const snapshot of [...snapshots].sort((left, right) =>
    right.captured_at.localeCompare(left.captured_at),
  )) {
    const companyId = Number(snapshot.company_id);
    if (!Number.isSafeInteger(companyId) || companyId <= 0) continue;
    const parsed = LeadSchema.safeParse(snapshot.normalized_payload);
    if (!parsed.success) continue;
    const byProvider = latestByCompanyAndProvider.get(companyId) ?? new Map();
    const providerKey = snapshotProviderKey(parsed.data);
    if (!byProvider.has(providerKey)) {
      byProvider.set(providerKey, parsed.data);
      latestByCompanyAndProvider.set(companyId, byProvider);
    }
  }

  return [...latestByCompanyAndProvider.entries()]
    .sort(([leftId], [rightId]) => leftId - rightId)
    .flatMap(([companyId, byProvider]) => {
      const leads = [...byProvider.values()];
      const [merged] = mergeLeadDatasetsWithOptions([leads], {
        providerPriorities,
      });
      if (!merged) return [];
      return [
        {
          companyId,
          sourceRecordId: sourceRecordByCompany.get(companyId) ?? null,
          lead: merged,
        },
      ];
    });
}
