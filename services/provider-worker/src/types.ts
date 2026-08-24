import type { Lead, RuleTemplate } from "../../../src/domain";

export type WorkbenchJobType = "ingestion_job" | "rule_run" | "export";

export type ClaimedWorkbenchJob = {
  job_type: WorkbenchJobType;
  job_id: string;
  workspace_id: string;
  payload: Record<string, unknown>;
};

export type SourceProvider =
  | "qcc"
  | "huoke_assistant"
  | "file_upload"
  | "web_search"
  | "other";

export type SourceConnection = {
  id: string;
  workspace_id: string;
  provider: SourceProvider;
  name: string;
  connection_kind: string;
  status: string;
  secret_reference: string | null;
  connection_config: Record<string, unknown>;
  capabilities: string[];
};

export type PersistIngestionRecordInput = {
  jobId: string;
  sourceRecordKey: string;
  recordKind: string;
  rawPayload: Record<string, unknown>;
  rawHash: string;
  observedAt: string | null;
  normalizedPayload: Lead;
  normalizedHash: string;
  mappingWarnings: string[];
};

export type PersistedIngestionRecord = {
  source_record_id: string;
  source_snapshot_id: string;
  company_id: number;
};

export type EvidenceCompany = {
  id: number;
  name: string;
  creditCode: string | null;
};

export type PersistWebEvidenceInput = {
  jobId: string;
  companyId: number;
  sourceRecordKey: string;
  rawPayload: Record<string, unknown>;
  rawHash: string;
  observedAt: string;
  normalizedPayload: Record<string, unknown>;
  normalizedHash: string;
  evidenceItems: Record<string, unknown>[];
};

export type PersistedWebEvidence = {
  source_record_id: string;
  source_snapshot_id: string;
  evidence_count: number;
};

export type LeadRecord = {
  companyId: number;
  sourceRecordId: string | null;
  lead: Lead;
};

export type RuleRunContext = {
  template: RuleTemplate;
  records: LeadRecord[];
};

export type RuleResultWrite = {
  workspace_id: string;
  rule_run_id: string;
  company_id: number;
  decision: "include" | "exclude" | "needs_review";
  score: number;
  matched_rules: unknown[];
  failed_rules: unknown[];
  missing_fields: string[];
  evaluated_values: Record<string, unknown>;
  result_hash: string;
};

export type ExportContext = {
  records: LeadRecord[];
  decisions: Map<number, string>;
};

export type CompletionStatus = "completed" | "partial" | "failed" | "cancelled";

export interface WorkbenchStore {
  claimNext(workerId: string): Promise<ClaimedWorkbenchJob | null>;
  complete(
    job: ClaimedWorkbenchJob,
    status: CompletionStatus,
    result: Record<string, unknown>,
    errorCode?: string,
    errorMessage?: string,
  ): Promise<void>;
  getSourceConnection(
    workspaceId: string,
    connectionId: string,
  ): Promise<SourceConnection>;
  markConnectionChecked(
    connection: SourceConnection,
    result: {
      status: "ready" | "degraded" | "error";
      verifiedAt?: string;
      errorCode?: string;
    },
  ): Promise<void>;
  downloadImport(path: string): Promise<Uint8Array>;
  loadMappingDefinition(
    workspaceId: string,
    mappingVersionId: string | null,
  ): Promise<Record<string, unknown> | null>;
  persistIngestionRecord(
    input: PersistIngestionRecordInput,
  ): Promise<PersistedIngestionRecord>;
  loadCompanyForEvidence(
    workspaceId: string,
    companyId: number,
  ): Promise<EvidenceCompany>;
  persistWebEvidence(
    input: PersistWebEvidenceInput,
  ): Promise<PersistedWebEvidence>;
  ensureIngestionList(
    job: ClaimedWorkbenchJob,
    sourceQueryId: string | null,
    requestedBy: string | null,
  ): Promise<string>;
  addCompanyListMember(
    jobId: string,
    workspaceId: string,
    listId: string,
    persisted: PersistedIngestionRecord,
    requestedBy: string | null,
  ): Promise<void>;
  loadRuleRunContext(job: ClaimedWorkbenchJob): Promise<RuleRunContext>;
  saveRuleResults(rows: RuleResultWrite[]): Promise<void>;
  loadExportContext(job: ClaimedWorkbenchJob): Promise<ExportContext>;
  uploadExport(
    path: string,
    mediaType: string,
    content: Uint8Array,
  ): Promise<void>;
}
