import { LeadSchema, type Conflict, type Lead, type Provenance } from "./types";
import {
  getPath,
  normalizeCompanyName,
  safeDisplayValue,
  stableLeadId,
  uniqueStrings,
} from "./normalize";

export const DEFAULT_SOURCE_PRIORITIES: Record<Provenance["channel"], number> =
  {
    government_open_data: 100,
    authorized_api: 90,
    customer_system: 80,
    customer_upload: 60,
    manual: 50,
    web_search: 10,
  };

export type MergeOptions = {
  sourcePriorities?: Partial<Record<Provenance["channel"], number>>;
  providerPriorities?: Record<string, number>;
};

type Candidate = {
  value: unknown;
  provenance: Provenance | null;
  providerId: string;
  priority: number;
};

type MergeField = {
  outputPath: string;
  valuePath: string;
  provenancePath: string;
};

const MERGE_FIELDS: readonly MergeField[] = [
  {
    outputPath: "companyName",
    valuePath: "companyName",
    provenancePath: "companyName",
  },
  {
    outputPath: "creditCode",
    valuePath: "creditCode",
    provenancePath: "creditCode",
  },
  {
    outputPath: "legalPerson",
    valuePath: "legalPerson",
    provenancePath: "legalPerson",
  },
  {
    outputPath: "legalChangeDate",
    valuePath: "legalChangeDate",
    provenancePath: "legalChangeDate",
  },
  {
    outputPath: "legalPersonSharePercent",
    valuePath: "legalPersonSharePercent",
    provenancePath: "legalPersonSharePercent",
  },
  {
    outputPath: "companyType",
    valuePath: "companyType",
    provenancePath: "companyType",
  },
  {
    outputPath: "registeredCapital",
    valuePath: "registeredCapital",
    provenancePath: "registeredCapital.valueWan",
  },
  {
    outputPath: "paidInCapital",
    valuePath: "paidInCapital",
    provenancePath: "paidInCapital.valueWan",
  },
  {
    outputPath: "establishedDate",
    valuePath: "establishedDate",
    provenancePath: "establishedDate",
  },
  {
    outputPath: "approvedDate",
    valuePath: "approvedDate",
    provenancePath: "approvedDate",
  },
  {
    outputPath: "registrationAuthority",
    valuePath: "registrationAuthority",
    provenancePath: "registrationAuthority",
  },
  {
    outputPath: "status",
    valuePath: "status",
    provenancePath: "status.normalized",
  },
  {
    outputPath: "industry.l1",
    valuePath: "industry.l1",
    provenancePath: "industry.l1",
  },
  {
    outputPath: "industry.l2",
    valuePath: "industry.l2",
    provenancePath: "industry.l2",
  },
  {
    outputPath: "region.raw",
    valuePath: "region.raw",
    provenancePath: "region.raw",
  },
  {
    outputPath: "region.province",
    valuePath: "region.province",
    provenancePath: "region.province",
  },
  {
    outputPath: "region.city",
    valuePath: "region.city",
    provenancePath: "region.city",
  },
  {
    outputPath: "region.district",
    valuePath: "region.district",
    provenancePath: "region.district",
  },
  {
    outputPath: "personnelScale.raw",
    valuePath: "personnelScale.raw",
    provenancePath: "personnelScale.raw",
  },
  {
    outputPath: "personnelScale.lowerBound",
    valuePath: "personnelScale.lowerBound",
    provenancePath: "personnelScale.lowerBound",
  },
  {
    outputPath: "personnelScale.upperBound",
    valuePath: "personnelScale.upperBound",
    provenancePath: "personnelScale.upperBound",
  },
  {
    outputPath: "insuredCount",
    valuePath: "insuredCount",
    provenancePath: "insuredCount",
  },
  {
    outputPath: "registeredAddress",
    valuePath: "registeredAddress",
    provenancePath: "registeredAddress",
  },
  {
    outputPath: "businessScope",
    valuePath: "businessScope",
    provenancePath: "businessScope",
  },
  {
    outputPath: "contact.phoneMasked",
    valuePath: "contact.phoneMasked",
    provenancePath: "contact.phoneMasked",
  },
  {
    outputPath: "contact.emailMasked",
    valuePath: "contact.emailMasked",
    provenancePath: "contact.emailMasked",
  },
  {
    outputPath: "contact.phoneCount",
    valuePath: "contact.phoneCount",
    provenancePath: "contact.phoneCount",
  },
  {
    outputPath: "contact.emailCount",
    valuePath: "contact.emailCount",
    provenancePath: "contact.emailCount",
  },
];

function isMissing(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object" && value && "valueWan" in value) {
    return (value as Lead["registeredCapital"]).valueWan === null;
  }
  if (typeof value === "object" && value && "normalized" in value) {
    return (value as Lead["status"]).normalized === "unknown";
  }
  return false;
}

function timestamp(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  if (/^\d{4}$/.test(value)) return Date.parse(`${value}-12-31T23:59:59Z`);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function fieldProvenance(lead: Lead, fieldPath: string): Provenance | null {
  return (
    lead.provenance.find((item) => item.fieldPath === fieldPath) ??
    lead.provenance.find((item) => fieldPath.startsWith(item.fieldPath)) ??
    lead.provenance[0] ??
    null
  );
}

function providerPriority(
  provenance: Provenance | null,
  options: MergeOptions,
): number {
  const providerId = provenance?.providerId ?? "unknown";
  if (options.providerPriorities?.[providerId] !== undefined) {
    return options.providerPriorities[providerId];
  }
  const priorities = {
    ...DEFAULT_SOURCE_PRIORITIES,
    ...(options.sourcePriorities ?? {}),
  };
  return provenance ? priorities[provenance.channel] : 0;
}

function compareCandidates(left: Candidate, right: Candidate): number {
  const missingDifference =
    Number(isMissing(left.value)) - Number(isMissing(right.value));
  if (missingDifference !== 0) return missingDifference;
  if (left.priority !== right.priority) return right.priority - left.priority;
  const sourceUpdateDifference =
    timestamp(right.provenance?.sourceUpdatedAt) -
    timestamp(left.provenance?.sourceUpdatedAt);
  if (sourceUpdateDifference !== 0) return sourceUpdateDifference;
  const retrievalDifference =
    timestamp(right.provenance?.retrievedAt) -
    timestamp(left.provenance?.retrievedAt);
  if (retrievalDifference !== 0) return retrievalDifference;
  return left.providerId.localeCompare(right.providerId);
}

function resolutionFor(
  winner: Candidate,
  runnerUp: Candidate,
): Conflict["resolution"] {
  if (isMissing(runnerUp.value) && !isMissing(winner.value))
    return "non_null_preferred";
  if (winner.priority !== runnerUp.priority) return "provider_priority";
  if (
    timestamp(winner.provenance?.sourceUpdatedAt) !==
    timestamp(runnerUp.provenance?.sourceUpdatedAt)
  ) {
    return "newer_source_update";
  }
  if (
    timestamp(winner.provenance?.retrievedAt) !==
    timestamp(runnerUp.provenance?.retrievedAt)
  ) {
    return "newer_retrieval";
  }
  return "stable_provider_id";
}

function valueKey(value: unknown): string {
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

function setPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let current = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      current[part] = value;
      return;
    }
    if (
      !current[part] ||
      typeof current[part] !== "object" ||
      Array.isArray(current[part])
    ) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  });
}

function mergeGroup(group: Lead[], options: MergeOptions): Lead {
  const base = LeadSchema.parse(group[0]) as Lead & Record<string, unknown>;
  const conflicts: Conflict[] = [...group.flatMap((lead) => lead.conflicts)];

  for (const field of MERGE_FIELDS) {
    const candidates = group
      .map((lead): Candidate => {
        const provenance = fieldProvenance(lead, field.provenancePath);
        return {
          value: getPath(lead, field.valuePath),
          provenance,
          providerId: provenance?.providerId ?? "unknown",
          priority: providerPriority(provenance, options),
        };
      })
      .sort(compareCandidates);
    const winner = candidates[0];
    if (!winner || isMissing(winner.value)) continue;
    setPath(base, field.outputPath, winner.value);

    const distinct = candidates
      .filter((candidate) => !isMissing(candidate.value))
      .filter(
        (candidate, index, all) =>
          all.findIndex(
            (item) => valueKey(item.value) === valueKey(candidate.value),
          ) === index,
      );
    if (distinct.length > 1) {
      conflicts.push({
        fieldPath: field.outputPath,
        resolution: resolutionFor(winner, distinct[1]),
        chosenProviderId: winner.providerId,
        candidates: distinct.map((candidate) => ({
          providerId: candidate.providerId,
          displayValue: safeDisplayValue(candidate.value),
        })),
      });
    }
  }

  base.tags = {
    qualifications: uniqueStrings(
      group.flatMap((lead) => lead.tags.qualifications),
    ),
    risk: uniqueStrings(group.flatMap((lead) => lead.tags.risk)),
    operational: uniqueStrings(group.flatMap((lead) => lead.tags.operational)),
  };
  const signals = group
    .flatMap((lead) => lead.riskSnapshot.signals)
    .filter(
      (signal, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.code === signal.code &&
            candidate.present === signal.present &&
            candidate.count === signal.count &&
            [...candidate.sourceProviderIds].sort().join("|") ===
              [...signal.sourceProviderIds].sort().join("|"),
        ) === index,
    );
  const severityRank = {
    unknown: -1,
    none: 0,
    info: 1,
    low: 2,
    medium: 3,
    high: 4,
    critical: 5,
  };
  const riskSnapshots = [...group].sort(
    (left, right) =>
      severityRank[right.riskSnapshot.severity] -
        severityRank[left.riskSnapshot.severity] ||
      timestamp(right.riskSnapshot.asOf) - timestamp(left.riskSnapshot.asOf),
  );
  base.riskSnapshot = {
    asOf: riskSnapshots.reduce(
      (latest, item) =>
        timestamp(item.riskSnapshot.asOf) > timestamp(latest)
          ? item.riskSnapshot.asOf
          : latest,
      riskSnapshots[0]?.riskSnapshot.asOf ?? new Date(0).toISOString(),
    ),
    severity: riskSnapshots[0]?.riskSnapshot.severity ?? "unknown",
    signals,
    note: "多来源合并保留任一来源明确返回的正向风险信号；无标签不覆盖有标签。",
  };
  base.providerRiskAssessments = group
    .flatMap((lead) => lead.providerRiskAssessments)
    .filter(
      (assessment, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.providerId === assessment.providerId &&
            candidate.assessedAt === assessment.assessedAt &&
            candidate.score === assessment.score &&
            candidate.grade === assessment.grade,
        ) === index,
    )
    .sort((left, right) =>
      `${left.providerId}|${left.assessedAt}`.localeCompare(
        `${right.providerId}|${right.assessedAt}`,
      ),
    );
  base.webEvidence = group
    .flatMap((lead) => lead.webEvidence)
    .filter(
      (item, index, all) =>
        all.findIndex((candidate) => candidate.url === item.url) === index,
    )
    .sort((left, right) => left.url.localeCompare(right.url));
  base.provenance = group
    .flatMap((lead) => lead.provenance)
    .filter(
      (item, index, all) =>
        all.findIndex(
          (candidate) =>
            `${candidate.fieldPath}|${candidate.providerId}|${candidate.retrievedAt}|${candidate.sourceUrl}` ===
            `${item.fieldPath}|${item.providerId}|${item.retrievedAt}|${item.sourceUrl}`,
        ) === index,
    )
    .sort((left, right) =>
      `${left.fieldPath}|${left.providerId}`.localeCompare(
        `${right.fieldPath}|${right.providerId}`,
      ),
    );
  base.conflicts = conflicts
    .filter(
      (item, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.fieldPath === item.fieldPath &&
            candidate.chosenProviderId === item.chosenProviderId &&
            JSON.stringify(candidate.candidates) ===
              JSON.stringify(item.candidates),
        ) === index,
    )
    .sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
  base.leadId = stableLeadId(base.creditCode, base.companyName);
  return LeadSchema.parse(base);
}

function groupLeads(leads: Lead[]): Lead[][] {
  const byCredit = new Map<string, Lead[]>();
  const nameOnly: Lead[] = [];
  for (const lead of leads) {
    if (lead.creditCode) {
      byCredit.set(lead.creditCode, [
        ...(byCredit.get(lead.creditCode) ?? []),
        lead,
      ]);
    } else {
      nameOnly.push(lead);
    }
  }

  const groups = [...byCredit.values()];
  const groupIndexesByName = new Map<string, number[]>();
  groups.forEach((group, index) => {
    for (const name of new Set(
      group.map((lead) => normalizeCompanyName(lead.companyName)),
    )) {
      groupIndexesByName.set(name, [
        ...(groupIndexesByName.get(name) ?? []),
        index,
      ]);
    }
  });

  const standaloneByName = new Map<string, Lead[]>();
  for (const lead of nameOnly) {
    const name = normalizeCompanyName(lead.companyName);
    const indexes = groupIndexesByName.get(name) ?? [];
    if (indexes.length === 1) groups[indexes[0]].push(lead);
    else
      standaloneByName.set(name, [...(standaloneByName.get(name) ?? []), lead]);
  }
  return [...groups, ...standaloneByName.values()];
}

export function mergeLeadDatasetsWithOptions(
  datasets: readonly (readonly Lead[])[],
  options: MergeOptions = {},
): Lead[] {
  const leads = datasets.flatMap((dataset) =>
    dataset.map((lead) => LeadSchema.parse(lead)),
  );
  return groupLeads(leads)
    .map((group) => mergeGroup(group, options))
    .sort((left, right) =>
      left.companyName.localeCompare(right.companyName, "zh-CN"),
    );
}

export function mergeLeadDatasets(
  ...datasets: readonly (readonly Lead[])[]
): Lead[] {
  return mergeLeadDatasetsWithOptions(datasets);
}
