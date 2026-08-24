-- This release changes the legacy global companies table into a mandatory
-- workspace-owned resource. Guessing a tenant for pre-existing CRM rows would
-- silently cross ownership boundaries, so production upgrades must archive
-- or export them first, then initialize this release in a clean project. A
-- separately reviewed import procedure is required for any retained CRM data.
do $$
begin
  if exists (select 1 from public.companies limit 1) then
    raise exception using
      errcode = 'P0001',
      message = 'workbench migration blocked: legacy public.companies is not empty; back up/export it and initialize a clean project, then use a separately reviewed import procedure';
  end if;
end;
$$;

drop trigger if exists "company_saved" on "public"."companies";

drop policy "Company Delete Policy" on "public"."companies";

drop policy "Enable insert for authenticated users only" on "public"."companies";

drop policy "Enable read access for authenticated users" on "public"."companies";

drop policy "Enable update for authenticated users only" on "public"."companies";

drop policy "Contact Notes Delete Policy" on "public"."contact_notes";

drop policy "Contact Notes Update policy" on "public"."contact_notes";

drop policy "Enable insert for authenticated users only" on "public"."contact_notes";

drop policy "Enable read access for authenticated users" on "public"."contact_notes";

drop policy "Contact Delete Policy" on "public"."contacts";

drop policy "Enable insert for authenticated users only" on "public"."contacts";

drop policy "Enable read access for authenticated users" on "public"."contacts";

drop policy "Enable update for authenticated users only" on "public"."contacts";

drop policy "Deal Notes Delete Policy" on "public"."deal_notes";

drop policy "Deal Notes Update Policy" on "public"."deal_notes";

drop policy "Enable insert for authenticated users only" on "public"."deal_notes";

drop policy "Enable read access for authenticated users" on "public"."deal_notes";

drop policy "Deals Delete Policy" on "public"."deals";

drop policy "Enable insert for authenticated users only" on "public"."deals";

drop policy "Enable read access for authenticated users" on "public"."deals";

drop policy "Enable update for authenticated users only" on "public"."deals";

drop policy "Enable access for authenticated users only" on "public"."favicons_excluded_domains";

drop policy "Enable read access for authenticated users" on "public"."sales";

drop policy "Enable delete for authenticated users only" on "public"."tags";

drop policy "Enable insert for authenticated users only" on "public"."tags";

drop policy "Enable read access for authenticated users" on "public"."tags";

drop policy "Enable update for authenticated users only" on "public"."tags";

drop policy "Enable insert for authenticated users only" on "public"."tasks";

drop policy "Enable read access for authenticated users" on "public"."tasks";

drop policy "Task Delete Policy" on "public"."tasks";

drop policy "Task Update Policy" on "public"."tasks";

revoke references on table "public"."companies" from "anon";

revoke trigger on table "public"."companies" from "anon";

revoke truncate on table "public"."companies" from "anon";

revoke delete on table "public"."companies" from "authenticated";

revoke references on table "public"."companies" from "authenticated";

revoke trigger on table "public"."companies" from "authenticated";

revoke truncate on table "public"."companies" from "authenticated";

revoke references on table "public"."configuration" from "anon";

revoke trigger on table "public"."configuration" from "anon";

revoke truncate on table "public"."configuration" from "anon";

revoke references on table "public"."configuration" from "authenticated";

revoke trigger on table "public"."configuration" from "authenticated";

revoke truncate on table "public"."configuration" from "authenticated";

revoke references on table "public"."contact_notes" from "anon";

revoke trigger on table "public"."contact_notes" from "anon";

revoke truncate on table "public"."contact_notes" from "anon";

revoke delete on table "public"."contact_notes" from "authenticated";

revoke insert on table "public"."contact_notes" from "authenticated";

revoke references on table "public"."contact_notes" from "authenticated";

revoke select on table "public"."contact_notes" from "authenticated";

revoke trigger on table "public"."contact_notes" from "authenticated";

revoke truncate on table "public"."contact_notes" from "authenticated";

revoke update on table "public"."contact_notes" from "authenticated";

revoke references on table "public"."contacts" from "anon";

revoke trigger on table "public"."contacts" from "anon";

revoke truncate on table "public"."contacts" from "anon";

revoke delete on table "public"."contacts" from "authenticated";

revoke insert on table "public"."contacts" from "authenticated";

revoke references on table "public"."contacts" from "authenticated";

revoke select on table "public"."contacts" from "authenticated";

revoke trigger on table "public"."contacts" from "authenticated";

revoke truncate on table "public"."contacts" from "authenticated";

revoke update on table "public"."contacts" from "authenticated";

revoke references on table "public"."deal_notes" from "anon";

revoke trigger on table "public"."deal_notes" from "anon";

revoke truncate on table "public"."deal_notes" from "anon";

revoke delete on table "public"."deal_notes" from "authenticated";

revoke insert on table "public"."deal_notes" from "authenticated";

revoke references on table "public"."deal_notes" from "authenticated";

revoke select on table "public"."deal_notes" from "authenticated";

revoke trigger on table "public"."deal_notes" from "authenticated";

revoke truncate on table "public"."deal_notes" from "authenticated";

revoke update on table "public"."deal_notes" from "authenticated";

revoke references on table "public"."deals" from "anon";

revoke trigger on table "public"."deals" from "anon";

revoke truncate on table "public"."deals" from "anon";

revoke delete on table "public"."deals" from "authenticated";

revoke insert on table "public"."deals" from "authenticated";

revoke references on table "public"."deals" from "authenticated";

revoke select on table "public"."deals" from "authenticated";

revoke trigger on table "public"."deals" from "authenticated";

revoke truncate on table "public"."deals" from "authenticated";

revoke update on table "public"."deals" from "authenticated";

revoke references on table "public"."favicons_excluded_domains" from "anon";

revoke trigger on table "public"."favicons_excluded_domains" from "anon";

revoke truncate on table "public"."favicons_excluded_domains" from "anon";

revoke delete on table "public"."favicons_excluded_domains" from "authenticated";

revoke insert on table "public"."favicons_excluded_domains" from "authenticated";

revoke references on table "public"."favicons_excluded_domains" from "authenticated";

revoke select on table "public"."favicons_excluded_domains" from "authenticated";

revoke trigger on table "public"."favicons_excluded_domains" from "authenticated";

revoke truncate on table "public"."favicons_excluded_domains" from "authenticated";

revoke update on table "public"."favicons_excluded_domains" from "authenticated";

revoke references on table "public"."sales" from "anon";

revoke trigger on table "public"."sales" from "anon";

revoke truncate on table "public"."sales" from "anon";

revoke delete on table "public"."sales" from "authenticated";

revoke insert on table "public"."sales" from "authenticated";

revoke references on table "public"."sales" from "authenticated";

revoke trigger on table "public"."sales" from "authenticated";

revoke truncate on table "public"."sales" from "authenticated";

revoke update on table "public"."sales" from "authenticated";

revoke references on table "public"."tags" from "anon";

revoke trigger on table "public"."tags" from "anon";

revoke truncate on table "public"."tags" from "anon";

revoke delete on table "public"."tags" from "authenticated";

revoke insert on table "public"."tags" from "authenticated";

revoke references on table "public"."tags" from "authenticated";

revoke select on table "public"."tags" from "authenticated";

revoke trigger on table "public"."tags" from "authenticated";

revoke truncate on table "public"."tags" from "authenticated";

revoke update on table "public"."tags" from "authenticated";

revoke references on table "public"."tasks" from "anon";

revoke trigger on table "public"."tasks" from "anon";

revoke truncate on table "public"."tasks" from "anon";

revoke delete on table "public"."tasks" from "authenticated";

revoke insert on table "public"."tasks" from "authenticated";

revoke references on table "public"."tasks" from "authenticated";

revoke select on table "public"."tasks" from "authenticated";

revoke trigger on table "public"."tasks" from "authenticated";

revoke truncate on table "public"."tasks" from "authenticated";

revoke update on table "public"."tasks" from "authenticated";

drop view if exists "public"."activity_log";

drop view if exists "public"."companies_summary";

drop view if exists "public"."contacts_summary";


  create table "public"."audit_logs" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "actor_type" text not null,
    "actor_user_id" uuid,
    "actor_label" text,
    "action" text not null,
    "entity_type" text not null,
    "entity_id" text,
    "request_id" text,
    "trace_id" text,
    "source_ip" inet,
    "user_agent" text,
    "before_data" jsonb,
    "after_data" jsonb,
    "metadata" jsonb not null default '{}'::jsonb,
    "occurred_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."audit_logs" enable row level security;


  create table "public"."company_evidence" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "company_id" bigint not null,
    "evidence_type" text not null,
    "title" text not null,
    "source_provider" text not null,
    "source_record_id" uuid,
    "source_snapshot_id" uuid,
    "source_url" text,
    "excerpt" text,
    "evidence_fingerprint" text not null,
    "evidence_status" text not null default 'unverified'::text,
    "observed_at" timestamp with time zone,
    "captured_at" timestamp with time zone not null default now(),
    "expires_at" timestamp with time zone,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."company_evidence" enable row level security;


  create table "public"."company_field_facts" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "company_id" bigint not null,
    "field_name" text not null,
    "value_json" jsonb not null,
    "value_text" text,
    "value_type" text not null,
    "source_provider" text not null,
    "source_record_id" uuid,
    "source_snapshot_id" uuid,
    "evidence_id" uuid,
    "confidence" numeric(5,4),
    "observed_at" timestamp with time zone,
    "valid_from" timestamp with time zone,
    "valid_to" timestamp with time zone,
    "is_current" boolean not null default true,
    "idempotency_key" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."company_field_facts" enable row level security;


  create table "public"."company_identifiers" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "company_id" bigint not null,
    "identifier_type" text not null,
    "identifier_value" text not null,
    "normalized_value" text not null,
    "source_provider" text not null,
    "source_record_id" uuid,
    "is_primary" boolean not null default false,
    "first_seen_at" timestamp with time zone not null default now(),
    "last_seen_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."company_identifiers" enable row level security;


  create table "public"."company_list_members" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "company_list_id" uuid not null,
    "company_id" bigint not null,
    "source_record_id" uuid,
    "membership_status" text not null default 'included'::text,
    "selection_reason" jsonb not null default '[]'::jsonb,
    "added_by" uuid,
    "added_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."company_list_members" enable row level security;


  create table "public"."company_lists" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "name" text not null,
    "description" text,
    "status" text not null default 'active'::text,
    "source_query_id" uuid,
    "ingestion_job_id" uuid,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."company_lists" enable row level security;


  create table "public"."exports" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "company_list_id" uuid,
    "rule_run_id" uuid,
    "export_format" text not null,
    "status" text not null default 'queued'::text,
    "selected_fields" text[] not null default '{}'::text[],
    "filter_definition" jsonb not null default '{}'::jsonb,
    "storage_bucket" text,
    "storage_path" text,
    "checksum_sha256" text,
    "file_size_bytes" bigint,
    "row_count" integer,
    "idempotency_key" text not null,
    "requested_by" uuid,
    "requested_at" timestamp with time zone not null default now(),
    "completed_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "error_code" text,
    "error_message" text,
    "result" jsonb not null default '{}'::jsonb,
    "worker_id" text,
    "claimed_at" timestamp with time zone,
    "attempt_count" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."exports" enable row level security;


  create table "public"."field_mapping_sets" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "provider" text not null,
    "name" text not null,
    "description" text,
    "status" text not null default 'draft'::text,
    "is_locked" boolean not null default false,
    "current_version_number" integer,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."field_mapping_sets" enable row level security;


  create table "public"."field_mapping_versions" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "mapping_set_id" uuid not null,
    "version_number" integer not null,
    "status" text not null default 'draft'::text,
    "is_locked" boolean not null default false,
    "mapping_definition" jsonb not null,
    "source_schema_version" text,
    "canonical_schema_version" text not null default '1.0'::text,
    "change_note" text,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "published_at" timestamp with time zone
      );


alter table "public"."field_mapping_versions" enable row level security;


  create table "public"."ingestion_jobs" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "source_connection_id" uuid not null,
    "source_query_id" uuid,
    "mapping_version_id" uuid,
    "job_kind" text not null,
    "status" text not null default 'queued'::text,
    "idempotency_key" text not null,
    "external_job_id" text,
    "input_object_path" text,
    "input_params" jsonb not null default '{}'::jsonb,
    "requested_by" uuid,
    "requested_at" timestamp with time zone not null default now(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "received_count" integer not null default 0,
    "accepted_count" integer not null default 0,
    "rejected_count" integer not null default 0,
    "error_code" text,
    "error_message" text,
    "metrics" jsonb not null default '{}'::jsonb,
    "result" jsonb not null default '{}'::jsonb,
    "worker_id" text,
    "claimed_at" timestamp with time zone,
    "attempt_count" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."ingestion_jobs" enable row level security;


  create table "public"."manual_reviews" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "rule_result_id" uuid not null,
    "company_id" bigint not null,
    "reviewer_user_id" uuid not null default auth.uid(),
    "decision" text not null,
    "note" text,
    "is_current" boolean not null default true,
    "reviewed_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."manual_reviews" enable row level security;


  create table "public"."qualifications" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "company_id" bigint not null,
    "qualification_type" text not null,
    "qualification_name" text not null,
    "certificate_number" text,
    "issuing_authority" text,
    "status" text not null default 'unknown'::text,
    "issued_on" date,
    "expires_on" date,
    "evidence_id" uuid,
    "source_provider" text not null,
    "idempotency_key" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."qualifications" enable row level security;


  create table "public"."risk_events" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "company_id" bigint not null,
    "risk_type" text not null,
    "severity" text not null,
    "title" text not null,
    "description" text,
    "event_status" text not null default 'open'::text,
    "external_event_id" text,
    "amount" numeric(20,2),
    "currency" text not null default 'CNY'::text,
    "occurred_on" date,
    "resolved_on" date,
    "evidence_id" uuid,
    "source_provider" text not null,
    "idempotency_key" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."risk_events" enable row level security;


  create table "public"."rule_results" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "rule_run_id" uuid not null,
    "company_id" bigint not null,
    "decision" text not null,
    "score" numeric(12,4),
    "matched_rules" jsonb not null default '[]'::jsonb,
    "failed_rules" jsonb not null default '[]'::jsonb,
    "missing_fields" text[] not null default '{}'::text[],
    "evaluated_values" jsonb not null default '{}'::jsonb,
    "result_hash" text not null,
    "evaluated_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."rule_results" enable row level security;


  create table "public"."rule_runs" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "rule_version_id" uuid not null,
    "company_list_id" uuid not null,
    "run_mode" text not null default 'full'::text,
    "status" text not null default 'queued'::text,
    "engine_version" text not null,
    "input_manifest_hash" text not null,
    "run_config" jsonb not null default '{}'::jsonb,
    "idempotency_key" text not null,
    "requested_by" uuid,
    "requested_at" timestamp with time zone not null default now(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "total_count" integer not null default 0,
    "included_count" integer not null default 0,
    "excluded_count" integer not null default 0,
    "review_count" integer not null default 0,
    "error_code" text,
    "error_message" text,
    "result" jsonb not null default '{}'::jsonb,
    "worker_id" text,
    "claimed_at" timestamp with time zone,
    "attempt_count" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."rule_runs" enable row level security;


  create table "public"."rule_set_versions" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "rule_set_id" uuid not null,
    "version_number" integer not null,
    "status" text not null default 'draft'::text,
    "rule_definition" jsonb not null,
    "scoring_definition" jsonb not null default '{}'::jsonb,
    "canonical_schema_version" text not null default '1.0'::text,
    "change_note" text,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "published_at" timestamp with time zone
      );


alter table "public"."rule_set_versions" enable row level security;


  create table "public"."rule_sets" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "name" text not null,
    "description" text,
    "business_objective" text,
    "status" text not null default 'draft'::text,
    "current_version_number" integer,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."rule_sets" enable row level security;


  create table "public"."source_connections" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "provider" text not null,
    "name" text not null,
    "connection_kind" text not null,
    "status" text not null default 'draft'::text,
    "secret_reference" text,
    "has_secret_reference" boolean generated always as ((secret_reference IS NOT NULL)) stored,
    "connection_config" jsonb not null default '{}'::jsonb,
    "capabilities" text[] not null default '{}'::text[],
    "default_mapping_version_id" uuid,
    "external_connection_id" text,
    "last_verified_at" timestamp with time zone,
    "last_error_code" text,
    "created_by" uuid,
    "updated_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."source_connections" enable row level security;


  create table "public"."source_queries" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "source_connection_id" uuid not null,
    "query_kind" text not null,
    "query_text" text,
    "criteria" jsonb not null default '{}'::jsonb,
    "criteria_hash" text not null,
    "status" text not null default 'draft'::text,
    "external_query_id" text,
    "idempotency_key" text,
    "requested_by" uuid,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."source_queries" enable row level security;


  create table "public"."source_records" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "ingestion_job_id" uuid not null,
    "source_connection_id" uuid not null,
    "source_record_key" text not null,
    "record_kind" text not null,
    "raw_payload" jsonb not null,
    "content_hash" text not null,
    "source_observed_at" timestamp with time zone,
    "captured_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."source_records" enable row level security;


  create table "public"."source_snapshots" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "source_record_id" uuid not null,
    "mapping_version_id" uuid,
    "company_id" bigint,
    "canonical_schema_version" text not null default '1.0'::text,
    "normalized_payload" jsonb not null,
    "content_hash" text not null,
    "match_status" text not null default 'unmatched'::text,
    "mapping_warnings" jsonb not null default '[]'::jsonb,
    "captured_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."source_snapshots" enable row level security;


  create table "public"."workspace_members" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "user_id" uuid not null,
    "role" text not null,
    "status" text not null default 'active'::text,
    "invited_by" uuid,
    "joined_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."workspace_members" enable row level security;


  create table "public"."workspaces" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "slug" extensions.citext not null,
    "owner_user_id" uuid not null,
    "status" text not null default 'active'::text,
    "settings" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."workspaces" enable row level security;

alter table "public"."companies" add column "approved_on" date;

alter table "public"."companies" add column "business_scope" text;

alter table "public"."companies" add column "company_type" text;

alter table "public"."companies" add column "completeness_score" numeric(5,4);

alter table "public"."companies" add column "deduplication_key" text not null default ''::text;

alter table "public"."companies" add column "district" text;

alter table "public"."companies" add column "employee_count" integer;

alter table "public"."companies" add column "established_on" date;

alter table "public"."companies" add column "industry_code" text;

alter table "public"."companies" add column "industry_name" text;

alter table "public"."companies" add column "insured_employee_count" integer;

alter table "public"."companies" add column "last_verified_at" timestamp with time zone;

alter table "public"."companies" add column "legal_representative" text;

alter table "public"."companies" add column "merged_into_company_id" bigint;

alter table "public"."companies" add column "normalized_name" text not null default ''::text;

alter table "public"."companies" add column "operating_status" text;

alter table "public"."companies" add column "organization_code" text;

alter table "public"."companies" add column "paid_in_capital_amount" numeric(20,2);

alter table "public"."companies" add column "personnel_scale_text" text;

alter table "public"."companies" add column "primary_source" text;

alter table "public"."companies" add column "profile_status" text not null default 'unverified'::text;

alter table "public"."companies" add column "province" text;

alter table "public"."companies" add column "region_text" text;

alter table "public"."companies" add column "registered_capital_amount" numeric(20,2);

alter table "public"."companies" add column "registered_capital_currency" text not null default 'CNY'::text;

alter table "public"."companies" add column "registration_authority" text;

alter table "public"."companies" add column "registration_number" text;

alter table "public"."companies" add column "unified_social_credit_code" extensions.citext;

alter table "public"."companies" add column "updated_at" timestamp with time zone not null default now();

alter table "public"."companies" add column "workspace_id" uuid not null;

CREATE INDEX audit_logs_entity_idx ON public.audit_logs USING btree (workspace_id, entity_type, entity_id, occurred_at DESC);

CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id);

CREATE UNIQUE INDEX audit_logs_workspace_id_id_key ON public.audit_logs USING btree (workspace_id, id);

CREATE INDEX audit_logs_workspace_time_idx ON public.audit_logs USING btree (workspace_id, occurred_at DESC);

CREATE UNIQUE INDEX companies_workspace_deduplication_key_key ON public.companies USING btree (workspace_id, deduplication_key);

CREATE UNIQUE INDEX companies_workspace_id_id_key ON public.companies USING btree (workspace_id, id);

CREATE INDEX companies_workspace_normalized_name_idx ON public.companies USING btree (workspace_id, normalized_name);

CREATE INDEX companies_workspace_status_idx ON public.companies USING btree (workspace_id, profile_status, operating_status);

CREATE INDEX companies_workspace_updated_idx ON public.companies USING btree (workspace_id, updated_at DESC);

CREATE UNIQUE INDEX companies_workspace_uscc_key ON public.companies USING btree (workspace_id, unified_social_credit_code);

CREATE INDEX company_evidence_company_captured_idx ON public.company_evidence USING btree (workspace_id, company_id, captured_at DESC);

CREATE UNIQUE INDEX company_evidence_company_fingerprint_key ON public.company_evidence USING btree (workspace_id, company_id, evidence_fingerprint);

CREATE UNIQUE INDEX company_evidence_pkey ON public.company_evidence USING btree (id);

CREATE UNIQUE INDEX company_evidence_workspace_id_id_key ON public.company_evidence USING btree (workspace_id, id);

CREATE INDEX company_field_facts_current_company_idx ON public.company_field_facts USING btree (workspace_id, company_id, field_name) WHERE is_current;

CREATE UNIQUE INDEX company_field_facts_one_current_source_idx ON public.company_field_facts USING btree (workspace_id, company_id, field_name, source_provider) WHERE is_current;

CREATE UNIQUE INDEX company_field_facts_pkey ON public.company_field_facts USING btree (id);

CREATE UNIQUE INDEX company_field_facts_workspace_id_id_key ON public.company_field_facts USING btree (workspace_id, id);

CREATE UNIQUE INDEX company_field_facts_workspace_idempotency_key ON public.company_field_facts USING btree (workspace_id, idempotency_key);

CREATE UNIQUE INDEX company_identifiers_company_value_key ON public.company_identifiers USING btree (workspace_id, company_id, identifier_type, normalized_value);

CREATE UNIQUE INDEX company_identifiers_one_primary_type_idx ON public.company_identifiers USING btree (workspace_id, company_id, identifier_type) WHERE is_primary;

CREATE UNIQUE INDEX company_identifiers_pkey ON public.company_identifiers USING btree (id);

CREATE UNIQUE INDEX company_identifiers_unique_registry_value_idx ON public.company_identifiers USING btree (workspace_id, identifier_type, normalized_value) WHERE (identifier_type <> 'website_domain'::text);

CREATE UNIQUE INDEX company_identifiers_workspace_id_id_key ON public.company_identifiers USING btree (workspace_id, id);

CREATE UNIQUE INDEX company_list_members_list_company_key ON public.company_list_members USING btree (workspace_id, company_list_id, company_id);

CREATE INDEX company_list_members_list_status_idx ON public.company_list_members USING btree (workspace_id, company_list_id, membership_status);

CREATE UNIQUE INDEX company_list_members_pkey ON public.company_list_members USING btree (id);

CREATE UNIQUE INDEX company_list_members_workspace_id_id_key ON public.company_list_members USING btree (workspace_id, id);

CREATE UNIQUE INDEX company_lists_pkey ON public.company_lists USING btree (id);

CREATE UNIQUE INDEX company_lists_workspace_id_id_key ON public.company_lists USING btree (workspace_id, id);

CREATE UNIQUE INDEX company_lists_workspace_name_idx ON public.company_lists USING btree (workspace_id, lower(name));

CREATE UNIQUE INDEX exports_pkey ON public.exports USING btree (id);

CREATE INDEX exports_queue_claim_idx ON public.exports USING btree (requested_at, id) WHERE (status = 'queued'::text);

CREATE UNIQUE INDEX exports_storage_object_idx ON public.exports USING btree (workspace_id, storage_bucket, storage_path) WHERE ((storage_bucket IS NOT NULL) AND (storage_path IS NOT NULL));

CREATE UNIQUE INDEX exports_workspace_id_id_key ON public.exports USING btree (workspace_id, id);

CREATE UNIQUE INDEX exports_workspace_idempotency_key ON public.exports USING btree (workspace_id, idempotency_key);

CREATE INDEX exports_workspace_status_idx ON public.exports USING btree (workspace_id, status, requested_at DESC);

CREATE UNIQUE INDEX field_mapping_sets_pkey ON public.field_mapping_sets USING btree (id);

CREATE UNIQUE INDEX field_mapping_sets_workspace_id_id_key ON public.field_mapping_sets USING btree (workspace_id, id);

CREATE UNIQUE INDEX field_mapping_sets_workspace_name_key ON public.field_mapping_sets USING btree (workspace_id, provider, name);

CREATE INDEX field_mapping_sets_workspace_status_idx ON public.field_mapping_sets USING btree (workspace_id, status, updated_at DESC);

CREATE UNIQUE INDEX field_mapping_versions_pkey ON public.field_mapping_versions USING btree (id);

CREATE INDEX field_mapping_versions_set_created_idx ON public.field_mapping_versions USING btree (workspace_id, mapping_set_id, created_at DESC);

CREATE UNIQUE INDEX field_mapping_versions_set_version_key ON public.field_mapping_versions USING btree (workspace_id, mapping_set_id, version_number);

CREATE UNIQUE INDEX field_mapping_versions_workspace_id_id_key ON public.field_mapping_versions USING btree (workspace_id, id);

CREATE UNIQUE INDEX ingestion_jobs_pkey ON public.ingestion_jobs USING btree (id);

CREATE INDEX ingestion_jobs_queue_claim_idx ON public.ingestion_jobs USING btree (requested_at, id) WHERE (status = 'queued'::text);

CREATE UNIQUE INDEX ingestion_jobs_workspace_id_connection_key ON public.ingestion_jobs USING btree (workspace_id, id, source_connection_id);

CREATE UNIQUE INDEX ingestion_jobs_workspace_id_id_key ON public.ingestion_jobs USING btree (workspace_id, id);

CREATE UNIQUE INDEX ingestion_jobs_workspace_idempotency_key ON public.ingestion_jobs USING btree (workspace_id, idempotency_key);

CREATE INDEX ingestion_jobs_workspace_status_idx ON public.ingestion_jobs USING btree (workspace_id, status, requested_at DESC);

CREATE UNIQUE INDEX manual_reviews_one_current_idx ON public.manual_reviews USING btree (workspace_id, rule_result_id) WHERE is_current;

CREATE UNIQUE INDEX manual_reviews_pkey ON public.manual_reviews USING btree (id);

CREATE UNIQUE INDEX manual_reviews_workspace_id_id_key ON public.manual_reviews USING btree (workspace_id, id);

CREATE INDEX manual_reviews_workspace_recent_idx ON public.manual_reviews USING btree (workspace_id, reviewed_at DESC);

CREATE INDEX qualifications_company_expiry_idx ON public.qualifications USING btree (workspace_id, company_id, expires_on);

CREATE UNIQUE INDEX qualifications_pkey ON public.qualifications USING btree (id);

CREATE UNIQUE INDEX qualifications_workspace_id_id_key ON public.qualifications USING btree (workspace_id, id);

CREATE UNIQUE INDEX qualifications_workspace_idempotency_key ON public.qualifications USING btree (workspace_id, idempotency_key);

CREATE INDEX risk_events_company_severity_idx ON public.risk_events USING btree (workspace_id, company_id, severity, occurred_on DESC);

CREATE UNIQUE INDEX risk_events_pkey ON public.risk_events USING btree (id);

CREATE UNIQUE INDEX risk_events_workspace_id_id_key ON public.risk_events USING btree (workspace_id, id);

CREATE UNIQUE INDEX risk_events_workspace_idempotency_key ON public.risk_events USING btree (workspace_id, idempotency_key);

CREATE UNIQUE INDEX rule_results_pkey ON public.rule_results USING btree (id);

CREATE UNIQUE INDEX rule_results_run_company_key ON public.rule_results USING btree (workspace_id, rule_run_id, company_id);

CREATE INDEX rule_results_run_decision_idx ON public.rule_results USING btree (workspace_id, rule_run_id, decision, score DESC);

CREATE UNIQUE INDEX rule_results_workspace_id_company_key ON public.rule_results USING btree (workspace_id, id, company_id);

CREATE UNIQUE INDEX rule_results_workspace_id_id_key ON public.rule_results USING btree (workspace_id, id);

CREATE UNIQUE INDEX rule_runs_pkey ON public.rule_runs USING btree (id);

CREATE INDEX rule_runs_queue_claim_idx ON public.rule_runs USING btree (requested_at, id) WHERE (status = 'queued'::text);

CREATE UNIQUE INDEX rule_runs_workspace_id_id_key ON public.rule_runs USING btree (workspace_id, id);

CREATE UNIQUE INDEX rule_runs_workspace_idempotency_key ON public.rule_runs USING btree (workspace_id, idempotency_key);

CREATE INDEX rule_runs_workspace_status_idx ON public.rule_runs USING btree (workspace_id, status, requested_at DESC);

CREATE UNIQUE INDEX rule_set_versions_pkey ON public.rule_set_versions USING btree (id);

CREATE UNIQUE INDEX rule_set_versions_set_version_key ON public.rule_set_versions USING btree (workspace_id, rule_set_id, version_number);

CREATE UNIQUE INDEX rule_set_versions_workspace_id_id_key ON public.rule_set_versions USING btree (workspace_id, id);

CREATE UNIQUE INDEX rule_sets_pkey ON public.rule_sets USING btree (id);

CREATE UNIQUE INDEX rule_sets_workspace_id_id_key ON public.rule_sets USING btree (workspace_id, id);

CREATE UNIQUE INDEX rule_sets_workspace_name_key ON public.rule_sets USING btree (workspace_id, name);

CREATE INDEX rule_sets_workspace_status_idx ON public.rule_sets USING btree (workspace_id, status, updated_at DESC);

CREATE UNIQUE INDEX source_connections_pkey ON public.source_connections USING btree (id);

CREATE UNIQUE INDEX source_connections_workspace_id_id_key ON public.source_connections USING btree (workspace_id, id);

CREATE UNIQUE INDEX source_connections_workspace_name_key ON public.source_connections USING btree (workspace_id, name);

CREATE INDEX source_connections_workspace_status_idx ON public.source_connections USING btree (workspace_id, status, provider);

CREATE UNIQUE INDEX source_queries_pkey ON public.source_queries USING btree (id);

CREATE UNIQUE INDEX source_queries_workspace_id_connection_key ON public.source_queries USING btree (workspace_id, id, source_connection_id);

CREATE UNIQUE INDEX source_queries_workspace_id_id_key ON public.source_queries USING btree (workspace_id, id);

CREATE UNIQUE INDEX source_queries_workspace_idempotency_key ON public.source_queries USING btree (workspace_id, idempotency_key);

CREATE INDEX source_queries_workspace_status_idx ON public.source_queries USING btree (workspace_id, status, created_at DESC);

CREATE INDEX source_records_content_hash_idx ON public.source_records USING btree (workspace_id, content_hash);

CREATE UNIQUE INDEX source_records_job_record_key ON public.source_records USING btree (workspace_id, ingestion_job_id, source_record_key);

CREATE UNIQUE INDEX source_records_pkey ON public.source_records USING btree (id);

CREATE INDEX source_records_workspace_captured_idx ON public.source_records USING btree (workspace_id, captured_at DESC);

CREATE UNIQUE INDEX source_records_workspace_id_id_key ON public.source_records USING btree (workspace_id, id);

CREATE INDEX source_snapshots_company_captured_idx ON public.source_snapshots USING btree (workspace_id, company_id, captured_at DESC);

CREATE UNIQUE INDEX source_snapshots_pkey ON public.source_snapshots USING btree (id);

CREATE UNIQUE INDEX source_snapshots_source_hash_key ON public.source_snapshots USING btree (workspace_id, source_record_id, canonical_schema_version, content_hash);

CREATE UNIQUE INDEX source_snapshots_workspace_id_id_key ON public.source_snapshots USING btree (workspace_id, id);

CREATE UNIQUE INDEX workspace_members_one_owner_idx ON public.workspace_members USING btree (workspace_id) WHERE ((role = 'owner'::text) AND (status = 'active'::text));

CREATE UNIQUE INDEX workspace_members_pkey ON public.workspace_members USING btree (id);

CREATE INDEX workspace_members_user_active_idx ON public.workspace_members USING btree (user_id, workspace_id) WHERE (status = 'active'::text);

CREATE UNIQUE INDEX workspace_members_workspace_id_id_key ON public.workspace_members USING btree (workspace_id, id);

CREATE UNIQUE INDEX workspace_members_workspace_user_key ON public.workspace_members USING btree (workspace_id, user_id);

CREATE UNIQUE INDEX workspaces_pkey ON public.workspaces USING btree (id);

CREATE UNIQUE INDEX workspaces_slug_key ON public.workspaces USING btree (slug);

alter table "public"."audit_logs" add constraint "audit_logs_pkey" PRIMARY KEY using index "audit_logs_pkey";

alter table "public"."company_evidence" add constraint "company_evidence_pkey" PRIMARY KEY using index "company_evidence_pkey";

alter table "public"."company_field_facts" add constraint "company_field_facts_pkey" PRIMARY KEY using index "company_field_facts_pkey";

alter table "public"."company_identifiers" add constraint "company_identifiers_pkey" PRIMARY KEY using index "company_identifiers_pkey";

alter table "public"."company_list_members" add constraint "company_list_members_pkey" PRIMARY KEY using index "company_list_members_pkey";

alter table "public"."company_lists" add constraint "company_lists_pkey" PRIMARY KEY using index "company_lists_pkey";

alter table "public"."exports" add constraint "exports_pkey" PRIMARY KEY using index "exports_pkey";

alter table "public"."field_mapping_sets" add constraint "field_mapping_sets_pkey" PRIMARY KEY using index "field_mapping_sets_pkey";

alter table "public"."field_mapping_versions" add constraint "field_mapping_versions_pkey" PRIMARY KEY using index "field_mapping_versions_pkey";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_pkey" PRIMARY KEY using index "ingestion_jobs_pkey";

alter table "public"."manual_reviews" add constraint "manual_reviews_pkey" PRIMARY KEY using index "manual_reviews_pkey";

alter table "public"."qualifications" add constraint "qualifications_pkey" PRIMARY KEY using index "qualifications_pkey";

alter table "public"."risk_events" add constraint "risk_events_pkey" PRIMARY KEY using index "risk_events_pkey";

alter table "public"."rule_results" add constraint "rule_results_pkey" PRIMARY KEY using index "rule_results_pkey";

alter table "public"."rule_runs" add constraint "rule_runs_pkey" PRIMARY KEY using index "rule_runs_pkey";

alter table "public"."rule_set_versions" add constraint "rule_set_versions_pkey" PRIMARY KEY using index "rule_set_versions_pkey";

alter table "public"."rule_sets" add constraint "rule_sets_pkey" PRIMARY KEY using index "rule_sets_pkey";

alter table "public"."source_connections" add constraint "source_connections_pkey" PRIMARY KEY using index "source_connections_pkey";

alter table "public"."source_queries" add constraint "source_queries_pkey" PRIMARY KEY using index "source_queries_pkey";

alter table "public"."source_records" add constraint "source_records_pkey" PRIMARY KEY using index "source_records_pkey";

alter table "public"."source_snapshots" add constraint "source_snapshots_pkey" PRIMARY KEY using index "source_snapshots_pkey";

alter table "public"."workspace_members" add constraint "workspace_members_pkey" PRIMARY KEY using index "workspace_members_pkey";

alter table "public"."workspaces" add constraint "workspaces_pkey" PRIMARY KEY using index "workspaces_pkey";

alter table "public"."audit_logs" add constraint "audit_logs_action_not_blank" CHECK ((btrim(action) <> ''::text)) not valid;

alter table "public"."audit_logs" validate constraint "audit_logs_action_not_blank";

alter table "public"."audit_logs" add constraint "audit_logs_actor_type_check" CHECK ((actor_type = ANY (ARRAY['user'::text, 'service'::text, 'agent'::text, 'system'::text]))) not valid;

alter table "public"."audit_logs" validate constraint "audit_logs_actor_type_check";

alter table "public"."audit_logs" add constraint "audit_logs_actor_user_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."audit_logs" validate constraint "audit_logs_actor_user_fkey";

alter table "public"."audit_logs" add constraint "audit_logs_entity_type_not_blank" CHECK ((btrim(entity_type) <> ''::text)) not valid;

alter table "public"."audit_logs" validate constraint "audit_logs_entity_type_not_blank";

alter table "public"."audit_logs" add constraint "audit_logs_metadata_object" CHECK ((jsonb_typeof(metadata) = 'object'::text)) not valid;

alter table "public"."audit_logs" validate constraint "audit_logs_metadata_object";

alter table "public"."audit_logs" add constraint "audit_logs_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."audit_logs" validate constraint "audit_logs_workspace_fkey";

alter table "public"."audit_logs" add constraint "audit_logs_workspace_id_id_key" UNIQUE using index "audit_logs_workspace_id_id_key";

alter table "public"."companies" add constraint "companies_completeness_score_check" CHECK (((completeness_score IS NULL) OR ((completeness_score >= (0)::numeric) AND (completeness_score <= (1)::numeric)))) not valid;

alter table "public"."companies" validate constraint "companies_completeness_score_check";

alter table "public"."companies" add constraint "companies_employee_count_nonnegative" CHECK (((employee_count IS NULL) OR (employee_count >= 0))) not valid;

alter table "public"."companies" validate constraint "companies_employee_count_nonnegative";

alter table "public"."companies" add constraint "companies_insured_employee_count_nonnegative" CHECK (((insured_employee_count IS NULL) OR (insured_employee_count >= 0))) not valid;

alter table "public"."companies" validate constraint "companies_insured_employee_count_nonnegative";

alter table "public"."companies" add constraint "companies_merged_into_company_fkey" FOREIGN KEY (workspace_id, merged_into_company_id) REFERENCES public.companies(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."companies" validate constraint "companies_merged_into_company_fkey";

alter table "public"."companies" add constraint "companies_paid_in_capital_nonnegative" CHECK (((paid_in_capital_amount IS NULL) OR (paid_in_capital_amount >= (0)::numeric))) not valid;

alter table "public"."companies" validate constraint "companies_paid_in_capital_nonnegative";

alter table "public"."companies" add constraint "companies_profile_status_check" CHECK ((profile_status = ANY (ARRAY['unverified'::text, 'verified'::text, 'conflicted'::text, 'merged'::text, 'archived'::text]))) not valid;

alter table "public"."companies" validate constraint "companies_profile_status_check";

alter table "public"."companies" add constraint "companies_registered_capital_nonnegative" CHECK (((registered_capital_amount IS NULL) OR (registered_capital_amount >= (0)::numeric))) not valid;

alter table "public"."companies" validate constraint "companies_registered_capital_nonnegative";

alter table "public"."companies" add constraint "companies_workspace_deduplication_key_key" UNIQUE using index "companies_workspace_deduplication_key_key";

alter table "public"."companies" add constraint "companies_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."companies" validate constraint "companies_workspace_id_fkey";

alter table "public"."companies" add constraint "companies_workspace_id_id_key" UNIQUE using index "companies_workspace_id_id_key";

alter table "public"."companies" add constraint "companies_workspace_uscc_key" UNIQUE using index "companies_workspace_uscc_key";

alter table "public"."company_evidence" add constraint "company_evidence_company_fingerprint_key" UNIQUE using index "company_evidence_company_fingerprint_key";

alter table "public"."company_evidence" add constraint "company_evidence_company_fkey" FOREIGN KEY (workspace_id, company_id) REFERENCES public.companies(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."company_evidence" validate constraint "company_evidence_company_fkey";

alter table "public"."company_evidence" add constraint "company_evidence_expiry_order" CHECK (((expires_at IS NULL) OR (expires_at >= captured_at))) not valid;

alter table "public"."company_evidence" validate constraint "company_evidence_expiry_order";

alter table "public"."company_evidence" add constraint "company_evidence_fingerprint_not_blank" CHECK ((btrim(evidence_fingerprint) <> ''::text)) not valid;

alter table "public"."company_evidence" validate constraint "company_evidence_fingerprint_not_blank";

alter table "public"."company_evidence" add constraint "company_evidence_metadata_object" CHECK ((jsonb_typeof(metadata) = 'object'::text)) not valid;

alter table "public"."company_evidence" validate constraint "company_evidence_metadata_object";

alter table "public"."company_evidence" add constraint "company_evidence_source_not_blank" CHECK ((btrim(source_provider) <> ''::text)) not valid;

alter table "public"."company_evidence" validate constraint "company_evidence_source_not_blank";

alter table "public"."company_evidence" add constraint "company_evidence_source_record_fkey" FOREIGN KEY (workspace_id, source_record_id) REFERENCES public.source_records(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."company_evidence" validate constraint "company_evidence_source_record_fkey";

alter table "public"."company_evidence" add constraint "company_evidence_source_snapshot_fkey" FOREIGN KEY (workspace_id, source_snapshot_id) REFERENCES public.source_snapshots(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."company_evidence" validate constraint "company_evidence_source_snapshot_fkey";

alter table "public"."company_evidence" add constraint "company_evidence_status_check" CHECK ((evidence_status = ANY (ARRAY['unverified'::text, 'verified'::text, 'stale'::text, 'rejected'::text]))) not valid;

alter table "public"."company_evidence" validate constraint "company_evidence_status_check";

alter table "public"."company_evidence" add constraint "company_evidence_title_not_blank" CHECK ((btrim(title) <> ''::text)) not valid;

alter table "public"."company_evidence" validate constraint "company_evidence_title_not_blank";

alter table "public"."company_evidence" add constraint "company_evidence_type_check" CHECK ((evidence_type = ANY (ARRAY['registration'::text, 'operation'::text, 'risk'::text, 'qualification'::text, 'tender'::text, 'web'::text, 'uploaded_document'::text, 'manual_note'::text, 'other'::text]))) not valid;

alter table "public"."company_evidence" validate constraint "company_evidence_type_check";

alter table "public"."company_evidence" add constraint "company_evidence_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."company_evidence" validate constraint "company_evidence_workspace_fkey";

alter table "public"."company_evidence" add constraint "company_evidence_workspace_id_id_key" UNIQUE using index "company_evidence_workspace_id_id_key";

alter table "public"."company_field_facts" add constraint "company_field_facts_company_fkey" FOREIGN KEY (workspace_id, company_id) REFERENCES public.companies(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."company_field_facts" validate constraint "company_field_facts_company_fkey";

alter table "public"."company_field_facts" add constraint "company_field_facts_confidence_check" CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))) not valid;

alter table "public"."company_field_facts" validate constraint "company_field_facts_confidence_check";

alter table "public"."company_field_facts" add constraint "company_field_facts_evidence_fkey" FOREIGN KEY (workspace_id, evidence_id) REFERENCES public.company_evidence(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."company_field_facts" validate constraint "company_field_facts_evidence_fkey";

alter table "public"."company_field_facts" add constraint "company_field_facts_field_not_blank" CHECK ((btrim(field_name) <> ''::text)) not valid;

alter table "public"."company_field_facts" validate constraint "company_field_facts_field_not_blank";

alter table "public"."company_field_facts" add constraint "company_field_facts_idempotency_not_blank" CHECK ((btrim(idempotency_key) <> ''::text)) not valid;

alter table "public"."company_field_facts" validate constraint "company_field_facts_idempotency_not_blank";

alter table "public"."company_field_facts" add constraint "company_field_facts_source_not_blank" CHECK ((btrim(source_provider) <> ''::text)) not valid;

alter table "public"."company_field_facts" validate constraint "company_field_facts_source_not_blank";

alter table "public"."company_field_facts" add constraint "company_field_facts_source_record_fkey" FOREIGN KEY (workspace_id, source_record_id) REFERENCES public.source_records(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."company_field_facts" validate constraint "company_field_facts_source_record_fkey";

alter table "public"."company_field_facts" add constraint "company_field_facts_source_snapshot_fkey" FOREIGN KEY (workspace_id, source_snapshot_id) REFERENCES public.source_snapshots(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."company_field_facts" validate constraint "company_field_facts_source_snapshot_fkey";

alter table "public"."company_field_facts" add constraint "company_field_facts_validity_order" CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from))) not valid;

alter table "public"."company_field_facts" validate constraint "company_field_facts_validity_order";

alter table "public"."company_field_facts" add constraint "company_field_facts_value_type_check" CHECK ((value_type = ANY (ARRAY['string'::text, 'number'::text, 'boolean'::text, 'date'::text, 'datetime'::text, 'money'::text, 'array'::text, 'object'::text, 'null'::text]))) not valid;

alter table "public"."company_field_facts" validate constraint "company_field_facts_value_type_check";

alter table "public"."company_field_facts" add constraint "company_field_facts_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."company_field_facts" validate constraint "company_field_facts_workspace_fkey";

alter table "public"."company_field_facts" add constraint "company_field_facts_workspace_id_id_key" UNIQUE using index "company_field_facts_workspace_id_id_key";

alter table "public"."company_field_facts" add constraint "company_field_facts_workspace_idempotency_key" UNIQUE using index "company_field_facts_workspace_idempotency_key";

alter table "public"."company_identifiers" add constraint "company_identifiers_company_fkey" FOREIGN KEY (workspace_id, company_id) REFERENCES public.companies(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."company_identifiers" validate constraint "company_identifiers_company_fkey";

alter table "public"."company_identifiers" add constraint "company_identifiers_company_value_key" UNIQUE using index "company_identifiers_company_value_key";

alter table "public"."company_identifiers" add constraint "company_identifiers_seen_order" CHECK ((last_seen_at >= first_seen_at)) not valid;

alter table "public"."company_identifiers" validate constraint "company_identifiers_seen_order";

alter table "public"."company_identifiers" add constraint "company_identifiers_source_not_blank" CHECK ((btrim(source_provider) <> ''::text)) not valid;

alter table "public"."company_identifiers" validate constraint "company_identifiers_source_not_blank";

alter table "public"."company_identifiers" add constraint "company_identifiers_source_record_fkey" FOREIGN KEY (workspace_id, source_record_id) REFERENCES public.source_records(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."company_identifiers" validate constraint "company_identifiers_source_record_fkey";

alter table "public"."company_identifiers" add constraint "company_identifiers_type_check" CHECK ((identifier_type = ANY (ARRAY['unified_social_credit_code'::text, 'registration_number'::text, 'organization_code'::text, 'taxpayer_id'::text, 'qcc_key_no'::text, 'huoke_company_id'::text, 'website_domain'::text, 'other'::text]))) not valid;

alter table "public"."company_identifiers" validate constraint "company_identifiers_type_check";

alter table "public"."company_identifiers" add constraint "company_identifiers_value_not_blank" CHECK (((btrim(identifier_value) <> ''::text) AND (btrim(normalized_value) <> ''::text))) not valid;

alter table "public"."company_identifiers" validate constraint "company_identifiers_value_not_blank";

alter table "public"."company_identifiers" add constraint "company_identifiers_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."company_identifiers" validate constraint "company_identifiers_workspace_fkey";

alter table "public"."company_identifiers" add constraint "company_identifiers_workspace_id_id_key" UNIQUE using index "company_identifiers_workspace_id_id_key";

alter table "public"."company_list_members" add constraint "company_list_members_added_by_fkey" FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."company_list_members" validate constraint "company_list_members_added_by_fkey";

alter table "public"."company_list_members" add constraint "company_list_members_company_fkey" FOREIGN KEY (workspace_id, company_id) REFERENCES public.companies(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."company_list_members" validate constraint "company_list_members_company_fkey";

alter table "public"."company_list_members" add constraint "company_list_members_list_company_key" UNIQUE using index "company_list_members_list_company_key";

alter table "public"."company_list_members" add constraint "company_list_members_list_fkey" FOREIGN KEY (workspace_id, company_list_id) REFERENCES public.company_lists(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."company_list_members" validate constraint "company_list_members_list_fkey";

alter table "public"."company_list_members" add constraint "company_list_members_reason_array" CHECK ((jsonb_typeof(selection_reason) = 'array'::text)) not valid;

alter table "public"."company_list_members" validate constraint "company_list_members_reason_array";

alter table "public"."company_list_members" add constraint "company_list_members_source_record_fkey" FOREIGN KEY (workspace_id, source_record_id) REFERENCES public.source_records(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."company_list_members" validate constraint "company_list_members_source_record_fkey";

alter table "public"."company_list_members" add constraint "company_list_members_status_check" CHECK ((membership_status = ANY (ARRAY['included'::text, 'excluded'::text, 'needs_review'::text]))) not valid;

alter table "public"."company_list_members" validate constraint "company_list_members_status_check";

alter table "public"."company_list_members" add constraint "company_list_members_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."company_list_members" validate constraint "company_list_members_workspace_fkey";

alter table "public"."company_list_members" add constraint "company_list_members_workspace_id_id_key" UNIQUE using index "company_list_members_workspace_id_id_key";

alter table "public"."company_lists" add constraint "company_lists_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."company_lists" validate constraint "company_lists_created_by_fkey";

alter table "public"."company_lists" add constraint "company_lists_ingestion_job_fkey" FOREIGN KEY (workspace_id, ingestion_job_id) REFERENCES public.ingestion_jobs(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."company_lists" validate constraint "company_lists_ingestion_job_fkey";

alter table "public"."company_lists" add constraint "company_lists_name_not_blank" CHECK ((btrim(name) <> ''::text)) not valid;

alter table "public"."company_lists" validate constraint "company_lists_name_not_blank";

alter table "public"."company_lists" add constraint "company_lists_source_query_fkey" FOREIGN KEY (workspace_id, source_query_id) REFERENCES public.source_queries(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."company_lists" validate constraint "company_lists_source_query_fkey";

alter table "public"."company_lists" add constraint "company_lists_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'locked'::text, 'archived'::text]))) not valid;

alter table "public"."company_lists" validate constraint "company_lists_status_check";

alter table "public"."company_lists" add constraint "company_lists_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."company_lists" validate constraint "company_lists_workspace_fkey";

alter table "public"."company_lists" add constraint "company_lists_workspace_id_id_key" UNIQUE using index "company_lists_workspace_id_id_key";

alter table "public"."exports" add constraint "exports_attempt_count_nonnegative" CHECK ((attempt_count >= 0)) not valid;

alter table "public"."exports" validate constraint "exports_attempt_count_nonnegative";

alter table "public"."exports" add constraint "exports_company_list_fkey" FOREIGN KEY (workspace_id, company_list_id) REFERENCES public.company_lists(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."exports" validate constraint "exports_company_list_fkey";

alter table "public"."exports" add constraint "exports_expiry_order" CHECK (((expires_at IS NULL) OR (completed_at IS NULL) OR (expires_at >= completed_at))) not valid;

alter table "public"."exports" validate constraint "exports_expiry_order";

alter table "public"."exports" add constraint "exports_file_size_nonnegative" CHECK (((file_size_bytes IS NULL) OR (file_size_bytes >= 0))) not valid;

alter table "public"."exports" validate constraint "exports_file_size_nonnegative";

alter table "public"."exports" add constraint "exports_filter_object" CHECK ((jsonb_typeof(filter_definition) = 'object'::text)) not valid;

alter table "public"."exports" validate constraint "exports_filter_object";

alter table "public"."exports" add constraint "exports_format_check" CHECK ((export_format = ANY (ARRAY['csv'::text, 'xlsx'::text, 'json'::text, 'html'::text]))) not valid;

alter table "public"."exports" validate constraint "exports_format_check";

alter table "public"."exports" add constraint "exports_idempotency_format" CHECK ((((length(idempotency_key) >= 16) AND (length(idempotency_key) <= 128)) AND (idempotency_key ~ '^[A-Za-z0-9._:-]+$'::text))) not valid;

alter table "public"."exports" validate constraint "exports_idempotency_format";

alter table "public"."exports" add constraint "exports_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."exports" validate constraint "exports_requested_by_fkey";

alter table "public"."exports" add constraint "exports_result_object" CHECK ((jsonb_typeof(result) = 'object'::text)) not valid;

alter table "public"."exports" validate constraint "exports_result_object";

alter table "public"."exports" add constraint "exports_row_count_nonnegative" CHECK (((row_count IS NULL) OR (row_count >= 0))) not valid;

alter table "public"."exports" validate constraint "exports_row_count_nonnegative";

alter table "public"."exports" add constraint "exports_rule_run_fkey" FOREIGN KEY (workspace_id, rule_run_id) REFERENCES public.rule_runs(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."exports" validate constraint "exports_rule_run_fkey";

alter table "public"."exports" add constraint "exports_scope_present" CHECK ((num_nonnulls(company_list_id, rule_run_id) >= 1)) not valid;

alter table "public"."exports" validate constraint "exports_scope_present";

alter table "public"."exports" add constraint "exports_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'expired'::text, 'cancelled'::text]))) not valid;

alter table "public"."exports" validate constraint "exports_status_check";

alter table "public"."exports" add constraint "exports_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."exports" validate constraint "exports_workspace_fkey";

alter table "public"."exports" add constraint "exports_workspace_id_id_key" UNIQUE using index "exports_workspace_id_id_key";

alter table "public"."exports" add constraint "exports_workspace_idempotency_key" UNIQUE using index "exports_workspace_idempotency_key";

alter table "public"."field_mapping_sets" add constraint "field_mapping_sets_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."field_mapping_sets" validate constraint "field_mapping_sets_created_by_fkey";

alter table "public"."field_mapping_sets" add constraint "field_mapping_sets_provider_check" CHECK ((provider = ANY (ARRAY['qcc'::text, 'huoke_assistant'::text, 'file_upload'::text, 'web_search'::text, 'other'::text]))) not valid;

alter table "public"."field_mapping_sets" validate constraint "field_mapping_sets_provider_check";

alter table "public"."field_mapping_sets" add constraint "field_mapping_sets_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]))) not valid;

alter table "public"."field_mapping_sets" validate constraint "field_mapping_sets_status_check";

alter table "public"."field_mapping_sets" add constraint "field_mapping_sets_version_positive" CHECK (((current_version_number IS NULL) OR (current_version_number > 0))) not valid;

alter table "public"."field_mapping_sets" validate constraint "field_mapping_sets_version_positive";

alter table "public"."field_mapping_sets" add constraint "field_mapping_sets_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."field_mapping_sets" validate constraint "field_mapping_sets_workspace_fkey";

alter table "public"."field_mapping_sets" add constraint "field_mapping_sets_workspace_id_id_key" UNIQUE using index "field_mapping_sets_workspace_id_id_key";

alter table "public"."field_mapping_sets" add constraint "field_mapping_sets_workspace_name_key" UNIQUE using index "field_mapping_sets_workspace_name_key";

alter table "public"."field_mapping_versions" add constraint "field_mapping_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."field_mapping_versions" validate constraint "field_mapping_versions_created_by_fkey";

alter table "public"."field_mapping_versions" add constraint "field_mapping_versions_definition_object" CHECK ((jsonb_typeof(mapping_definition) = 'object'::text)) not valid;

alter table "public"."field_mapping_versions" validate constraint "field_mapping_versions_definition_object";

alter table "public"."field_mapping_versions" add constraint "field_mapping_versions_mapping_set_fkey" FOREIGN KEY (workspace_id, mapping_set_id) REFERENCES public.field_mapping_sets(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."field_mapping_versions" validate constraint "field_mapping_versions_mapping_set_fkey";

alter table "public"."field_mapping_versions" add constraint "field_mapping_versions_set_version_key" UNIQUE using index "field_mapping_versions_set_version_key";

alter table "public"."field_mapping_versions" add constraint "field_mapping_versions_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'retired'::text]))) not valid;

alter table "public"."field_mapping_versions" validate constraint "field_mapping_versions_status_check";

alter table "public"."field_mapping_versions" add constraint "field_mapping_versions_version_positive" CHECK ((version_number > 0)) not valid;

alter table "public"."field_mapping_versions" validate constraint "field_mapping_versions_version_positive";

alter table "public"."field_mapping_versions" add constraint "field_mapping_versions_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."field_mapping_versions" validate constraint "field_mapping_versions_workspace_fkey";

alter table "public"."field_mapping_versions" add constraint "field_mapping_versions_workspace_id_id_key" UNIQUE using index "field_mapping_versions_workspace_id_id_key";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_attempt_count_nonnegative" CHECK ((attempt_count >= 0)) not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_attempt_count_nonnegative";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_connection_fkey" FOREIGN KEY (workspace_id, source_connection_id) REFERENCES public.source_connections(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_connection_fkey";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_counts_consistent" CHECK (((accepted_count + rejected_count) <= received_count)) not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_counts_consistent";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_counts_nonnegative" CHECK (((received_count >= 0) AND (accepted_count >= 0) AND (rejected_count >= 0))) not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_counts_nonnegative";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_idempotency_format" CHECK ((((length(idempotency_key) >= 16) AND (length(idempotency_key) <= 128)) AND (idempotency_key ~ '^[A-Za-z0-9._:-]+$'::text))) not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_idempotency_format";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_input_params_object" CHECK ((jsonb_typeof(input_params) = 'object'::text)) not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_input_params_object";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_kind_check" CHECK ((job_kind = ANY (ARRAY['query'::text, 'import'::text, 'enrich'::text, 'refresh'::text, 'connection_test'::text]))) not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_kind_check";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_mapping_version_fkey" FOREIGN KEY (workspace_id, mapping_version_id) REFERENCES public.field_mapping_versions(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_mapping_version_fkey";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_metrics_object" CHECK ((jsonb_typeof(metrics) = 'object'::text)) not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_metrics_object";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_no_inline_secrets" CHECK (((input_params)::text !~* '"(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization|private[_-]?key)"[[:space:]]*:'::text)) not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_no_inline_secrets";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_query_fkey" FOREIGN KEY (workspace_id, source_query_id, source_connection_id) REFERENCES public.source_queries(workspace_id, id, source_connection_id) ON DELETE RESTRICT not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_query_fkey";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_requested_by_fkey";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_result_object" CHECK ((jsonb_typeof(result) = 'object'::text)) not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_result_object";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'partial'::text, 'failed'::text, 'cancelled'::text]))) not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_status_check";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_time_order" CHECK (((completed_at IS NULL) OR (started_at IS NULL) OR (completed_at >= started_at))) not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_time_order";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."ingestion_jobs" validate constraint "ingestion_jobs_workspace_fkey";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_workspace_id_connection_key" UNIQUE using index "ingestion_jobs_workspace_id_connection_key";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_workspace_id_id_key" UNIQUE using index "ingestion_jobs_workspace_id_id_key";

alter table "public"."ingestion_jobs" add constraint "ingestion_jobs_workspace_idempotency_key" UNIQUE using index "ingestion_jobs_workspace_idempotency_key";

alter table "public"."manual_reviews" add constraint "manual_reviews_decision_check" CHECK ((decision = ANY (ARRAY['approve'::text, 'reject'::text, 'needs_information'::text]))) not valid;

alter table "public"."manual_reviews" validate constraint "manual_reviews_decision_check";

alter table "public"."manual_reviews" add constraint "manual_reviews_reviewer_fkey" FOREIGN KEY (reviewer_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."manual_reviews" validate constraint "manual_reviews_reviewer_fkey";

alter table "public"."manual_reviews" add constraint "manual_reviews_rule_result_company_fkey" FOREIGN KEY (workspace_id, rule_result_id, company_id) REFERENCES public.rule_results(workspace_id, id, company_id) ON DELETE RESTRICT not valid;

alter table "public"."manual_reviews" validate constraint "manual_reviews_rule_result_company_fkey";

alter table "public"."manual_reviews" add constraint "manual_reviews_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."manual_reviews" validate constraint "manual_reviews_workspace_fkey";

alter table "public"."manual_reviews" add constraint "manual_reviews_workspace_id_id_key" UNIQUE using index "manual_reviews_workspace_id_id_key";

alter table "public"."qualifications" add constraint "qualifications_company_fkey" FOREIGN KEY (workspace_id, company_id) REFERENCES public.companies(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."qualifications" validate constraint "qualifications_company_fkey";

alter table "public"."qualifications" add constraint "qualifications_evidence_fkey" FOREIGN KEY (workspace_id, evidence_id) REFERENCES public.company_evidence(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."qualifications" validate constraint "qualifications_evidence_fkey";

alter table "public"."qualifications" add constraint "qualifications_expiry_order" CHECK (((expires_on IS NULL) OR (issued_on IS NULL) OR (expires_on >= issued_on))) not valid;

alter table "public"."qualifications" validate constraint "qualifications_expiry_order";

alter table "public"."qualifications" add constraint "qualifications_idempotency_not_blank" CHECK ((btrim(idempotency_key) <> ''::text)) not valid;

alter table "public"."qualifications" validate constraint "qualifications_idempotency_not_blank";

alter table "public"."qualifications" add constraint "qualifications_name_not_blank" CHECK ((btrim(qualification_name) <> ''::text)) not valid;

alter table "public"."qualifications" validate constraint "qualifications_name_not_blank";

alter table "public"."qualifications" add constraint "qualifications_status_check" CHECK ((status = ANY (ARRAY['valid'::text, 'expired'::text, 'revoked'::text, 'unknown'::text]))) not valid;

alter table "public"."qualifications" validate constraint "qualifications_status_check";

alter table "public"."qualifications" add constraint "qualifications_type_not_blank" CHECK ((btrim(qualification_type) <> ''::text)) not valid;

alter table "public"."qualifications" validate constraint "qualifications_type_not_blank";

alter table "public"."qualifications" add constraint "qualifications_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."qualifications" validate constraint "qualifications_workspace_fkey";

alter table "public"."qualifications" add constraint "qualifications_workspace_id_id_key" UNIQUE using index "qualifications_workspace_id_id_key";

alter table "public"."qualifications" add constraint "qualifications_workspace_idempotency_key" UNIQUE using index "qualifications_workspace_idempotency_key";

alter table "public"."risk_events" add constraint "risk_events_amount_nonnegative" CHECK (((amount IS NULL) OR (amount >= (0)::numeric))) not valid;

alter table "public"."risk_events" validate constraint "risk_events_amount_nonnegative";

alter table "public"."risk_events" add constraint "risk_events_company_fkey" FOREIGN KEY (workspace_id, company_id) REFERENCES public.companies(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."risk_events" validate constraint "risk_events_company_fkey";

alter table "public"."risk_events" add constraint "risk_events_evidence_fkey" FOREIGN KEY (workspace_id, evidence_id) REFERENCES public.company_evidence(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."risk_events" validate constraint "risk_events_evidence_fkey";

alter table "public"."risk_events" add constraint "risk_events_idempotency_not_blank" CHECK ((btrim(idempotency_key) <> ''::text)) not valid;

alter table "public"."risk_events" validate constraint "risk_events_idempotency_not_blank";

alter table "public"."risk_events" add constraint "risk_events_resolution_order" CHECK (((resolved_on IS NULL) OR (occurred_on IS NULL) OR (resolved_on >= occurred_on))) not valid;

alter table "public"."risk_events" validate constraint "risk_events_resolution_order";

alter table "public"."risk_events" add constraint "risk_events_severity_check" CHECK ((severity = ANY (ARRAY['info'::text, 'low'::text, 'medium'::text, 'high'::text, 'critical'::text]))) not valid;

alter table "public"."risk_events" validate constraint "risk_events_severity_check";

alter table "public"."risk_events" add constraint "risk_events_status_check" CHECK ((event_status = ANY (ARRAY['open'::text, 'resolved'::text, 'dismissed'::text, 'unknown'::text]))) not valid;

alter table "public"."risk_events" validate constraint "risk_events_status_check";

alter table "public"."risk_events" add constraint "risk_events_title_not_blank" CHECK ((btrim(title) <> ''::text)) not valid;

alter table "public"."risk_events" validate constraint "risk_events_title_not_blank";

alter table "public"."risk_events" add constraint "risk_events_type_not_blank" CHECK ((btrim(risk_type) <> ''::text)) not valid;

alter table "public"."risk_events" validate constraint "risk_events_type_not_blank";

alter table "public"."risk_events" add constraint "risk_events_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."risk_events" validate constraint "risk_events_workspace_fkey";

alter table "public"."risk_events" add constraint "risk_events_workspace_id_id_key" UNIQUE using index "risk_events_workspace_id_id_key";

alter table "public"."risk_events" add constraint "risk_events_workspace_idempotency_key" UNIQUE using index "risk_events_workspace_idempotency_key";

alter table "public"."rule_results" add constraint "rule_results_company_fkey" FOREIGN KEY (workspace_id, company_id) REFERENCES public.companies(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."rule_results" validate constraint "rule_results_company_fkey";

alter table "public"."rule_results" add constraint "rule_results_decision_check" CHECK ((decision = ANY (ARRAY['include'::text, 'exclude'::text, 'needs_review'::text]))) not valid;

alter table "public"."rule_results" validate constraint "rule_results_decision_check";

alter table "public"."rule_results" add constraint "rule_results_evaluated_values_object" CHECK ((jsonb_typeof(evaluated_values) = 'object'::text)) not valid;

alter table "public"."rule_results" validate constraint "rule_results_evaluated_values_object";

alter table "public"."rule_results" add constraint "rule_results_failed_rules_array" CHECK ((jsonb_typeof(failed_rules) = 'array'::text)) not valid;

alter table "public"."rule_results" validate constraint "rule_results_failed_rules_array";

alter table "public"."rule_results" add constraint "rule_results_hash_not_blank" CHECK ((btrim(result_hash) <> ''::text)) not valid;

alter table "public"."rule_results" validate constraint "rule_results_hash_not_blank";

alter table "public"."rule_results" add constraint "rule_results_matched_rules_array" CHECK ((jsonb_typeof(matched_rules) = 'array'::text)) not valid;

alter table "public"."rule_results" validate constraint "rule_results_matched_rules_array";

alter table "public"."rule_results" add constraint "rule_results_rule_run_fkey" FOREIGN KEY (workspace_id, rule_run_id) REFERENCES public.rule_runs(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."rule_results" validate constraint "rule_results_rule_run_fkey";

alter table "public"."rule_results" add constraint "rule_results_run_company_key" UNIQUE using index "rule_results_run_company_key";

alter table "public"."rule_results" add constraint "rule_results_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."rule_results" validate constraint "rule_results_workspace_fkey";

alter table "public"."rule_results" add constraint "rule_results_workspace_id_company_key" UNIQUE using index "rule_results_workspace_id_company_key";

alter table "public"."rule_results" add constraint "rule_results_workspace_id_id_key" UNIQUE using index "rule_results_workspace_id_id_key";

alter table "public"."rule_runs" add constraint "rule_runs_attempt_count_nonnegative" CHECK ((attempt_count >= 0)) not valid;

alter table "public"."rule_runs" validate constraint "rule_runs_attempt_count_nonnegative";

alter table "public"."rule_runs" add constraint "rule_runs_company_list_fkey" FOREIGN KEY (workspace_id, company_list_id) REFERENCES public.company_lists(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."rule_runs" validate constraint "rule_runs_company_list_fkey";

alter table "public"."rule_runs" add constraint "rule_runs_config_object" CHECK ((jsonb_typeof(run_config) = 'object'::text)) not valid;

alter table "public"."rule_runs" validate constraint "rule_runs_config_object";

alter table "public"."rule_runs" add constraint "rule_runs_counts_consistent" CHECK ((((included_count + excluded_count) + review_count) <= total_count)) not valid;

alter table "public"."rule_runs" validate constraint "rule_runs_counts_consistent";

alter table "public"."rule_runs" add constraint "rule_runs_counts_nonnegative" CHECK (((total_count >= 0) AND (included_count >= 0) AND (excluded_count >= 0) AND (review_count >= 0))) not valid;

alter table "public"."rule_runs" validate constraint "rule_runs_counts_nonnegative";

alter table "public"."rule_runs" add constraint "rule_runs_hash_not_blank" CHECK ((btrim(input_manifest_hash) <> ''::text)) not valid;

alter table "public"."rule_runs" validate constraint "rule_runs_hash_not_blank";

alter table "public"."rule_runs" add constraint "rule_runs_idempotency_format" CHECK ((((length(idempotency_key) >= 16) AND (length(idempotency_key) <= 128)) AND (idempotency_key ~ '^[A-Za-z0-9._:-]+$'::text))) not valid;

alter table "public"."rule_runs" validate constraint "rule_runs_idempotency_format";

alter table "public"."rule_runs" add constraint "rule_runs_mode_check" CHECK ((run_mode = ANY (ARRAY['sample'::text, 'full'::text]))) not valid;

alter table "public"."rule_runs" validate constraint "rule_runs_mode_check";

alter table "public"."rule_runs" add constraint "rule_runs_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."rule_runs" validate constraint "rule_runs_requested_by_fkey";

alter table "public"."rule_runs" add constraint "rule_runs_result_object" CHECK ((jsonb_typeof(result) = 'object'::text)) not valid;

alter table "public"."rule_runs" validate constraint "rule_runs_result_object";

alter table "public"."rule_runs" add constraint "rule_runs_rule_version_fkey" FOREIGN KEY (workspace_id, rule_version_id) REFERENCES public.rule_set_versions(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."rule_runs" validate constraint "rule_runs_rule_version_fkey";

alter table "public"."rule_runs" add constraint "rule_runs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'partial'::text, 'failed'::text, 'cancelled'::text]))) not valid;

alter table "public"."rule_runs" validate constraint "rule_runs_status_check";

alter table "public"."rule_runs" add constraint "rule_runs_time_order" CHECK (((completed_at IS NULL) OR (started_at IS NULL) OR (completed_at >= started_at))) not valid;

alter table "public"."rule_runs" validate constraint "rule_runs_time_order";

alter table "public"."rule_runs" add constraint "rule_runs_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."rule_runs" validate constraint "rule_runs_workspace_fkey";

alter table "public"."rule_runs" add constraint "rule_runs_workspace_id_id_key" UNIQUE using index "rule_runs_workspace_id_id_key";

alter table "public"."rule_runs" add constraint "rule_runs_workspace_idempotency_key" UNIQUE using index "rule_runs_workspace_idempotency_key";

alter table "public"."rule_set_versions" add constraint "rule_set_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."rule_set_versions" validate constraint "rule_set_versions_created_by_fkey";

alter table "public"."rule_set_versions" add constraint "rule_set_versions_definition_object" CHECK ((jsonb_typeof(rule_definition) = 'object'::text)) not valid;

alter table "public"."rule_set_versions" validate constraint "rule_set_versions_definition_object";

alter table "public"."rule_set_versions" add constraint "rule_set_versions_rule_set_fkey" FOREIGN KEY (workspace_id, rule_set_id) REFERENCES public.rule_sets(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."rule_set_versions" validate constraint "rule_set_versions_rule_set_fkey";

alter table "public"."rule_set_versions" add constraint "rule_set_versions_scoring_object" CHECK ((jsonb_typeof(scoring_definition) = 'object'::text)) not valid;

alter table "public"."rule_set_versions" validate constraint "rule_set_versions_scoring_object";

alter table "public"."rule_set_versions" add constraint "rule_set_versions_set_version_key" UNIQUE using index "rule_set_versions_set_version_key";

alter table "public"."rule_set_versions" add constraint "rule_set_versions_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'retired'::text]))) not valid;

alter table "public"."rule_set_versions" validate constraint "rule_set_versions_status_check";

alter table "public"."rule_set_versions" add constraint "rule_set_versions_version_positive" CHECK ((version_number > 0)) not valid;

alter table "public"."rule_set_versions" validate constraint "rule_set_versions_version_positive";

alter table "public"."rule_set_versions" add constraint "rule_set_versions_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."rule_set_versions" validate constraint "rule_set_versions_workspace_fkey";

alter table "public"."rule_set_versions" add constraint "rule_set_versions_workspace_id_id_key" UNIQUE using index "rule_set_versions_workspace_id_id_key";

alter table "public"."rule_sets" add constraint "rule_sets_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."rule_sets" validate constraint "rule_sets_created_by_fkey";

alter table "public"."rule_sets" add constraint "rule_sets_name_not_blank" CHECK ((btrim(name) <> ''::text)) not valid;

alter table "public"."rule_sets" validate constraint "rule_sets_name_not_blank";

alter table "public"."rule_sets" add constraint "rule_sets_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]))) not valid;

alter table "public"."rule_sets" validate constraint "rule_sets_status_check";

alter table "public"."rule_sets" add constraint "rule_sets_version_positive" CHECK (((current_version_number IS NULL) OR (current_version_number > 0))) not valid;

alter table "public"."rule_sets" validate constraint "rule_sets_version_positive";

alter table "public"."rule_sets" add constraint "rule_sets_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."rule_sets" validate constraint "rule_sets_workspace_fkey";

alter table "public"."rule_sets" add constraint "rule_sets_workspace_id_id_key" UNIQUE using index "rule_sets_workspace_id_id_key";

alter table "public"."rule_sets" add constraint "rule_sets_workspace_name_key" UNIQUE using index "rule_sets_workspace_name_key";

alter table "public"."source_connections" add constraint "source_connections_config_object" CHECK ((jsonb_typeof(connection_config) = 'object'::text)) not valid;

alter table "public"."source_connections" validate constraint "source_connections_config_object";

alter table "public"."source_connections" add constraint "source_connections_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."source_connections" validate constraint "source_connections_created_by_fkey";

alter table "public"."source_connections" add constraint "source_connections_kind_check" CHECK ((connection_kind = ANY (ARRAY['mcp'::text, 'api'::text, 'cli'::text, 'upload'::text, 'web_search'::text, 'other'::text]))) not valid;

alter table "public"."source_connections" validate constraint "source_connections_kind_check";

alter table "public"."source_connections" add constraint "source_connections_mapping_version_fkey" FOREIGN KEY (workspace_id, default_mapping_version_id) REFERENCES public.field_mapping_versions(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."source_connections" validate constraint "source_connections_mapping_version_fkey";

alter table "public"."source_connections" add constraint "source_connections_name_not_blank" CHECK ((btrim(name) <> ''::text)) not valid;

alter table "public"."source_connections" validate constraint "source_connections_name_not_blank";

alter table "public"."source_connections" add constraint "source_connections_no_inline_secrets" CHECK (((connection_config)::text !~* '"(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization|private[_-]?key)"[[:space:]]*:'::text)) not valid;

alter table "public"."source_connections" validate constraint "source_connections_no_inline_secrets";

alter table "public"."source_connections" add constraint "source_connections_provider_check" CHECK ((provider = ANY (ARRAY['qcc'::text, 'huoke_assistant'::text, 'file_upload'::text, 'web_search'::text, 'other'::text]))) not valid;

alter table "public"."source_connections" validate constraint "source_connections_provider_check";

alter table "public"."source_connections" add constraint "source_connections_secret_reference_format" CHECK (((secret_reference IS NULL) OR (secret_reference ~ '^[a-z][a-z0-9+.-]*://[^[:space:]]+$'::text))) not valid;

alter table "public"."source_connections" validate constraint "source_connections_secret_reference_format";

alter table "public"."source_connections" add constraint "source_connections_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'degraded'::text, 'disabled'::text, 'error'::text]))) not valid;

alter table "public"."source_connections" validate constraint "source_connections_status_check";

alter table "public"."source_connections" add constraint "source_connections_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."source_connections" validate constraint "source_connections_updated_by_fkey";

alter table "public"."source_connections" add constraint "source_connections_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."source_connections" validate constraint "source_connections_workspace_fkey";

alter table "public"."source_connections" add constraint "source_connections_workspace_id_id_key" UNIQUE using index "source_connections_workspace_id_id_key";

alter table "public"."source_connections" add constraint "source_connections_workspace_name_key" UNIQUE using index "source_connections_workspace_name_key";

alter table "public"."source_queries" add constraint "source_queries_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."source_queries" validate constraint "source_queries_approved_by_fkey";

alter table "public"."source_queries" add constraint "source_queries_connection_fkey" FOREIGN KEY (workspace_id, source_connection_id) REFERENCES public.source_connections(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."source_queries" validate constraint "source_queries_connection_fkey";

alter table "public"."source_queries" add constraint "source_queries_criteria_object" CHECK ((jsonb_typeof(criteria) = 'object'::text)) not valid;

alter table "public"."source_queries" validate constraint "source_queries_criteria_object";

alter table "public"."source_queries" add constraint "source_queries_hash_not_blank" CHECK ((btrim(criteria_hash) <> ''::text)) not valid;

alter table "public"."source_queries" validate constraint "source_queries_hash_not_blank";

alter table "public"."source_queries" add constraint "source_queries_idempotency_format" CHECK (((idempotency_key IS NULL) OR (((length(idempotency_key) >= 16) AND (length(idempotency_key) <= 128)) AND (idempotency_key ~ '^[A-Za-z0-9._:-]+$'::text)))) not valid;

alter table "public"."source_queries" validate constraint "source_queries_idempotency_format";

alter table "public"."source_queries" add constraint "source_queries_kind_check" CHECK ((query_kind = ANY (ARRAY['company_search'::text, 'company_detail'::text, 'risk_enrichment'::text, 'qualification_enrichment'::text, 'tender_search'::text, 'file_import'::text, 'web_evidence'::text, 'other'::text]))) not valid;

alter table "public"."source_queries" validate constraint "source_queries_kind_check";

alter table "public"."source_queries" add constraint "source_queries_no_inline_secrets" CHECK (((criteria)::text !~* '"(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization|private[_-]?key)"[[:space:]]*:'::text)) not valid;

alter table "public"."source_queries" validate constraint "source_queries_no_inline_secrets";

alter table "public"."source_queries" add constraint "source_queries_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."source_queries" validate constraint "source_queries_requested_by_fkey";

alter table "public"."source_queries" add constraint "source_queries_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))) not valid;

alter table "public"."source_queries" validate constraint "source_queries_status_check";

alter table "public"."source_queries" add constraint "source_queries_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."source_queries" validate constraint "source_queries_workspace_fkey";

alter table "public"."source_queries" add constraint "source_queries_workspace_id_connection_key" UNIQUE using index "source_queries_workspace_id_connection_key";

alter table "public"."source_queries" add constraint "source_queries_workspace_id_id_key" UNIQUE using index "source_queries_workspace_id_id_key";

alter table "public"."source_queries" add constraint "source_queries_workspace_idempotency_key" UNIQUE using index "source_queries_workspace_idempotency_key";

alter table "public"."source_records" add constraint "source_records_connection_fkey" FOREIGN KEY (workspace_id, source_connection_id) REFERENCES public.source_connections(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."source_records" validate constraint "source_records_connection_fkey";

alter table "public"."source_records" add constraint "source_records_hash_not_blank" CHECK ((btrim(content_hash) <> ''::text)) not valid;

alter table "public"."source_records" validate constraint "source_records_hash_not_blank";

alter table "public"."source_records" add constraint "source_records_job_fkey" FOREIGN KEY (workspace_id, ingestion_job_id, source_connection_id) REFERENCES public.ingestion_jobs(workspace_id, id, source_connection_id) ON DELETE RESTRICT not valid;

alter table "public"."source_records" validate constraint "source_records_job_fkey";

alter table "public"."source_records" add constraint "source_records_job_record_key" UNIQUE using index "source_records_job_record_key";

alter table "public"."source_records" add constraint "source_records_key_not_blank" CHECK ((btrim(source_record_key) <> ''::text)) not valid;

alter table "public"."source_records" validate constraint "source_records_key_not_blank";

alter table "public"."source_records" add constraint "source_records_kind_not_blank" CHECK ((btrim(record_kind) <> ''::text)) not valid;

alter table "public"."source_records" validate constraint "source_records_kind_not_blank";

alter table "public"."source_records" add constraint "source_records_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."source_records" validate constraint "source_records_workspace_fkey";

alter table "public"."source_records" add constraint "source_records_workspace_id_id_key" UNIQUE using index "source_records_workspace_id_id_key";

alter table "public"."source_snapshots" add constraint "source_snapshots_company_fkey" FOREIGN KEY (workspace_id, company_id) REFERENCES public.companies(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."source_snapshots" validate constraint "source_snapshots_company_fkey";

alter table "public"."source_snapshots" add constraint "source_snapshots_hash_not_blank" CHECK ((btrim(content_hash) <> ''::text)) not valid;

alter table "public"."source_snapshots" validate constraint "source_snapshots_hash_not_blank";

alter table "public"."source_snapshots" add constraint "source_snapshots_mapping_version_fkey" FOREIGN KEY (workspace_id, mapping_version_id) REFERENCES public.field_mapping_versions(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."source_snapshots" validate constraint "source_snapshots_mapping_version_fkey";

alter table "public"."source_snapshots" add constraint "source_snapshots_match_status_check" CHECK ((match_status = ANY (ARRAY['unmatched'::text, 'matched'::text, 'conflict'::text, 'rejected'::text]))) not valid;

alter table "public"."source_snapshots" validate constraint "source_snapshots_match_status_check";

alter table "public"."source_snapshots" add constraint "source_snapshots_payload_object" CHECK ((jsonb_typeof(normalized_payload) = 'object'::text)) not valid;

alter table "public"."source_snapshots" validate constraint "source_snapshots_payload_object";

alter table "public"."source_snapshots" add constraint "source_snapshots_record_fkey" FOREIGN KEY (workspace_id, source_record_id) REFERENCES public.source_records(workspace_id, id) ON DELETE RESTRICT not valid;

alter table "public"."source_snapshots" validate constraint "source_snapshots_record_fkey";

alter table "public"."source_snapshots" add constraint "source_snapshots_source_hash_key" UNIQUE using index "source_snapshots_source_hash_key";

alter table "public"."source_snapshots" add constraint "source_snapshots_warnings_array" CHECK ((jsonb_typeof(mapping_warnings) = 'array'::text)) not valid;

alter table "public"."source_snapshots" validate constraint "source_snapshots_warnings_array";

alter table "public"."source_snapshots" add constraint "source_snapshots_workspace_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."source_snapshots" validate constraint "source_snapshots_workspace_fkey";

alter table "public"."source_snapshots" add constraint "source_snapshots_workspace_id_id_key" UNIQUE using index "source_snapshots_workspace_id_id_key";

alter table "public"."workspace_members" add constraint "workspace_members_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."workspace_members" validate constraint "workspace_members_invited_by_fkey";

alter table "public"."workspace_members" add constraint "workspace_members_owner_active" CHECK (((role <> 'owner'::text) OR (status = 'active'::text))) not valid;

alter table "public"."workspace_members" validate constraint "workspace_members_owner_active";

alter table "public"."workspace_members" add constraint "workspace_members_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text]))) not valid;

alter table "public"."workspace_members" validate constraint "workspace_members_role_check";

alter table "public"."workspace_members" add constraint "workspace_members_status_check" CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'suspended'::text]))) not valid;

alter table "public"."workspace_members" validate constraint "workspace_members_status_check";

alter table "public"."workspace_members" add constraint "workspace_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."workspace_members" validate constraint "workspace_members_user_id_fkey";

alter table "public"."workspace_members" add constraint "workspace_members_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."workspace_members" validate constraint "workspace_members_workspace_id_fkey";

alter table "public"."workspace_members" add constraint "workspace_members_workspace_id_id_key" UNIQUE using index "workspace_members_workspace_id_id_key";

alter table "public"."workspace_members" add constraint "workspace_members_workspace_user_key" UNIQUE using index "workspace_members_workspace_user_key";

alter table "public"."workspaces" add constraint "workspaces_name_not_blank" CHECK ((btrim(name) <> ''::text)) not valid;

alter table "public"."workspaces" validate constraint "workspaces_name_not_blank";

alter table "public"."workspaces" add constraint "workspaces_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."workspaces" validate constraint "workspaces_owner_user_id_fkey";

alter table "public"."workspaces" add constraint "workspaces_settings_object" CHECK ((jsonb_typeof(settings) = 'object'::text)) not valid;

alter table "public"."workspaces" validate constraint "workspaces_settings_object";

alter table "public"."workspaces" add constraint "workspaces_slug_format" CHECK (((slug)::text ~ '^[a-z0-9][a-z0-9-]{1,62}$'::text)) not valid;

alter table "public"."workspaces" validate constraint "workspaces_slug_format";

alter table "public"."workspaces" add constraint "workspaces_slug_key" UNIQUE using index "workspaces_slug_key";

alter table "public"."workspaces" add constraint "workspaces_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'archived'::text]))) not valid;

alter table "public"."workspaces" validate constraint "workspaces_status_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.calculate_company_list_manifest_hash(target_workspace_id uuid, target_company_list_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    select encode(
      extensions.digest(
        string_agg(
          clm.company_id::text || '|' ||
          coalesce(clm.source_record_id::text, '~') || '|' ||
          clm.membership_status || '|' ||
          to_char(
            clm.updated_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US'
          ),
          E'\n' order by clm.company_id
        ),
        'sha256'
      ),
      'hex'
    )
    from public.company_list_members clm
    where clm.workspace_id = target_workspace_id
      and clm.company_list_id = target_company_list_id;
    $function$
;

CREATE OR REPLACE FUNCTION private.can_write_workspace(target_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select private.has_workspace_role(target_workspace_id, array['owner', 'admin', 'editor']::text[]);
    $function$
;

CREATE OR REPLACE FUNCTION private.create_workspace_owner_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    begin
      insert into public.workspace_members (
        workspace_id,
        user_id,
        role,
        status,
        joined_at
      ) values (
        new.id,
        new.owner_user_id,
        'owner',
        'active',
        now()
      );
      return new;
    end;
    $function$
;

CREATE OR REPLACE FUNCTION private.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = target_workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role = any(allowed_roles)
    );
    $function$
;

CREATE OR REPLACE FUNCTION private.is_workspace_member(target_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = target_workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    );
    $function$
;

CREATE OR REPLACE FUNCTION private.jsonb_get_dot_path(document jsonb, dot_path text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
    select document #> string_to_array(dot_path, '.');
    $function$
;

CREATE OR REPLACE FUNCTION private.prevent_workspace_owner_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
    begin
      if new.owner_user_id is distinct from old.owner_user_id then
        raise exception using
          errcode = '42501',
          message = 'workspace ownership must be transferred through an audited administrative workflow';
      end if;
      return new;
    end;
    $function$
;

CREATE OR REPLACE FUNCTION private.prevent_workspace_reassignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
    begin
      if new.workspace_id is distinct from old.workspace_id then
        raise exception using
          errcode = '42501',
          message = 'workspace_id is immutable';
      end if;
      return new;
    end;
    $function$
;

CREATE OR REPLACE FUNCTION public.add_ingestion_list_member(p_job_id uuid, p_company_list_id uuid, p_company_id bigint, p_source_record_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    declare
      job_record public.ingestion_jobs%rowtype;
      member_id uuid;
    begin
      select ij.* into job_record
      from public.ingestion_jobs ij
      where ij.id = p_job_id
        and ij.status in ('running', 'completed', 'partial');

      if not found then
        raise exception using errcode = 'P0002', message = 'ingestion job not found';
      end if;

      insert into public.company_list_members (
        workspace_id,
        company_list_id,
        company_id,
        source_record_id,
        membership_status,
        added_by
      ) values (
        job_record.workspace_id,
        p_company_list_id,
        p_company_id,
        p_source_record_id,
        'included',
        job_record.requested_by
      )
      on conflict on constraint company_list_members_list_company_key do update
      set source_record_id = coalesce(excluded.source_record_id, company_list_members.source_record_id),
          membership_status = 'included',
          updated_at = now()
      returning id into member_id;

      return member_id;
    end;
    $function$
;

CREATE OR REPLACE FUNCTION public.claim_next_workbench_job(p_worker_id text)
 RETURNS TABLE(job_type text, job_id uuid, workspace_id uuid, payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    declare
      normalized_worker_id text := btrim(p_worker_id);
      ingestion_candidate_id uuid;
      ingestion_candidate_at timestamp with time zone;
      rule_candidate_id uuid;
      rule_candidate_at timestamp with time zone;
      export_candidate_id uuid;
      export_candidate_at timestamp with time zone;
      selected_type text;
      selected_id uuid;
      selected_workspace_id uuid;
      selected_payload jsonb;
    begin
      if normalized_worker_id is null
         or length(normalized_worker_id) not between 3 and 200 then
        raise exception using errcode = '22023', message = 'invalid worker id';
      end if;

      select ij.id, ij.requested_at
        into ingestion_candidate_id, ingestion_candidate_at
      from public.ingestion_jobs ij
      where ij.status = 'queued'
      order by ij.requested_at, ij.id
      for update skip locked
      limit 1;

      select rr.id, rr.requested_at
        into rule_candidate_id, rule_candidate_at
      from public.rule_runs rr
      where rr.status = 'queued'
      order by rr.requested_at, rr.id
      for update skip locked
      limit 1;

      select e.id, e.requested_at
        into export_candidate_id, export_candidate_at
      from public.exports e
      where e.status = 'queued'
      order by e.requested_at, e.id
      for update skip locked
      limit 1;

      select candidate_type, candidate_id
        into selected_type, selected_id
      from (
        values
          ('ingestion_job'::text, ingestion_candidate_id, ingestion_candidate_at, 1),
          ('rule_run'::text, rule_candidate_id, rule_candidate_at, 2),
          ('export'::text, export_candidate_id, export_candidate_at, 3)
      ) as candidates(candidate_type, candidate_id, requested_at, priority)
      where candidate_id is not null
      order by requested_at, priority
      limit 1;

      if selected_id is null then
        return;
      end if;

      if selected_type = 'ingestion_job' then
        update public.ingestion_jobs ij
        set status = 'running',
            worker_id = normalized_worker_id,
            claimed_at = now(),
            started_at = coalesce(ij.started_at, now()),
            attempt_count = ij.attempt_count + 1
        where ij.id = selected_id
          and ij.status = 'queued'
        returning
          ij.workspace_id,
          jsonb_build_object(
            'source_connection_id', ij.source_connection_id,
            'source_query_id', ij.source_query_id,
            'mapping_version_id', ij.mapping_version_id,
            'job_kind', ij.job_kind,
            'input_object_path', ij.input_object_path,
            'input_params', ij.input_params,
            'requested_by', ij.requested_by,
            'attempt_count', ij.attempt_count
          )
        into selected_workspace_id, selected_payload;
      elsif selected_type = 'rule_run' then
        update public.rule_runs rr
        set status = 'running',
            worker_id = normalized_worker_id,
            claimed_at = now(),
            started_at = coalesce(rr.started_at, now()),
            attempt_count = rr.attempt_count + 1
        where rr.id = selected_id
          and rr.status = 'queued'
        returning
          rr.workspace_id,
          jsonb_build_object(
            'rule_version_id', rr.rule_version_id,
            'company_list_id', rr.company_list_id,
            'run_mode', rr.run_mode,
            'engine_version', rr.engine_version,
            'input_manifest_hash', rr.input_manifest_hash,
            'run_config', rr.run_config,
            'requested_by', rr.requested_by,
            'attempt_count', rr.attempt_count
          )
        into selected_workspace_id, selected_payload;
      else
        update public.exports e
        set status = 'running',
            worker_id = normalized_worker_id,
            claimed_at = now(),
            attempt_count = e.attempt_count + 1
        where e.id = selected_id
          and e.status = 'queued'
        returning
          e.workspace_id,
          jsonb_build_object(
            'company_list_id', e.company_list_id,
            'rule_run_id', e.rule_run_id,
            'export_format', e.export_format,
            'selected_fields', e.selected_fields,
            'filter_definition', e.filter_definition,
            'requested_by', e.requested_by,
            'attempt_count', e.attempt_count
          )
        into selected_workspace_id, selected_payload;
      end if;

      if selected_workspace_id is null then
        return;
      end if;

      insert into public.audit_logs (
        workspace_id,
        actor_type,
        actor_label,
        action,
        entity_type,
        entity_id,
        metadata
      ) values (
        selected_workspace_id,
        'service',
        normalized_worker_id,
        'workbench.job.claimed',
        selected_type,
        selected_id::text,
        jsonb_build_object('worker_id', normalized_worker_id)
      );

      return query
      select selected_type, selected_id, selected_workspace_id, selected_payload;
    end;
    $function$
;

CREATE OR REPLACE FUNCTION public.complete_workbench_job(p_job_type text, p_job_id uuid, p_status text, p_result jsonb, p_error_code text, p_error_message text)
 RETURNS TABLE(job_type text, job_id uuid, workspace_id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    declare
      normalized_job_type text := lower(btrim(p_job_type));
      normalized_status text := lower(btrim(p_status));
      normalized_result jsonb := coalesce(p_result, '{}'::jsonb);
      completed_workspace_id uuid;
      completed_status text;
      completed_worker_id text;
      completed_source_query_id uuid;
    begin
      if normalized_status = 'succeeded' then
        normalized_status := 'completed';
      end if;

      if jsonb_typeof(normalized_result) <> 'object' then
        raise exception using errcode = '22023', message = 'result must be a JSON object';
      end if;

      if normalized_job_type = 'ingestion_job' then
        if normalized_status not in ('completed', 'partial', 'failed', 'cancelled') then
          raise exception using errcode = '22023', message = 'invalid ingestion completion status';
        end if;

        update public.ingestion_jobs ij
        set status = normalized_status,
            result = normalized_result,
            error_code = p_error_code,
            error_message = p_error_message,
            completed_at = now(),
            received_count = case
              when normalized_result ->> 'received_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'received_count')::integer
              else ij.received_count
            end,
            accepted_count = case
              when normalized_result ->> 'accepted_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'accepted_count')::integer
              else ij.accepted_count
            end,
            rejected_count = case
              when normalized_result ->> 'rejected_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'rejected_count')::integer
              else ij.rejected_count
            end
        where ij.id = p_job_id
          and ij.status = 'running'
        returning ij.workspace_id, ij.status, ij.worker_id, ij.source_query_id
          into completed_workspace_id, completed_status, completed_worker_id, completed_source_query_id;
      elsif normalized_job_type = 'rule_run' then
        if normalized_status not in ('completed', 'partial', 'failed', 'cancelled') then
          raise exception using errcode = '22023', message = 'invalid rule completion status';
        end if;

        update public.rule_runs rr
        set status = normalized_status,
            result = normalized_result,
            error_code = p_error_code,
            error_message = p_error_message,
            completed_at = now(),
            total_count = case
              when normalized_result ->> 'total_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'total_count')::integer
              else rr.total_count
            end,
            included_count = case
              when normalized_result ->> 'included_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'included_count')::integer
              else rr.included_count
            end,
            excluded_count = case
              when normalized_result ->> 'excluded_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'excluded_count')::integer
              else rr.excluded_count
            end,
            review_count = case
              when normalized_result ->> 'review_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'review_count')::integer
              else rr.review_count
            end
        where rr.id = p_job_id
          and rr.status = 'running'
        returning rr.workspace_id, rr.status, rr.worker_id
          into completed_workspace_id, completed_status, completed_worker_id;
      elsif normalized_job_type = 'export' then
        if normalized_status not in ('completed', 'failed', 'cancelled') then
          raise exception using errcode = '22023', message = 'invalid export completion status';
        end if;

        update public.exports e
        set status = normalized_status,
            result = normalized_result,
            error_code = p_error_code,
            error_message = p_error_message,
            completed_at = now(),
            storage_bucket = coalesce(nullif(normalized_result ->> 'storage_bucket', ''), e.storage_bucket),
            storage_path = coalesce(nullif(normalized_result ->> 'storage_path', ''), e.storage_path),
            checksum_sha256 = coalesce(nullif(normalized_result ->> 'checksum_sha256', ''), e.checksum_sha256),
            file_size_bytes = case
              when normalized_result ->> 'file_size_bytes' ~ '^[0-9]+$'
                then (normalized_result ->> 'file_size_bytes')::bigint
              else e.file_size_bytes
            end,
            row_count = case
              when normalized_result ->> 'row_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'row_count')::integer
              else e.row_count
            end
        where e.id = p_job_id
          and e.status = 'running'
        returning e.workspace_id, e.status, e.worker_id
          into completed_workspace_id, completed_status, completed_worker_id;
      else
        raise exception using errcode = '22023', message = 'unsupported job type';
      end if;

      if completed_workspace_id is null then
        raise exception using errcode = 'P0002', message = 'running job not found';
      end if;

      if normalized_job_type = 'ingestion_job'
         and completed_source_query_id is not null then
        update public.source_queries sq
        set status = case
          when normalized_status in ('completed', 'partial') then 'completed'
          when normalized_status = 'failed' then 'failed'
          else 'cancelled'
        end
        where sq.workspace_id = completed_workspace_id
          and sq.id = completed_source_query_id;
      end if;

      insert into public.audit_logs (
        workspace_id,
        actor_type,
        actor_label,
        action,
        entity_type,
        entity_id,
        after_data,
        metadata
      ) values (
        completed_workspace_id,
        'service',
        completed_worker_id,
        'workbench.job.completed',
        normalized_job_type,
        p_job_id::text,
        jsonb_build_object(
          'status', completed_status,
          'result', normalized_result,
          'error_code', p_error_code
        ),
        jsonb_build_object('worker_id', completed_worker_id)
      );

      return query
      select normalized_job_type, p_job_id, completed_workspace_id, completed_status;
    end;
    $function$
;

CREATE OR REPLACE FUNCTION public.enqueue_workbench_job(p_workspace_id uuid, p_action text, p_payload jsonb, p_idempotency_key text)
 RETURNS TABLE(job_id uuid, status text, job_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    declare
      normalized_action text := lower(btrim(p_action));
      normalized_payload jsonb := coalesce(p_payload, '{}'::jsonb);
      normalized_idempotency_key text := btrim(p_idempotency_key);
      created_job_id uuid;
      created_status text;
      connection_id uuid;
      query_id uuid;
      mapping_id uuid;
      list_id uuid;
      version_id uuid;
      run_id uuid;
      object_path text;
      requested_job_kind text;
      computed_manifest_hash text;
      query_kind_value text;
      query_text_value text;
      query_criteria jsonb;
      query_criteria_hash text;
      query_idempotency_key text;
    begin
      if auth.uid() is null then
        raise exception using errcode = '42501', message = 'authentication required';
      end if;

      if not private.can_write_workspace(p_workspace_id) then
        raise exception using errcode = '42501', message = 'workspace editor role required';
      end if;

      if jsonb_typeof(normalized_payload) <> 'object' then
        raise exception using errcode = '22023', message = 'payload must be a JSON object';
      end if;

      if normalized_payload::text ~* '"(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization|private[_-]?key)"[[:space:]]*:' then
        raise exception using errcode = '22023', message = 'payload must not contain inline credentials';
      end if;

      if normalized_idempotency_key is null
         or length(normalized_idempotency_key) not between 16 and 128
         or normalized_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
        raise exception using errcode = '22023', message = 'invalid idempotency key';
      end if;

      if normalized_action in ('start_ingestion', 'test_connection') then
        connection_id := nullif(normalized_payload ->> 'source_connection_id', '')::uuid;
        query_id := nullif(normalized_payload ->> 'source_query_id', '')::uuid;
        mapping_id := nullif(normalized_payload ->> 'mapping_version_id', '')::uuid;
        object_path := nullif(normalized_payload ->> 'input_object_path', '');

        if connection_id is null then
          raise exception using errcode = '22023', message = 'source_connection_id is required';
        end if;

        if object_path is not null
           and object_path not like p_workspace_id::text || '/' || auth.uid()::text || '/%' then
          raise exception using errcode = '42501', message = 'input object path must be scoped to workspace_id/user_id';
        end if;

        if normalized_action = 'test_connection' then
          requested_job_kind := 'connection_test';
        else
          requested_job_kind := coalesce(nullif(normalized_payload ->> 'job_kind', ''), 'import');
          if requested_job_kind not in ('query', 'import', 'enrich', 'refresh') then
            raise exception using errcode = '22023', message = 'unsupported ingestion job_kind';
          end if;
        end if;

        -- The GUI submits a complete query definition in input_params and does
        -- not need to create source_queries itself. Keep the query and its job
        -- in the same transaction so every provider call has a durable,
        -- reproducible description of what was requested.
        if normalized_action = 'start_ingestion'
           and requested_job_kind = 'query'
           and query_id is null then
          query_kind_value := nullif(
            btrim(normalized_payload #>> '{input_params,query_kind}'),
            ''
          );
          query_text_value := nullif(
            btrim(normalized_payload #>> '{input_params,query_text}'),
            ''
          );
          query_criteria := coalesce(
            normalized_payload #> '{input_params,criteria}',
            '{}'::jsonb
          );

          if query_kind_value is null then
            raise exception using errcode = '22023', message = 'query_kind is required for query ingestion';
          end if;
          if jsonb_typeof(query_criteria) <> 'object' then
            raise exception using errcode = '22023', message = 'query criteria must be a JSON object';
          end if;

          query_criteria_hash := encode(
            extensions.digest(query_criteria::text, 'sha256'),
            'hex'
          );
          query_idempotency_key := 'source-query:' || encode(
            extensions.digest(
              p_workspace_id::text || '|' || normalized_idempotency_key,
              'sha256'
            ),
            'hex'
          );

          insert into public.source_queries (
            workspace_id,
            source_connection_id,
            query_kind,
            query_text,
            criteria,
            criteria_hash,
            status,
            idempotency_key,
            requested_by
          ) values (
            p_workspace_id,
            connection_id,
            query_kind_value,
            query_text_value,
            query_criteria,
            query_criteria_hash,
            'running',
            query_idempotency_key,
            auth.uid()
          )
          on conflict (workspace_id, idempotency_key) do nothing
          returning id into query_id;

          if query_id is null then
            select sq.id
              into query_id
            from public.source_queries sq
            where sq.workspace_id = p_workspace_id
              and sq.idempotency_key = query_idempotency_key;
          end if;

          if query_id is null then
            raise exception using errcode = 'P0002', message = 'source query could not be created or reused';
          end if;
        end if;

        insert into public.ingestion_jobs (
          workspace_id,
          source_connection_id,
          source_query_id,
          mapping_version_id,
          job_kind,
          status,
          idempotency_key,
          input_object_path,
          input_params,
          requested_by
        ) values (
          p_workspace_id,
          connection_id,
          query_id,
          mapping_id,
          requested_job_kind,
          'queued',
          normalized_idempotency_key,
          object_path,
          coalesce(normalized_payload -> 'input_params', '{}'::jsonb),
          auth.uid()
        )
        on conflict (workspace_id, idempotency_key) do nothing
        returning id, ingestion_jobs.status into created_job_id, created_status;

        if created_job_id is null then
          select ij.id, ij.status
            into created_job_id, created_status
          from public.ingestion_jobs ij
          where ij.workspace_id = p_workspace_id
            and ij.idempotency_key = normalized_idempotency_key;
        end if;

        return query select created_job_id, created_status, 'ingestion_job'::text;
        return;
      end if;

      if normalized_action = 'run_rules' then
        version_id := nullif(normalized_payload ->> 'rule_version_id', '')::uuid;
        list_id := nullif(normalized_payload ->> 'company_list_id', '')::uuid;

        if version_id is null or list_id is null then
          raise exception using errcode = '22023', message = 'rule_version_id and company_list_id are required';
        end if;

        if nullif(normalized_payload ->> 'engine_version', '') is null then
          raise exception using errcode = '22023', message = 'engine_version is required';
        end if;

        computed_manifest_hash := private.calculate_company_list_manifest_hash(
          p_workspace_id,
          list_id
        );

        if computed_manifest_hash is null then
          raise exception using errcode = '22023', message = 'company list has no members';
        end if;

        insert into public.rule_runs (
          workspace_id,
          rule_version_id,
          company_list_id,
          run_mode,
          status,
          engine_version,
          input_manifest_hash,
          run_config,
          idempotency_key,
          requested_by
        ) values (
          p_workspace_id,
          version_id,
          list_id,
          coalesce(nullif(normalized_payload ->> 'run_mode', ''), 'full'),
          'queued',
          normalized_payload ->> 'engine_version',
          computed_manifest_hash,
          coalesce(normalized_payload -> 'run_config', '{}'::jsonb),
          normalized_idempotency_key,
          auth.uid()
        )
        on conflict (workspace_id, idempotency_key) do nothing
        returning id, rule_runs.status into created_job_id, created_status;

        if created_job_id is null then
          select rr.id, rr.status
            into created_job_id, created_status
          from public.rule_runs rr
          where rr.workspace_id = p_workspace_id
            and rr.idempotency_key = normalized_idempotency_key;
        end if;

        return query select created_job_id, created_status, 'rule_run'::text;
        return;
      end if;

      if normalized_action = 'create_export' then
        list_id := nullif(normalized_payload ->> 'company_list_id', '')::uuid;
        run_id := nullif(normalized_payload ->> 'rule_run_id', '')::uuid;

        if list_id is null and run_id is null then
          raise exception using errcode = '22023', message = 'company_list_id or rule_run_id is required';
        end if;

        if nullif(normalized_payload ->> 'export_format', '') is null then
          raise exception using errcode = '22023', message = 'export_format is required';
        end if;

        insert into public.exports (
          workspace_id,
          company_list_id,
          rule_run_id,
          export_format,
          status,
          selected_fields,
          filter_definition,
          idempotency_key,
          requested_by
        ) values (
          p_workspace_id,
          list_id,
          run_id,
          lower(normalized_payload ->> 'export_format'),
          'queued',
          coalesce(
            array(select jsonb_array_elements_text(normalized_payload -> 'selected_fields')),
            '{}'::text[]
          ),
          coalesce(normalized_payload -> 'filter_definition', '{}'::jsonb),
          normalized_idempotency_key,
          auth.uid()
        )
        on conflict (workspace_id, idempotency_key) do nothing
        returning id, exports.status into created_job_id, created_status;

        if created_job_id is null then
          select e.id, e.status
            into created_job_id, created_status
          from public.exports e
          where e.workspace_id = p_workspace_id
            and e.idempotency_key = normalized_idempotency_key;
        end if;

        return query select created_job_id, created_status, 'export'::text;
        return;
      end if;

      raise exception using errcode = '22023', message = 'unsupported workbench action';
    end;
    $function$
;

CREATE OR REPLACE FUNCTION public.ensure_ingestion_company_list(p_job_id uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    declare
      job_record public.ingestion_jobs%rowtype;
      normalized_name text := btrim(p_name);
      list_id uuid;
    begin
      if normalized_name is null or normalized_name = '' then
        raise exception using errcode = '22023', message = 'company list name is required';
      end if;

      select ij.* into job_record
      from public.ingestion_jobs ij
      where ij.id = p_job_id
        and ij.status in ('running', 'completed', 'partial')
      for update;

      if not found then
        raise exception using errcode = 'P0002', message = 'ingestion job not found';
      end if;

      perform pg_advisory_xact_lock(
        hashtextextended(job_record.workspace_id::text || ':list:' || lower(normalized_name), 0)
      );

      select cl.id into list_id
      from public.company_lists cl
      where cl.workspace_id = job_record.workspace_id
        and lower(cl.name) = lower(normalized_name)
      limit 1;

      if list_id is null then
        insert into public.company_lists (
          workspace_id,
          name,
          source_query_id,
          ingestion_job_id,
          created_by
        ) values (
          job_record.workspace_id,
          normalized_name,
          job_record.source_query_id,
          job_record.id,
          job_record.requested_by
        )
        returning id into list_id;
      end if;

      return list_id;
    end;
    $function$
;

CREATE OR REPLACE FUNCTION public.get_company_list_manifest_hash(p_workspace_id uuid, p_company_list_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    declare
      manifest_hash text;
    begin
      manifest_hash := private.calculate_company_list_manifest_hash(
        p_workspace_id,
        p_company_list_id
      );
      if manifest_hash is null then
        raise exception using errcode = 'P0002', message = 'company list has no members';
      end if;
      return manifest_hash;
    end;
    $function$
;

CREATE OR REPLACE FUNCTION public.persist_workbench_ingestion_record(p_job_id uuid, p_source_record_key text, p_record_kind text, p_raw_payload jsonb, p_raw_hash text, p_observed_at timestamp with time zone, p_normalized_payload jsonb, p_normalized_hash text, p_mapping_warnings jsonb)
 RETURNS TABLE(source_record_id uuid, source_snapshot_id uuid, company_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    declare
      job_record public.ingestion_jobs%rowtype;
      existing_source_record public.source_records%rowtype;
      persisted_source_record_id uuid;
      persisted_snapshot_id uuid;
      persisted_company_id bigint;
      persisted_evidence_id uuid;
      connection_provider text;
      company_name text;
      normalized_company_name text;
      credit_code text;
      registration_number_value text;
      source_url_value text;
      field_path_value text;
      field_value jsonb;
      fact_value_type text;
      fact_value_text text;
      fact_provider text;
      fact_idempotency_key text;
      provenance_item jsonb;
    begin
      if p_source_record_key is null or btrim(p_source_record_key) = '' then
        raise exception using errcode = '22023', message = 'source record key is required';
      end if;
      if p_record_kind is null or btrim(p_record_kind) = '' then
        raise exception using errcode = '22023', message = 'record kind is required';
      end if;
      if p_raw_hash is null or p_raw_hash !~ '^[A-Fa-f0-9]{64}$' then
        raise exception using errcode = '22023', message = 'raw hash must be SHA-256 hex';
      end if;
      if p_normalized_hash is null or p_normalized_hash !~ '^[A-Fa-f0-9]{64}$' then
        raise exception using errcode = '22023', message = 'normalized hash must be SHA-256 hex';
      end if;
      if jsonb_typeof(p_raw_payload) is distinct from 'object'
         or jsonb_typeof(p_normalized_payload) is distinct from 'object' then
        raise exception using errcode = '22023', message = 'raw and normalized payloads must be JSON objects';
      end if;
      if jsonb_typeof(coalesce(p_mapping_warnings, '[]'::jsonb)) is distinct from 'array' then
        raise exception using errcode = '22023', message = 'mapping warnings must be a JSON array';
      end if;
      if jsonb_typeof(p_normalized_payload -> 'provenance') is distinct from 'array' then
        raise exception using errcode = '22023', message = 'normalized payload requires field provenance';
      end if;
      if jsonb_array_length(p_normalized_payload -> 'provenance') = 0 then
        raise exception using errcode = '22023', message = 'normalized payload requires field provenance';
      end if;

      select ij.*
        into job_record
      from public.ingestion_jobs ij
      where ij.id = p_job_id
        and ij.status = 'running'
      for update;

      if not found then
        raise exception using errcode = 'P0002', message = 'running ingestion job not found';
      end if;

      select sc.provider
        into connection_provider
      from public.source_connections sc
      where sc.workspace_id = job_record.workspace_id
        and sc.id = job_record.source_connection_id;

      select sr.*
        into existing_source_record
      from public.source_records sr
      where sr.workspace_id = job_record.workspace_id
        and sr.ingestion_job_id = job_record.id
        and sr.source_record_key = p_source_record_key;

      if found then
        if lower(existing_source_record.content_hash) <> lower(p_raw_hash) then
          raise exception using
            errcode = '23505',
            message = 'source record key was already persisted with different content';
        end if;
        persisted_source_record_id := existing_source_record.id;

        select ss.id, ss.company_id
          into persisted_snapshot_id, persisted_company_id
        from public.source_snapshots ss
        where ss.workspace_id = job_record.workspace_id
          and ss.source_record_id = persisted_source_record_id
          and lower(ss.content_hash) = lower(p_normalized_hash)
        order by ss.created_at
        limit 1;

        if persisted_snapshot_id is not null and persisted_company_id is not null then
          return query
          select persisted_source_record_id, persisted_snapshot_id, persisted_company_id;
          return;
        end if;
      else
        insert into public.source_records (
          workspace_id,
          ingestion_job_id,
          source_connection_id,
          source_record_key,
          record_kind,
          raw_payload,
          content_hash,
          source_observed_at
        ) values (
          job_record.workspace_id,
          job_record.id,
          job_record.source_connection_id,
          btrim(p_source_record_key),
          btrim(p_record_kind),
          p_raw_payload,
          lower(p_raw_hash),
          p_observed_at
        )
        returning id into persisted_source_record_id;
      end if;

      company_name := nullif(btrim(p_normalized_payload ->> 'companyName'), '');
      if company_name is null then
        raise exception using errcode = '22023', message = 'normalized companyName is required';
      end if;

      normalized_company_name := lower(
        regexp_replace(company_name, '[[:space:]（）()·._-]+', '', 'g')
      );
      credit_code := upper(nullif(btrim(p_normalized_payload ->> 'creditCode'), ''));
      registration_number_value := nullif(btrim(p_normalized_payload ->> 'registrationNumber'), '');

      perform pg_advisory_xact_lock(
        hashtextextended(
          job_record.workspace_id::text || ':' || coalesce(credit_code, normalized_company_name),
          0
        )
      );

      if credit_code is not null then
        select c.id
          into persisted_company_id
        from public.companies c
        where c.workspace_id = job_record.workspace_id
          and c.unified_social_credit_code = credit_code
        limit 1;
      end if;

      if persisted_company_id is null then
        select c.id
          into persisted_company_id
        from public.companies c
        where c.workspace_id = job_record.workspace_id
          and c.normalized_name = normalized_company_name
          and c.profile_status <> 'merged'
        order by c.created_at
        limit 1;
      end if;

      if persisted_company_id is null then
        insert into public.companies (
          workspace_id,
          name,
          unified_social_credit_code,
          registration_number,
          legal_representative,
          operating_status,
          company_type,
          registered_capital_amount,
          paid_in_capital_amount,
          established_on,
          approved_on,
          registration_authority,
          business_scope,
          province,
          city,
          district,
          region_text,
          industry_name,
          sector,
          insured_employee_count,
          personnel_scale_text,
          address,
          primary_source,
          last_verified_at,
          profile_status
        ) values (
          job_record.workspace_id,
          company_name,
          credit_code,
          registration_number_value,
          nullif(p_normalized_payload ->> 'legalPerson', ''),
          nullif(p_normalized_payload #>> '{status,normalized}', ''),
          nullif(p_normalized_payload ->> 'companyType', ''),
          (nullif(p_normalized_payload #>> '{registeredCapital,valueWan}', '')::numeric * 10000),
          (nullif(p_normalized_payload #>> '{paidInCapital,valueWan}', '')::numeric * 10000),
          nullif(p_normalized_payload ->> 'establishedDate', '')::date,
          nullif(p_normalized_payload ->> 'approvedDate', '')::date,
          nullif(p_normalized_payload ->> 'registrationAuthority', ''),
          nullif(p_normalized_payload ->> 'businessScope', ''),
          nullif(p_normalized_payload #>> '{region,province}', ''),
          nullif(p_normalized_payload #>> '{region,city}', ''),
          nullif(p_normalized_payload #>> '{region,district}', ''),
          nullif(p_normalized_payload #>> '{region,raw}', ''),
          nullif(p_normalized_payload #>> '{industry,l2}', ''),
          nullif(p_normalized_payload #>> '{industry,l1}', ''),
          nullif(p_normalized_payload ->> 'insuredCount', '')::integer,
          nullif(p_normalized_payload #>> '{personnelScale,raw}', ''),
          nullif(p_normalized_payload ->> 'registeredAddress', ''),
          connection_provider,
          now(),
          'verified'
        )
        returning id into persisted_company_id;
      else
        update public.companies c
        set name = company_name,
            unified_social_credit_code = coalesce(credit_code, c.unified_social_credit_code::text),
            registration_number = coalesce(registration_number_value, c.registration_number),
            legal_representative = coalesce(nullif(p_normalized_payload ->> 'legalPerson', ''), c.legal_representative),
            operating_status = coalesce(nullif(p_normalized_payload #>> '{status,normalized}', ''), c.operating_status),
            company_type = coalesce(nullif(p_normalized_payload ->> 'companyType', ''), c.company_type),
            registered_capital_amount = coalesce((nullif(p_normalized_payload #>> '{registeredCapital,valueWan}', '')::numeric * 10000), c.registered_capital_amount),
            paid_in_capital_amount = coalesce((nullif(p_normalized_payload #>> '{paidInCapital,valueWan}', '')::numeric * 10000), c.paid_in_capital_amount),
            established_on = coalesce(nullif(p_normalized_payload ->> 'establishedDate', '')::date, c.established_on),
            approved_on = coalesce(nullif(p_normalized_payload ->> 'approvedDate', '')::date, c.approved_on),
            registration_authority = coalesce(nullif(p_normalized_payload ->> 'registrationAuthority', ''), c.registration_authority),
            business_scope = coalesce(nullif(p_normalized_payload ->> 'businessScope', ''), c.business_scope),
            province = coalesce(nullif(p_normalized_payload #>> '{region,province}', ''), c.province),
            city = coalesce(nullif(p_normalized_payload #>> '{region,city}', ''), c.city),
            district = coalesce(nullif(p_normalized_payload #>> '{region,district}', ''), c.district),
            region_text = coalesce(nullif(p_normalized_payload #>> '{region,raw}', ''), c.region_text),
            industry_name = coalesce(nullif(p_normalized_payload #>> '{industry,l2}', ''), c.industry_name),
            sector = coalesce(nullif(p_normalized_payload #>> '{industry,l1}', ''), c.sector),
            insured_employee_count = coalesce(nullif(p_normalized_payload ->> 'insuredCount', '')::integer, c.insured_employee_count),
            personnel_scale_text = coalesce(nullif(p_normalized_payload #>> '{personnelScale,raw}', ''), c.personnel_scale_text),
            address = coalesce(nullif(p_normalized_payload ->> 'registeredAddress', ''), c.address),
            primary_source = connection_provider,
            last_verified_at = now(),
            profile_status = 'verified'
        where c.workspace_id = job_record.workspace_id
          and c.id = persisted_company_id;
      end if;

      if credit_code is not null then
        insert into public.company_identifiers (
          workspace_id,
          company_id,
          identifier_type,
          identifier_value,
          normalized_value,
          source_provider,
          source_record_id,
          is_primary
        ) values (
          job_record.workspace_id,
          persisted_company_id,
          'unified_social_credit_code',
          credit_code,
          credit_code,
          connection_provider,
          persisted_source_record_id,
          true
        )
        on conflict on constraint company_identifiers_company_value_key do update
        set last_seen_at = now(),
            source_provider = excluded.source_provider,
            source_record_id = excluded.source_record_id,
            is_primary = true;
      end if;

      insert into public.source_snapshots (
        workspace_id,
        source_record_id,
        mapping_version_id,
        company_id,
        normalized_payload,
        content_hash,
        match_status,
        mapping_warnings,
        captured_at
      ) values (
        job_record.workspace_id,
        persisted_source_record_id,
        job_record.mapping_version_id,
        persisted_company_id,
        p_normalized_payload,
        lower(p_normalized_hash),
        'matched',
        coalesce(p_mapping_warnings, '[]'::jsonb),
        now()
      )
      on conflict on constraint source_snapshots_source_hash_key do nothing
      returning id into persisted_snapshot_id;

      if persisted_snapshot_id is null then
        select ss.id
          into persisted_snapshot_id
        from public.source_snapshots ss
        where ss.workspace_id = job_record.workspace_id
          and ss.source_record_id = persisted_source_record_id
          and lower(ss.content_hash) = lower(p_normalized_hash)
        order by ss.created_at
        limit 1;
      end if;

      select provenance.value ->> 'sourceUrl'
        into source_url_value
      from jsonb_array_elements(p_normalized_payload -> 'provenance') provenance(value)
      where nullif(provenance.value ->> 'sourceUrl', '') is not null
      limit 1;

      insert into public.company_evidence (
        workspace_id,
        company_id,
        evidence_type,
        title,
        source_provider,
        source_record_id,
        source_snapshot_id,
        source_url,
        excerpt,
        evidence_fingerprint,
        evidence_status,
        observed_at,
        metadata
      ) values (
        job_record.workspace_id,
        persisted_company_id,
        'registration',
        company_name || ' 工商登记数据',
        connection_provider,
        persisted_source_record_id,
        persisted_snapshot_id,
        source_url_value,
        '供内部分析使用的结构化工商登记快照。',
        md5(
          'registration:' || persisted_source_record_id::text || ':' || lower(p_normalized_hash)
        ),
        'verified',
        p_observed_at,
        jsonb_build_object(
          'usage_scope', 'internal_analysis',
          'normalized_hash', lower(p_normalized_hash),
          'provider', connection_provider,
          'provenance', p_normalized_payload -> 'provenance'
        )
      )
      on conflict on constraint company_evidence_company_fingerprint_key do nothing
      returning id into persisted_evidence_id;

      if persisted_evidence_id is null then
        select ce.id
          into persisted_evidence_id
        from public.company_evidence ce
        where ce.workspace_id = job_record.workspace_id
          and ce.company_id = persisted_company_id
          and ce.evidence_fingerprint = md5(
            'registration:' || persisted_source_record_id::text || ':' || lower(p_normalized_hash)
          );
      end if;

      for provenance_item in
        select distinct on (
          provenance.value ->> 'fieldPath',
          coalesce(provenance.value ->> 'providerId', connection_provider)
        ) provenance.value
        from jsonb_array_elements(p_normalized_payload -> 'provenance') provenance(value)
        order by
          provenance.value ->> 'fieldPath',
          coalesce(provenance.value ->> 'providerId', connection_provider),
          provenance.value::text
      loop
        field_path_value := nullif(btrim(provenance_item ->> 'fieldPath'), '');
        if field_path_value is null or field_path_value like 'contact.%' then
          continue;
        end if;

        field_value := private.jsonb_get_dot_path(p_normalized_payload, field_path_value);
        fact_provider := coalesce(
          nullif(provenance_item ->> 'providerId', ''),
          connection_provider
        );
        fact_idempotency_key := md5(
          persisted_source_record_id::text || '|' || field_path_value || '|' || fact_provider
        );

        if field_value is null or jsonb_typeof(field_value) = 'null' then
          fact_value_text := null;
        elsif jsonb_typeof(field_value) = 'string' then
          fact_value_text := field_value #>> '{}';
        else
          fact_value_text := field_value::text;
        end if;

        fact_value_type := case
          when provenance_item ->> 'unit' in ('wan_cny', 'cny') then 'money'
          when provenance_item ->> 'unit' = 'date' then 'date'
          when jsonb_typeof(field_value) = 'number' then 'number'
          when jsonb_typeof(field_value) = 'boolean' then 'boolean'
          when jsonb_typeof(field_value) = 'array' then 'array'
          when jsonb_typeof(field_value) = 'object' then 'object'
          when field_value is null or jsonb_typeof(field_value) = 'null' then 'null'
          else 'string'
        end;

        update public.company_field_facts cff
        set is_current = false,
            valid_to = coalesce(p_observed_at, now())
        where cff.workspace_id = job_record.workspace_id
          and cff.company_id = persisted_company_id
          and cff.field_name = field_path_value
          and cff.source_provider = fact_provider
          and cff.is_current;

        insert into public.company_field_facts (
          workspace_id,
          company_id,
          field_name,
          value_json,
          value_text,
          value_type,
          source_provider,
          source_record_id,
          source_snapshot_id,
          evidence_id,
          confidence,
          observed_at,
          valid_from,
          is_current,
          idempotency_key
        ) values (
          job_record.workspace_id,
          persisted_company_id,
          field_path_value,
          jsonb_build_object(
            'value', coalesce(field_value, 'null'::jsonb),
            'providerName', provenance_item -> 'providerName',
            'channel', provenance_item -> 'channel',
            'evidenceClass', provenance_item -> 'evidenceClass',
            'sourceField', provenance_item -> 'sourceField',
            'unit', provenance_item -> 'unit',
            'nullMeaning', provenance_item -> 'nullMeaning',
            'usageScope', coalesce(provenance_item -> 'usageScope', '"internal_analysis"'::jsonb),
            'note', provenance_item -> 'note'
          ),
          fact_value_text,
          fact_value_type,
          fact_provider,
          persisted_source_record_id,
          persisted_snapshot_id,
          persisted_evidence_id,
          nullif(provenance_item ->> 'confidence', '')::numeric,
          coalesce(nullif(provenance_item ->> 'retrievedAt', '')::timestamp with time zone, p_observed_at, now()),
          coalesce(nullif(provenance_item ->> 'retrievedAt', '')::timestamp with time zone, p_observed_at, now()),
          true,
          fact_idempotency_key
        )
        on conflict on constraint company_field_facts_workspace_idempotency_key do nothing;
      end loop;

      return query
      select persisted_source_record_id, persisted_snapshot_id, persisted_company_id;
    end;
    $function$
;

CREATE OR REPLACE FUNCTION public.prepare_company_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
    declare
      canonical_normalized_name text;
    begin
      new.name := btrim(new.name);
      canonical_normalized_name := lower(
        regexp_replace(new.name, '[[:space:]（）()·._-]+', '', 'g')
      );
      new.normalized_name := canonical_normalized_name;

      if new.unified_social_credit_code is not null then
        new.unified_social_credit_code := upper(btrim(new.unified_social_credit_code::text));
      end if;

      if new.unified_social_credit_code is not null then
        new.deduplication_key := 'uscc:' || new.unified_social_credit_code::text;
      else
        new.deduplication_key := coalesce(
          nullif(btrim(new.deduplication_key), ''),
          'name:' || md5(canonical_normalized_name)
        );
      end if;
      return new;
    end;
    $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
    begin
      new.updated_at := now();
      return new;
    end;
    $function$
;

create or replace view "public"."activity_log" with (security_invoker = on) as  SELECT (('company.'::text || c.id) || '.created'::text) AS id,
    'company.created'::text AS type,
    c.created_at AS date,
    c.id AS company_id,
    c.sales_id,
    to_json(c.*) AS company,
    NULL::json AS contact,
    NULL::json AS deal,
    NULL::json AS contact_note,
    NULL::json AS deal_note
   FROM public.companies c
UNION ALL
 SELECT (('contact.'::text || co.id) || '.created'::text) AS id,
    'contact.created'::text AS type,
    co.first_seen AS date,
    co.company_id,
    co.sales_id,
    NULL::json AS company,
    to_json(co.*) AS contact,
    NULL::json AS deal,
    NULL::json AS contact_note,
    NULL::json AS deal_note
   FROM public.contacts co
UNION ALL
 SELECT (('contactNote.'::text || cn.id) || '.created'::text) AS id,
    'contactNote.created'::text AS type,
    cn.date,
    co.company_id,
    cn.sales_id,
    NULL::json AS company,
    NULL::json AS contact,
    NULL::json AS deal,
    to_json(cn.*) AS contact_note,
    NULL::json AS deal_note
   FROM (public.contact_notes cn
     LEFT JOIN public.contacts co ON ((co.id = cn.contact_id)))
UNION ALL
 SELECT (('deal.'::text || d.id) || '.created'::text) AS id,
    'deal.created'::text AS type,
    d.created_at AS date,
    d.company_id,
    d.sales_id,
    NULL::json AS company,
    NULL::json AS contact,
    to_json(d.*) AS deal,
    NULL::json AS contact_note,
    NULL::json AS deal_note
   FROM public.deals d
UNION ALL
 SELECT (('dealNote.'::text || dn.id) || '.created'::text) AS id,
    'dealNote.created'::text AS type,
    dn.date,
    d.company_id,
    dn.sales_id,
    NULL::json AS company,
    NULL::json AS contact,
    NULL::json AS deal,
    NULL::json AS contact_note,
    to_json(dn.*) AS deal_note
   FROM (public.deal_notes dn
     LEFT JOIN public.deals d ON ((d.id = dn.deal_id)));


create or replace view "public"."companies_summary" with (security_invoker = on) as  SELECT c.id,
    c.workspace_id,
    c.created_at,
    c.updated_at,
    c.name,
    c.normalized_name,
    c.deduplication_key,
    c.unified_social_credit_code,
    c.registration_number,
    c.organization_code,
    c.legal_representative,
    c.operating_status,
    c.company_type,
    c.registered_capital_amount,
    c.paid_in_capital_amount,
    c.registered_capital_currency,
    c.established_on,
    c.approved_on,
    c.registration_authority,
    c.business_scope,
    c.province,
    c.district,
    c.industry_code,
    c.industry_name,
    c.employee_count,
    c.insured_employee_count,
    c.personnel_scale_text,
    c.region_text,
    c.primary_source,
    c.last_verified_at,
    c.profile_status,
    c.completeness_score,
    c.merged_into_company_id,
    c.sector,
    c.size,
    c.linkedin_url,
    c.website,
    c.phone_number,
    c.address,
    c.zipcode,
    c.city,
    c.state_abbr,
    c.sales_id,
    c.context_links,
    c.country,
    c.description,
    c.revenue,
    c.tax_identifier,
    c.logo,
    0::bigint AS nb_deals,
    0::bigint AS nb_contacts
   FROM public.companies c;


create or replace view "public"."contacts_summary" with (security_invoker = on) as  SELECT co.id,
    co.first_name,
    co.last_name,
    co.gender,
    co.title,
    co.background,
    co.avatar,
    co.first_seen,
    co.last_seen,
    co.has_newsletter,
    co.status,
    co.tags,
    co.company_id,
    co.sales_id,
    co.linkedin_url,
    co.email_jsonb,
    co.phone_jsonb,
    (jsonb_path_query_array(co.email_jsonb, '$[*]."email"'::jsonpath))::text AS email_fts,
    (jsonb_path_query_array(co.phone_jsonb, '$[*]."number"'::jsonpath))::text AS phone_fts,
    c.name AS company_name,
    count(DISTINCT t.id) FILTER (WHERE (t.done_date IS NULL)) AS nb_tasks
   FROM ((public.contacts co
     LEFT JOIN public.tasks t ON ((co.id = t.contact_id)))
     LEFT JOIN public.companies c ON ((co.company_id = c.id)))
  GROUP BY co.id, c.name;


grant select on table "public"."audit_logs" to "authenticated";

grant delete on table "public"."audit_logs" to "service_role";

grant insert on table "public"."audit_logs" to "service_role";

grant references on table "public"."audit_logs" to "service_role";

grant select on table "public"."audit_logs" to "service_role";

grant trigger on table "public"."audit_logs" to "service_role";

grant truncate on table "public"."audit_logs" to "service_role";

grant update on table "public"."audit_logs" to "service_role";

grant insert on table "public"."company_evidence" to "authenticated";

grant select on table "public"."company_evidence" to "authenticated";

grant delete on table "public"."company_evidence" to "service_role";

grant insert on table "public"."company_evidence" to "service_role";

grant references on table "public"."company_evidence" to "service_role";

grant select on table "public"."company_evidence" to "service_role";

grant trigger on table "public"."company_evidence" to "service_role";

grant truncate on table "public"."company_evidence" to "service_role";

grant update on table "public"."company_evidence" to "service_role";

grant insert on table "public"."company_field_facts" to "authenticated";

grant select on table "public"."company_field_facts" to "authenticated";

grant delete on table "public"."company_field_facts" to "service_role";

grant insert on table "public"."company_field_facts" to "service_role";

grant references on table "public"."company_field_facts" to "service_role";

grant select on table "public"."company_field_facts" to "service_role";

grant trigger on table "public"."company_field_facts" to "service_role";

grant truncate on table "public"."company_field_facts" to "service_role";

grant update on table "public"."company_field_facts" to "service_role";

grant insert on table "public"."company_identifiers" to "authenticated";

grant select on table "public"."company_identifiers" to "authenticated";

grant update on table "public"."company_identifiers" to "authenticated";

grant delete on table "public"."company_identifiers" to "service_role";

grant insert on table "public"."company_identifiers" to "service_role";

grant references on table "public"."company_identifiers" to "service_role";

grant select on table "public"."company_identifiers" to "service_role";

grant trigger on table "public"."company_identifiers" to "service_role";

grant truncate on table "public"."company_identifiers" to "service_role";

grant update on table "public"."company_identifiers" to "service_role";

grant insert on table "public"."company_list_members" to "authenticated";

grant select on table "public"."company_list_members" to "authenticated";

grant update on table "public"."company_list_members" to "authenticated";

grant delete on table "public"."company_list_members" to "service_role";

grant insert on table "public"."company_list_members" to "service_role";

grant references on table "public"."company_list_members" to "service_role";

grant select on table "public"."company_list_members" to "service_role";

grant trigger on table "public"."company_list_members" to "service_role";

grant truncate on table "public"."company_list_members" to "service_role";

grant update on table "public"."company_list_members" to "service_role";

grant insert on table "public"."company_lists" to "authenticated";

grant select on table "public"."company_lists" to "authenticated";

grant update on table "public"."company_lists" to "authenticated";

grant delete on table "public"."company_lists" to "service_role";

grant insert on table "public"."company_lists" to "service_role";

grant references on table "public"."company_lists" to "service_role";

grant select on table "public"."company_lists" to "service_role";

grant trigger on table "public"."company_lists" to "service_role";

grant truncate on table "public"."company_lists" to "service_role";

grant update on table "public"."company_lists" to "service_role";

grant delete on table "public"."configuration" to "service_role";

grant insert on table "public"."exports" to "authenticated";

grant select on table "public"."exports" to "authenticated";

grant delete on table "public"."exports" to "service_role";

grant insert on table "public"."exports" to "service_role";

grant references on table "public"."exports" to "service_role";

grant select on table "public"."exports" to "service_role";

grant trigger on table "public"."exports" to "service_role";

grant truncate on table "public"."exports" to "service_role";

grant update on table "public"."exports" to "service_role";

grant insert on table "public"."field_mapping_sets" to "authenticated";

grant select on table "public"."field_mapping_sets" to "authenticated";

grant update on table "public"."field_mapping_sets" to "authenticated";

grant delete on table "public"."field_mapping_sets" to "service_role";

grant insert on table "public"."field_mapping_sets" to "service_role";

grant references on table "public"."field_mapping_sets" to "service_role";

grant select on table "public"."field_mapping_sets" to "service_role";

grant trigger on table "public"."field_mapping_sets" to "service_role";

grant truncate on table "public"."field_mapping_sets" to "service_role";

grant update on table "public"."field_mapping_sets" to "service_role";

grant insert on table "public"."field_mapping_versions" to "authenticated";

grant select on table "public"."field_mapping_versions" to "authenticated";

grant update on table "public"."field_mapping_versions" to "authenticated";

grant delete on table "public"."field_mapping_versions" to "service_role";

grant insert on table "public"."field_mapping_versions" to "service_role";

grant references on table "public"."field_mapping_versions" to "service_role";

grant select on table "public"."field_mapping_versions" to "service_role";

grant trigger on table "public"."field_mapping_versions" to "service_role";

grant truncate on table "public"."field_mapping_versions" to "service_role";

grant update on table "public"."field_mapping_versions" to "service_role";

grant insert on table "public"."ingestion_jobs" to "authenticated";

grant select on table "public"."ingestion_jobs" to "authenticated";

grant delete on table "public"."ingestion_jobs" to "service_role";

grant insert on table "public"."ingestion_jobs" to "service_role";

grant references on table "public"."ingestion_jobs" to "service_role";

grant select on table "public"."ingestion_jobs" to "service_role";

grant trigger on table "public"."ingestion_jobs" to "service_role";

grant truncate on table "public"."ingestion_jobs" to "service_role";

grant update on table "public"."ingestion_jobs" to "service_role";

grant insert on table "public"."manual_reviews" to "authenticated";

grant select on table "public"."manual_reviews" to "authenticated";

grant update on table "public"."manual_reviews" to "authenticated";

grant delete on table "public"."manual_reviews" to "service_role";

grant insert on table "public"."manual_reviews" to "service_role";

grant references on table "public"."manual_reviews" to "service_role";

grant select on table "public"."manual_reviews" to "service_role";

grant trigger on table "public"."manual_reviews" to "service_role";

grant truncate on table "public"."manual_reviews" to "service_role";

grant update on table "public"."manual_reviews" to "service_role";

grant insert on table "public"."qualifications" to "authenticated";

grant select on table "public"."qualifications" to "authenticated";

grant update on table "public"."qualifications" to "authenticated";

grant delete on table "public"."qualifications" to "service_role";

grant insert on table "public"."qualifications" to "service_role";

grant references on table "public"."qualifications" to "service_role";

grant select on table "public"."qualifications" to "service_role";

grant trigger on table "public"."qualifications" to "service_role";

grant truncate on table "public"."qualifications" to "service_role";

grant update on table "public"."qualifications" to "service_role";

grant insert on table "public"."risk_events" to "authenticated";

grant select on table "public"."risk_events" to "authenticated";

grant update on table "public"."risk_events" to "authenticated";

grant delete on table "public"."risk_events" to "service_role";

grant insert on table "public"."risk_events" to "service_role";

grant references on table "public"."risk_events" to "service_role";

grant select on table "public"."risk_events" to "service_role";

grant trigger on table "public"."risk_events" to "service_role";

grant truncate on table "public"."risk_events" to "service_role";

grant update on table "public"."risk_events" to "service_role";

grant insert on table "public"."rule_results" to "authenticated";

grant select on table "public"."rule_results" to "authenticated";

grant delete on table "public"."rule_results" to "service_role";

grant insert on table "public"."rule_results" to "service_role";

grant references on table "public"."rule_results" to "service_role";

grant select on table "public"."rule_results" to "service_role";

grant trigger on table "public"."rule_results" to "service_role";

grant truncate on table "public"."rule_results" to "service_role";

grant update on table "public"."rule_results" to "service_role";

grant insert on table "public"."rule_runs" to "authenticated";

grant select on table "public"."rule_runs" to "authenticated";

grant delete on table "public"."rule_runs" to "service_role";

grant insert on table "public"."rule_runs" to "service_role";

grant references on table "public"."rule_runs" to "service_role";

grant select on table "public"."rule_runs" to "service_role";

grant trigger on table "public"."rule_runs" to "service_role";

grant truncate on table "public"."rule_runs" to "service_role";

grant update on table "public"."rule_runs" to "service_role";

grant insert on table "public"."rule_set_versions" to "authenticated";

grant select on table "public"."rule_set_versions" to "authenticated";

grant update on table "public"."rule_set_versions" to "authenticated";

grant delete on table "public"."rule_set_versions" to "service_role";

grant insert on table "public"."rule_set_versions" to "service_role";

grant references on table "public"."rule_set_versions" to "service_role";

grant select on table "public"."rule_set_versions" to "service_role";

grant trigger on table "public"."rule_set_versions" to "service_role";

grant truncate on table "public"."rule_set_versions" to "service_role";

grant update on table "public"."rule_set_versions" to "service_role";

grant insert on table "public"."rule_sets" to "authenticated";

grant select on table "public"."rule_sets" to "authenticated";

grant update on table "public"."rule_sets" to "authenticated";

grant delete on table "public"."rule_sets" to "service_role";

grant insert on table "public"."rule_sets" to "service_role";

grant references on table "public"."rule_sets" to "service_role";

grant select on table "public"."rule_sets" to "service_role";

grant trigger on table "public"."rule_sets" to "service_role";

grant truncate on table "public"."rule_sets" to "service_role";

grant update on table "public"."rule_sets" to "service_role";

grant insert on table "public"."source_connections" to "authenticated";

grant update on table "public"."source_connections" to "authenticated";

grant delete on table "public"."source_connections" to "service_role";

grant insert on table "public"."source_connections" to "service_role";

grant references on table "public"."source_connections" to "service_role";

grant select on table "public"."source_connections" to "service_role";

grant trigger on table "public"."source_connections" to "service_role";

grant truncate on table "public"."source_connections" to "service_role";

grant update on table "public"."source_connections" to "service_role";

grant insert on table "public"."source_queries" to "authenticated";

grant select on table "public"."source_queries" to "authenticated";

grant update on table "public"."source_queries" to "authenticated";

grant delete on table "public"."source_queries" to "service_role";

grant insert on table "public"."source_queries" to "service_role";

grant references on table "public"."source_queries" to "service_role";

grant select on table "public"."source_queries" to "service_role";

grant trigger on table "public"."source_queries" to "service_role";

grant truncate on table "public"."source_queries" to "service_role";

grant update on table "public"."source_queries" to "service_role";

grant insert on table "public"."source_records" to "authenticated";

grant select on table "public"."source_records" to "authenticated";

grant delete on table "public"."source_records" to "service_role";

grant insert on table "public"."source_records" to "service_role";

grant references on table "public"."source_records" to "service_role";

grant select on table "public"."source_records" to "service_role";

grant trigger on table "public"."source_records" to "service_role";

grant truncate on table "public"."source_records" to "service_role";

grant update on table "public"."source_records" to "service_role";

grant insert on table "public"."source_snapshots" to "authenticated";

grant select on table "public"."source_snapshots" to "authenticated";

grant delete on table "public"."source_snapshots" to "service_role";

grant insert on table "public"."source_snapshots" to "service_role";

grant references on table "public"."source_snapshots" to "service_role";

grant select on table "public"."source_snapshots" to "service_role";

grant trigger on table "public"."source_snapshots" to "service_role";

grant truncate on table "public"."source_snapshots" to "service_role";

grant update on table "public"."source_snapshots" to "service_role";

grant delete on table "public"."workspace_members" to "authenticated";

grant insert on table "public"."workspace_members" to "authenticated";

grant select on table "public"."workspace_members" to "authenticated";

grant update on table "public"."workspace_members" to "authenticated";

grant delete on table "public"."workspace_members" to "service_role";

grant insert on table "public"."workspace_members" to "service_role";

grant references on table "public"."workspace_members" to "service_role";

grant select on table "public"."workspace_members" to "service_role";

grant trigger on table "public"."workspace_members" to "service_role";

grant truncate on table "public"."workspace_members" to "service_role";

grant update on table "public"."workspace_members" to "service_role";

grant insert on table "public"."workspaces" to "authenticated";

grant select on table "public"."workspaces" to "authenticated";

grant update on table "public"."workspaces" to "authenticated";

grant delete on table "public"."workspaces" to "service_role";

grant insert on table "public"."workspaces" to "service_role";

grant references on table "public"."workspaces" to "service_role";

grant select on table "public"."workspaces" to "service_role";

grant trigger on table "public"."workspaces" to "service_role";

grant truncate on table "public"."workspaces" to "service_role";

grant update on table "public"."workspaces" to "service_role";


  create policy "Workspace admins can read audit logs"
  on "public"."audit_logs"
  as permissive
  for select
  to authenticated
using (private.has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text]));



  create policy "Workspace editors can insert companies"
  on "public"."companies"
  as permissive
  for insert
  to authenticated
with check (private.can_write_workspace(workspace_id));



  create policy "Workspace editors can update companies"
  on "public"."companies"
  as permissive
  for update
  to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));



  create policy "Workspace members can read companies"
  on "public"."companies"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can insert company evidence"
  on "public"."company_evidence"
  as permissive
  for insert
  to authenticated
with check (private.can_write_workspace(workspace_id));



  create policy "Members can read company evidence"
  on "public"."company_evidence"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can insert company field facts"
  on "public"."company_field_facts"
  as permissive
  for insert
  to authenticated
with check (private.can_write_workspace(workspace_id));



  create policy "Members can read company field facts"
  on "public"."company_field_facts"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can insert company identifiers"
  on "public"."company_identifiers"
  as permissive
  for insert
  to authenticated
with check (private.can_write_workspace(workspace_id));



  create policy "Editors can update company identifiers"
  on "public"."company_identifiers"
  as permissive
  for update
  to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));



  create policy "Members can read company identifiers"
  on "public"."company_identifiers"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can insert company list members"
  on "public"."company_list_members"
  as permissive
  for insert
  to authenticated
with check (private.can_write_workspace(workspace_id));



  create policy "Editors can update company list members"
  on "public"."company_list_members"
  as permissive
  for update
  to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));



  create policy "Members can read company list members"
  on "public"."company_list_members"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can insert company lists"
  on "public"."company_lists"
  as permissive
  for insert
  to authenticated
with check (private.can_write_workspace(workspace_id));



  create policy "Editors can update company lists"
  on "public"."company_lists"
  as permissive
  for update
  to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));



  create policy "Members can read company lists"
  on "public"."company_lists"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can enqueue exports"
  on "public"."exports"
  as permissive
  for insert
  to authenticated
with check ((private.can_write_workspace(workspace_id) AND (requested_by = auth.uid())));



  create policy "Members can read exports"
  on "public"."exports"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Admins can insert field mapping sets"
  on "public"."field_mapping_sets"
  as permissive
  for insert
  to authenticated
with check (private.has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text]));



  create policy "Admins can update field mapping sets"
  on "public"."field_mapping_sets"
  as permissive
  for update
  to authenticated
using (private.has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text]))
with check (private.has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text]));



  create policy "Members can read field mapping sets"
  on "public"."field_mapping_sets"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Admins can insert field mapping versions"
  on "public"."field_mapping_versions"
  as permissive
  for insert
  to authenticated
with check (private.has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text]));



  create policy "Admins can update field mapping versions"
  on "public"."field_mapping_versions"
  as permissive
  for update
  to authenticated
using (private.has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text]))
with check (private.has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text]));



  create policy "Members can read field mapping versions"
  on "public"."field_mapping_versions"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can enqueue ingestion jobs"
  on "public"."ingestion_jobs"
  as permissive
  for insert
  to authenticated
with check ((private.can_write_workspace(workspace_id) AND (requested_by = auth.uid())));



  create policy "Members can read ingestion jobs"
  on "public"."ingestion_jobs"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can insert own manual reviews"
  on "public"."manual_reviews"
  as permissive
  for insert
  to authenticated
with check ((private.can_write_workspace(workspace_id) AND (reviewer_user_id = auth.uid())));



  create policy "Editors can update own manual reviews"
  on "public"."manual_reviews"
  as permissive
  for update
  to authenticated
using ((private.can_write_workspace(workspace_id) AND (reviewer_user_id = auth.uid())))
with check ((private.can_write_workspace(workspace_id) AND (reviewer_user_id = auth.uid())));



  create policy "Members can read manual reviews"
  on "public"."manual_reviews"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can insert qualifications"
  on "public"."qualifications"
  as permissive
  for insert
  to authenticated
with check (private.can_write_workspace(workspace_id));



  create policy "Editors can update qualifications"
  on "public"."qualifications"
  as permissive
  for update
  to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));



  create policy "Members can read qualifications"
  on "public"."qualifications"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can insert risk events"
  on "public"."risk_events"
  as permissive
  for insert
  to authenticated
with check (private.can_write_workspace(workspace_id));



  create policy "Editors can update risk events"
  on "public"."risk_events"
  as permissive
  for update
  to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));



  create policy "Members can read risk events"
  on "public"."risk_events"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can insert rule results"
  on "public"."rule_results"
  as permissive
  for insert
  to authenticated
with check (private.can_write_workspace(workspace_id));



  create policy "Members can read rule results"
  on "public"."rule_results"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can enqueue rule runs"
  on "public"."rule_runs"
  as permissive
  for insert
  to authenticated
with check ((private.can_write_workspace(workspace_id) AND (requested_by = auth.uid())));



  create policy "Members can read rule runs"
  on "public"."rule_runs"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can insert rule set versions"
  on "public"."rule_set_versions"
  as permissive
  for insert
  to authenticated
with check (private.can_write_workspace(workspace_id));



  create policy "Editors can update rule set versions"
  on "public"."rule_set_versions"
  as permissive
  for update
  to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));



  create policy "Members can read rule set versions"
  on "public"."rule_set_versions"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can insert rule sets"
  on "public"."rule_sets"
  as permissive
  for insert
  to authenticated
with check (private.can_write_workspace(workspace_id));



  create policy "Editors can update rule sets"
  on "public"."rule_sets"
  as permissive
  for update
  to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));



  create policy "Members can read rule sets"
  on "public"."rule_sets"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Users can read own sales profile"
  on "public"."sales"
  as permissive
  for select
  to authenticated
using (((user_id = auth.uid()) OR public.is_admin()));



  create policy "Admins can insert source connections"
  on "public"."source_connections"
  as permissive
  for insert
  to authenticated
with check (private.has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text]));



  create policy "Admins can update source connections"
  on "public"."source_connections"
  as permissive
  for update
  to authenticated
using (private.has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text]))
with check (private.has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text]));



  create policy "Members can read source connections"
  on "public"."source_connections"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can insert source queries"
  on "public"."source_queries"
  as permissive
  for insert
  to authenticated
with check (private.can_write_workspace(workspace_id));



  create policy "Editors can update source queries"
  on "public"."source_queries"
  as permissive
  for update
  to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));



  create policy "Members can read source queries"
  on "public"."source_queries"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Editors can insert source records"
  on "public"."source_records"
  as permissive
  for insert
  to authenticated
with check (private.can_write_workspace(workspace_id));



  create policy "Editors can read raw source records"
  on "public"."source_records"
  as permissive
  for select
  to authenticated
using (private.can_write_workspace(workspace_id));



  create policy "Editors can insert source snapshots"
  on "public"."source_snapshots"
  as permissive
  for insert
  to authenticated
with check (private.can_write_workspace(workspace_id));



  create policy "Members can read source snapshots"
  on "public"."source_snapshots"
  as permissive
  for select
  to authenticated
using (private.is_workspace_member(workspace_id));



  create policy "Members can read workspace membership"
  on "public"."workspace_members"
  as permissive
  for select
  to authenticated
using (((user_id = auth.uid()) OR private.is_workspace_member(workspace_id)));



  create policy "Workspace admins can invite members"
  on "public"."workspace_members"
  as permissive
  for insert
  to authenticated
with check (((role <> 'owner'::text) AND private.has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));



  create policy "Workspace admins can remove non-owner members"
  on "public"."workspace_members"
  as permissive
  for delete
  to authenticated
using (((role <> 'owner'::text) AND private.has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));



  create policy "Workspace admins can update non-owner members"
  on "public"."workspace_members"
  as permissive
  for update
  to authenticated
using (((role <> 'owner'::text) AND private.has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])))
with check (((role <> 'owner'::text) AND private.has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));



  create policy "Users can create owned workspaces"
  on "public"."workspaces"
  as permissive
  for insert
  to authenticated
with check ((owner_user_id = auth.uid()));



  create policy "Users can read their workspaces"
  on "public"."workspaces"
  as permissive
  for select
  to authenticated
using (((owner_user_id = auth.uid()) OR private.is_workspace_member(id)));



  create policy "Workspace admins can update workspaces"
  on "public"."workspaces"
  as permissive
  for update
  to authenticated
using (private.has_workspace_role(id, ARRAY['owner'::text, 'admin'::text]))
with check (private.has_workspace_role(id, ARRAY['owner'::text, 'admin'::text]));


CREATE TRIGGER protect_audit_logs_workspace BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER "05_prepare_company_record" BEFORE INSERT OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.prepare_company_record();

CREATE TRIGGER protect_companies_workspace BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER set_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER protect_company_evidence_workspace BEFORE UPDATE ON public.company_evidence FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER protect_company_field_facts_workspace BEFORE UPDATE ON public.company_field_facts FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER protect_company_identifiers_workspace BEFORE UPDATE ON public.company_identifiers FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER set_company_identifiers_updated_at BEFORE UPDATE ON public.company_identifiers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER protect_company_list_members_workspace BEFORE UPDATE ON public.company_list_members FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER set_company_list_members_updated_at BEFORE UPDATE ON public.company_list_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER protect_company_lists_workspace BEFORE UPDATE ON public.company_lists FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER set_company_lists_updated_at BEFORE UPDATE ON public.company_lists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER protect_exports_workspace BEFORE UPDATE ON public.exports FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER set_exports_updated_at BEFORE UPDATE ON public.exports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER protect_field_mapping_sets_workspace BEFORE UPDATE ON public.field_mapping_sets FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER set_field_mapping_sets_updated_at BEFORE UPDATE ON public.field_mapping_sets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER protect_field_mapping_versions_workspace BEFORE UPDATE ON public.field_mapping_versions FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER protect_ingestion_jobs_workspace BEFORE UPDATE ON public.ingestion_jobs FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER set_ingestion_jobs_updated_at BEFORE UPDATE ON public.ingestion_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER protect_manual_reviews_workspace BEFORE UPDATE ON public.manual_reviews FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER set_manual_reviews_updated_at BEFORE UPDATE ON public.manual_reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER protect_qualifications_workspace BEFORE UPDATE ON public.qualifications FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER set_qualifications_updated_at BEFORE UPDATE ON public.qualifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER protect_risk_events_workspace BEFORE UPDATE ON public.risk_events FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER set_risk_events_updated_at BEFORE UPDATE ON public.risk_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER protect_rule_results_workspace BEFORE UPDATE ON public.rule_results FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER protect_rule_runs_workspace BEFORE UPDATE ON public.rule_runs FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER set_rule_runs_updated_at BEFORE UPDATE ON public.rule_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER protect_rule_set_versions_workspace BEFORE UPDATE ON public.rule_set_versions FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER protect_rule_sets_workspace BEFORE UPDATE ON public.rule_sets FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER set_rule_sets_updated_at BEFORE UPDATE ON public.rule_sets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER protect_source_connections_workspace BEFORE UPDATE ON public.source_connections FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER set_source_connections_updated_at BEFORE UPDATE ON public.source_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER protect_source_queries_workspace BEFORE UPDATE ON public.source_queries FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER set_source_queries_updated_at BEFORE UPDATE ON public.source_queries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER protect_source_records_workspace BEFORE UPDATE ON public.source_records FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER protect_source_snapshots_workspace BEFORE UPDATE ON public.source_snapshots FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER protect_workspace_members_workspace BEFORE UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_reassignment();

CREATE TRIGGER set_workspace_members_updated_at BEFORE UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER create_workspace_owner_membership_trigger AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION private.create_workspace_owner_membership();

CREATE TRIGGER protect_workspace_owner_trigger BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION private.prevent_workspace_owner_change();

CREATE TRIGGER set_workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

drop policy "Attachments 1mt4rzk_0" on "storage"."objects";

drop policy "Attachments 1mt4rzk_1" on "storage"."objects";

drop policy "Attachments 1mt4rzk_3" on "storage"."objects";


  create policy "Workspace admins can delete workbench imports"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'workbench-imports'::text) AND (EXISTS ( SELECT 1
   FROM public.workspace_members wm
  WHERE (((wm.workspace_id)::text = (storage.foldername(objects.name))[1]) AND (wm.user_id = auth.uid()) AND (wm.status = 'active'::text) AND (wm.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));



  create policy "Workspace members can read workbench exports"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'workbench-exports'::text) AND (EXISTS ( SELECT 1
   FROM public.workspace_members wm
  WHERE (((wm.workspace_id)::text = (storage.foldername(objects.name))[1]) AND (wm.user_id = auth.uid()) AND (wm.status = 'active'::text))))));



  create policy "Workspace members can read workbench imports"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'workbench-imports'::text) AND (EXISTS ( SELECT 1
   FROM public.workspace_members wm
  WHERE (((wm.workspace_id)::text = (storage.foldername(objects.name))[1]) AND (wm.user_id = auth.uid()) AND (wm.status = 'active'::text))))));



  create policy "Workspace members can upload own workbench imports"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'workbench-imports'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM public.workspace_members wm
  WHERE (((wm.workspace_id)::text = (storage.foldername(objects.name))[1]) AND (wm.user_id = auth.uid()) AND (wm.status = 'active'::text) AND (wm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))));
