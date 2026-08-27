import type { Identifier, RaRecord } from "ra-core";

export type WorkbenchRecord = RaRecord<Identifier> & {
  id: string;
  workspace_id?: string;
  created_at?: string;
  updated_at?: string;
};

export type Workspace = WorkbenchRecord & {
  name: string;
  slug?: string;
  status?: string;
  settings?: {
    providerPriorities?: Record<string, number>;
    [key: string]: unknown;
  } | null;
};

export type WorkspaceMember = WorkbenchRecord & {
  user_id: string;
  role: string;
  status: string;
};

export type SourceConnection = WorkbenchRecord & {
  provider: string;
  name: string;
  connection_kind?: string;
  status: string;
  has_secret_reference?: boolean;
  connection_config?: Record<string, unknown> | null;
  capabilities?: Record<string, unknown> | string[] | null;
  default_mapping_version_id?: string | null;
  last_verified_at?: string | null;
  last_error_code?: string | null;
};

export type SourceQuery = WorkbenchRecord & {
  source_connection_id?: string | null;
  query_kind: string;
  criteria?: Record<string, unknown> | null;
  status: string;
  external_query_id?: string | null;
};

export type IngestionJob = WorkbenchRecord & {
  source_query_id?: string | null;
  source_connection_id?: string | null;
  status: string;
  requested_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  job_kind?: string;
  received_count?: number | null;
  accepted_count?: number | null;
  rejected_count?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  input_params?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
};

export type CompanyList = WorkbenchRecord & {
  name: string;
  description?: string | null;
  status?: string | null;
  company_count?: number | null;
  source_query_id?: string | null;
  created_via?: "web_ui" | "workbuddy" | "agent" | "file_upload" | "api";
  created_by_agent?: string | null;
  agent_provider?: string | null;
};

export type CompanyListMember = WorkbenchRecord & {
  company_list_id: string;
  company_id: string | number;
  source_record_id?: string | null;
  membership_status?: "included" | "excluded" | "needs_review" | null;
  added_at?: string | null;
};

type CompanyFields = {
  name: string;
  normalized_name?: string | null;
  unified_social_credit_code?: string | null;
  registration_number?: string | null;
  operating_status?: string | null;
  legal_representative?: string | null;
  registered_capital_amount?: number | null;
  registered_capital_currency?: string | null;
  established_on?: string | null;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  industry_code?: string | null;
  industry_name?: string | null;
  employee_count?: number | null;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  phone_number?: string | null;
  profile_status?: string | null;
  completeness_score?: number | null;
  primary_source?: string | null;
  last_verified_at?: string | null;
  insured_employee_count?: number | null;
};

export type Company = WorkbenchRecord & CompanyFields;

export type CompanyListEntry = WorkbenchRecord &
  CompanyFields & {
    member_id: string;
    company_list_id: string;
    company_id: string | number;
    source_record_id?: string | null;
    membership_status?: "included" | "excluded" | "needs_review" | null;
    added_at?: string | null;
    membership_updated_at?: string | null;
    latest_normalized_payload?: Record<string, unknown> | null;
    current_report_id?: string | null;
    current_report_job_id?: string | null;
    current_report_submitted_at?: string | null;
  };

export type CompanyFieldFact = WorkbenchRecord & {
  company_id: string | number;
  field_name: string;
  value_json?: unknown;
  value_text?: string | null;
  source_provider: string;
  source_record_id?: string | null;
  observed_at?: string | null;
  confidence?: number | null;
  is_current?: boolean;
};

export type CompanyEvidence = WorkbenchRecord & {
  company_id: string | number;
  evidence_type: string;
  title: string;
  source_provider: string;
  source_record_id?: string | null;
  source_url?: string | null;
  captured_at?: string | null;
  excerpt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CompanyReport = WorkbenchRecord & {
  company_id: string | number;
  evidence_job_id: string;
  source_snapshot_id: string;
  revision: number;
  status: "completed" | "superseded";
  schema_version: "company-agent-analysis.v1";
  agent_provider: string;
  agent_name: string;
  analysis: Record<string, unknown>;
  is_current: boolean;
  submitted_at?: string | null;
};

export type SourceSnapshot = WorkbenchRecord & {
  source_record_id: string;
  mapping_version_id?: string | null;
  company_id?: string | number | null;
  canonical_schema_version: string;
  normalized_payload: Record<string, unknown>;
  match_status: string;
  mapping_warnings?: unknown[];
  captured_at?: string | null;
};

export type RuleSet = WorkbenchRecord & {
  name: string;
  description?: string | null;
  status?: string | null;
  business_objective?: string | null;
  current_version_number?: number | null;
};

export type RuleSetVersion = WorkbenchRecord & {
  rule_set_id: string;
  version_number: number;
  rule_definition: Record<string, unknown>;
  change_note?: string | null;
  status?: string | null;
};

export type FieldMappingSet = WorkbenchRecord & {
  provider: string;
  name: string;
  description?: string | null;
  status?: string | null;
  current_version_number?: number | null;
};

export type FieldMappingVersion = WorkbenchRecord & {
  mapping_set_id: string;
  version_number: number;
  mapping_definition: Record<string, unknown>;
  change_note?: string | null;
  status?: string | null;
};

export type RuleRun = WorkbenchRecord & {
  rule_version_id?: string | null;
  company_list_id?: string | null;
  status: string;
  run_mode?: string | null;
  engine_version?: string | null;
  input_manifest_hash?: string | null;
  requested_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  total_count?: number | null;
  included_count?: number | null;
  excluded_count?: number | null;
  review_count?: number | null;
  error_code?: string | null;
  error_message?: string | null;
};

export type RuleResult = WorkbenchRecord & {
  rule_run_id: string;
  company_id: string | number;
  decision?: string | null;
  score?: number | null;
  matched_rules?: unknown[];
  failed_rules?: unknown[];
  missing_fields?: string[];
  evaluated_values?: Record<string, unknown>;
  evaluated_at?: string | null;
};

export type ManualReview = WorkbenchRecord & {
  company_id: string | number;
  rule_result_id: string;
  decision: string;
  note?: string | null;
  is_current?: boolean;
  reviewed_at?: string | null;
};

export type ExportJob = WorkbenchRecord & {
  company_list_id?: string | null;
  rule_run_id?: string | null;
  export_format: string;
  status: string;
  storage_bucket?: string | null;
  storage_path?: string | null;
  row_count?: number | null;
  requested_at?: string | null;
  completed_at?: string | null;
  expires_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  result?: Record<string, unknown> | null;
};

export type AuditLog = WorkbenchRecord & {
  actor_type: string;
  actor_user_id?: string | null;
  actor_label?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  request_id?: string | null;
  metadata?: Record<string, unknown> | null;
  occurred_at?: string | null;
};

export type WorkbenchJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "cancelled";

export type WorkbenchJobResponse = {
  jobId: string;
  status: WorkbenchJobStatus;
  jobType?: string;
};
