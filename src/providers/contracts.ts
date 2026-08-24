import { LeadSchema, type Lead, type Provenance } from "../domain/types";

export type ProviderCapability =
  | "company_search"
  | "company_registration"
  | "risk_triage"
  | "file_import"
  | "web_evidence";

export type ProviderDescriptor = {
  id: string;
  name: string;
  channel: Provenance["channel"];
  capabilities: readonly ProviderCapability[];
  adapterVersion: string;
};

export type ProviderContext = {
  retrievedAt: string;
  providerName?: string;
};

/**
 * `sanitizedRaw` is the allow-listed, redacted source subset used to explain
 * a mapping. It is not the complete vendor response and is safe to persist
 * with the canonical result. Unknown fields, credentials, vendor-internal IDs
 * and clear-text contact details must never be copied into it.
 */
export type AdaptedProviderRecord = {
  sourceIndex: number;
  sanitizedRaw: Readonly<Record<string, unknown>>;
  canonical: Lead;
  provenance: readonly Provenance[];
};

export type ProviderBatch = {
  provider: ProviderDescriptor;
  retrievedAt: string;
  records: readonly AdaptedProviderRecord[];
  canonicalRecords: readonly Lead[];
};

export interface ProviderAdapter<TRaw, TOptions = Record<string, never>> {
  readonly descriptor: ProviderDescriptor;
  normalizeRecord(
    raw: TRaw,
    context: ProviderContext,
    options: TOptions,
    sourceIndex: number,
  ): AdaptedProviderRecord;
  normalizeBatch(
    records: readonly TRaw[],
    context: ProviderContext,
    options: TOptions,
  ): ProviderBatch;
}

type AdapterDefinition<TRaw, TOptions> = {
  descriptor: ProviderDescriptor;
  normalizeRecord: ProviderAdapter<TRaw, TOptions>["normalizeRecord"];
};

function validateRecord(
  descriptor: ProviderDescriptor,
  record: AdaptedProviderRecord,
): AdaptedProviderRecord {
  const canonical = LeadSchema.parse(record.canonical);
  if (canonical.provenance.length === 0) {
    throw new Error(`${descriptor.name} 映射结果缺少字段血缘`);
  }
  if (record.provenance !== record.canonical.provenance) {
    const recordProvenance = JSON.stringify(record.provenance);
    const canonicalProvenance = JSON.stringify(canonical.provenance);
    if (recordProvenance !== canonicalProvenance) {
      throw new Error(
        `${descriptor.name} 适配器的外层与 canonical provenance 不一致`,
      );
    }
  }
  return { ...record, canonical, provenance: canonical.provenance };
}

export function createProviderAdapter<TRaw, TOptions>(
  definition: AdapterDefinition<TRaw, TOptions>,
): ProviderAdapter<TRaw, TOptions> {
  return {
    descriptor: definition.descriptor,
    normalizeRecord(raw, context, options, sourceIndex) {
      return validateRecord(
        definition.descriptor,
        definition.normalizeRecord(raw, context, options, sourceIndex),
      );
    },
    normalizeBatch(records, context, options) {
      if (!Array.isArray(records)) {
        throw new TypeError(
          `${definition.descriptor.name} 数据集必须是记录数组`,
        );
      }
      const normalized = records.map((raw, sourceIndex) => {
        try {
          return this.normalizeRecord(raw, context, options, sourceIndex);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `${definition.descriptor.name}第 ${sourceIndex + 1} 条记录映射失败：${message}`,
          );
        }
      });
      return {
        provider: definition.descriptor,
        retrievedAt: context.retrievedAt,
        records: normalized,
        canonicalRecords: normalized.map((record) => record.canonical),
      };
    },
  };
}

export function adapterContext(
  options: { retrievedAt?: string; providerName?: string } = {},
): ProviderContext {
  return {
    retrievedAt: options.retrievedAt ?? new Date().toISOString(),
    ...(options.providerName ? { providerName: options.providerName } : {}),
  };
}
