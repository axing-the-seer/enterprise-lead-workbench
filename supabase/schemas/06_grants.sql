--
-- Grants
-- This file declares all grants and default privileges for the public schema.
--

-- Schema usage
grant usage on schema public to postgres;
grant usage on schema public to anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- Queue RPCs compute content-addressed hashes with pgcrypto while running as
-- the authenticated caller. Expose only schema lookup plus the deterministic
-- digest primitive; the extensions schema is not a PostgREST exposed schema.
revoke usage on schema extensions from public, anon;
grant usage on schema extensions to authenticated, service_role;
grant execute on function extensions.digest(text, text) to authenticated, service_role;

-- Function grants
grant all on function public.cleanup_note_attachments() to anon;
grant all on function public.cleanup_note_attachments() to authenticated;
grant all on function public.cleanup_note_attachments() to service_role;

grant all on function public.get_avatar_for_email(text) to anon;
grant all on function public.get_avatar_for_email(text) to authenticated;
grant all on function public.get_avatar_for_email(text) to service_role;

grant all on function public.get_domain_favicon(text) to anon;
grant all on function public.get_domain_favicon(text) to authenticated;
grant all on function public.get_domain_favicon(text) to service_role;

grant all on function public.get_note_attachments_function_url() to anon;
grant all on function public.get_note_attachments_function_url() to authenticated;
grant all on function public.get_note_attachments_function_url() to service_role;

revoke all on function public.get_user_id_by_email(text) from public;
grant all on function public.get_user_id_by_email(text) to service_role;

grant all on function public.handle_company_saved() to anon;
grant all on function public.handle_company_saved() to authenticated;
grant all on function public.handle_company_saved() to service_role;

grant all on function public.handle_contact_note_created_or_updated() to anon;
grant all on function public.handle_contact_note_created_or_updated() to authenticated;
grant all on function public.handle_contact_note_created_or_updated() to service_role;

grant all on function public.handle_contact_saved() to anon;
grant all on function public.handle_contact_saved() to authenticated;
grant all on function public.handle_contact_saved() to service_role;

grant all on function public.handle_new_user() to anon;
grant all on function public.handle_new_user() to authenticated;
grant all on function public.handle_new_user() to service_role;

grant all on function public.handle_update_user() to anon;
grant all on function public.handle_update_user() to authenticated;
grant all on function public.handle_update_user() to service_role;

grant all on function public.is_admin() to anon;
grant all on function public.is_admin() to authenticated;
grant all on function public.is_admin() to service_role;

grant all on function public.lowercase_email_jsonb() to anon;
grant all on function public.lowercase_email_jsonb() to authenticated;
grant all on function public.lowercase_email_jsonb() to service_role;

grant all on function public.merge_contacts(bigint, bigint) to anon;
grant all on function public.merge_contacts(bigint, bigint) to authenticated;
grant all on function public.merge_contacts(bigint, bigint) to service_role;

grant all on function public.set_sales_id_default() to anon;
grant all on function public.set_sales_id_default() to authenticated;
grant all on function public.set_sales_id_default() to service_role;

-- Workspace policy helpers are not public RPCs. Authenticated users need
-- execute only because RLS policies evaluate these functions.
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
grant usage on schema private to service_role;

revoke all on function private.is_workspace_member(uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_workspace_member(uuid) to service_role;

revoke all on function private.has_workspace_role(uuid, text[]) from public, anon;
grant execute on function private.has_workspace_role(uuid, text[]) to authenticated;
grant execute on function private.has_workspace_role(uuid, text[]) to service_role;

revoke all on function private.can_write_workspace(uuid) from public, anon;
grant execute on function private.can_write_workspace(uuid) to authenticated;
grant execute on function private.can_write_workspace(uuid) to service_role;

revoke all on function private.jsonb_get_dot_path(jsonb, text) from public, anon, authenticated;
grant execute on function private.jsonb_get_dot_path(jsonb, text) to service_role;

revoke all on function private.calculate_company_list_manifest_hash(uuid, uuid) from public, anon;
grant execute on function private.calculate_company_list_manifest_hash(uuid, uuid) to authenticated;
grant execute on function private.calculate_company_list_manifest_hash(uuid, uuid) to service_role;

revoke all on function private.create_workspace_owner_membership() from public, anon, authenticated;
grant execute on function private.create_workspace_owner_membership() to service_role;

revoke all on function private.prevent_workspace_owner_change() from public, anon, authenticated;
grant execute on function private.prevent_workspace_owner_change() to service_role;

revoke all on function private.prevent_workspace_reassignment() from public, anon, authenticated;
grant execute on function private.prevent_workspace_reassignment() to service_role;

revoke all on function private.prevent_published_version_mutation() from public, anon, authenticated;
grant execute on function private.prevent_published_version_mutation() to service_role;

-- First-administrator state is reachable only through the bootstrap Edge
-- Function's service-role client. No browser role can inspect or mutate it.
revoke all on table private.first_admin_bootstrap from public, anon, authenticated, service_role;
revoke all on table private.user_provisioning_claims from public, anon, authenticated, service_role;

revoke all on function public.get_first_admin_bootstrap_state() from public, anon, authenticated;
revoke all on function public.claim_first_admin_bootstrap(uuid) from public, anon, authenticated;
revoke all on function public.complete_first_admin_bootstrap(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_first_admin_bootstrap(uuid) from public, anon, authenticated;
grant execute on function public.get_first_admin_bootstrap_state() to service_role;
grant execute on function public.claim_first_admin_bootstrap(uuid) to service_role;
grant execute on function public.complete_first_admin_bootstrap(uuid, uuid) to service_role;
grant execute on function public.release_first_admin_bootstrap(uuid) to service_role;

revoke all on function public.issue_user_provisioning_claim(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.release_user_provisioning_claim(uuid) from public, anon, authenticated;
grant execute on function public.issue_user_provisioning_claim(uuid, text, text, boolean) to service_role;
grant execute on function public.release_user_provisioning_claim(uuid) to service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;

revoke all on function public.prepare_company_record() from public, anon, authenticated;
grant execute on function public.prepare_company_record() to service_role;

revoke all on function public.initialize_workbench_workspace(text, text) from public, anon;
grant execute on function public.initialize_workbench_workspace(text, text) to authenticated;
grant execute on function public.initialize_workbench_workspace(text, text) to service_role;

revoke all on function public.configure_source_connection(uuid, uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.configure_source_connection(uuid, uuid, text, text, text, jsonb) to authenticated;

revoke all on function public.save_rule_template(uuid, uuid, text, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_rule_template(uuid, uuid, text, text, text, jsonb, jsonb, text) to authenticated;

revoke all on function public.enqueue_workbench_job(uuid, text, jsonb, text) from public, anon;
grant execute on function public.enqueue_workbench_job(uuid, text, jsonb, text) to authenticated;
grant execute on function public.enqueue_workbench_job(uuid, text, jsonb, text) to service_role;

revoke all on function public.claim_next_workbench_job(text) from public, anon, authenticated;
grant execute on function public.claim_next_workbench_job(text) to service_role;

revoke all on function public.complete_workbench_job(text, uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.complete_workbench_job(text, uuid, text, jsonb, text, text) to service_role;

revoke all on function public.get_company_list_manifest_hash(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_company_list_manifest_hash(uuid, uuid) to service_role;

revoke all on function public.persist_workbench_ingestion_record(uuid, text, text, jsonb, text, timestamp with time zone, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.persist_workbench_ingestion_record(uuid, text, text, jsonb, text, timestamp with time zone, jsonb, text, jsonb) to service_role;

revoke all on function public.persist_workbench_web_evidence(uuid, bigint, text, jsonb, text, timestamp with time zone, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.persist_workbench_web_evidence(uuid, bigint, text, jsonb, text, timestamp with time zone, jsonb, text, jsonb) to service_role;

revoke all on function public.ensure_ingestion_company_list(uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_ingestion_company_list(uuid, text) to service_role;

revoke all on function public.add_ingestion_list_member(uuid, uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.add_ingestion_list_member(uuid, uuid, bigint, uuid) to service_role;

-- Table grants
grant all on table public.companies to anon;
grant all on table public.companies to authenticated;
grant all on table public.companies to service_role;

grant all on table public.contacts to anon;
grant all on table public.contacts to authenticated;
grant all on table public.contacts to service_role;

grant all on table public.contact_notes to anon;
grant all on table public.contact_notes to authenticated;
grant all on table public.contact_notes to service_role;

grant all on table public.deals to anon;
grant all on table public.deals to authenticated;
grant all on table public.deals to service_role;

grant all on table public.deal_notes to anon;
grant all on table public.deal_notes to authenticated;
grant all on table public.deal_notes to service_role;

grant all on table public.sales to anon;
grant all on table public.sales to authenticated;
grant all on table public.sales to service_role;

grant all on table public.tags to anon;
grant all on table public.tags to authenticated;
grant all on table public.tags to service_role;

grant all on table public.tasks to anon;
grant all on table public.tasks to authenticated;
grant all on table public.tasks to service_role;

grant all on table public.configuration to anon;
grant all on table public.configuration to authenticated;
grant all on table public.configuration to service_role;

grant all on table public.favicons_excluded_domains to anon;
grant all on table public.favicons_excluded_domains to authenticated;
grant all on table public.favicons_excluded_domains to service_role;

-- Quarantine the unused upstream CRM domain. These tables are retained only
-- to keep the fork structurally compatible while the production UI is being
-- replaced; they are not client-facing resources.
revoke all on table public.contacts from anon, authenticated;
revoke all on table public.contact_notes from anon, authenticated;
revoke all on table public.deals from anon, authenticated;
revoke all on table public.deal_notes from anon, authenticated;
revoke all on table public.tags from anon, authenticated;
revoke all on table public.tasks from anon, authenticated;
revoke all on table public.sales from anon, authenticated;
grant select on table public.sales to authenticated;

-- Keep only the authenticated configuration surface needed by Atomic's app
-- bootstrap. The legacy favicon registry is not a workbench resource.
revoke all on table public.configuration from anon, authenticated;
grant select, insert, update on table public.configuration to authenticated;
revoke all on table public.favicons_excluded_domains from anon, authenticated;

revoke all on function public.cleanup_note_attachments() from public, anon, authenticated;
revoke all on function public.get_avatar_for_email(text) from public, anon, authenticated;
revoke all on function public.get_domain_favicon(text) from public, anon, authenticated;
revoke all on function public.get_note_attachments_function_url() from public, anon, authenticated;
revoke all on function public.handle_company_saved() from public, anon, authenticated;
revoke all on function public.handle_contact_note_created_or_updated() from public, anon, authenticated;
revoke all on function public.handle_contact_saved() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_update_user() from public, anon, authenticated;
revoke all on function public.lowercase_email_jsonb() from public, anon, authenticated;
revoke all on function public.merge_contacts(bigint, bigint) from public, anon, authenticated;
revoke all on function public.set_sales_id_default() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Production workbench tables never expose anonymous access. RLS further
-- narrows authenticated privileges to the user's active workspace membership.
revoke all on table public.companies from anon, authenticated;
grant select, insert, update on table public.companies to authenticated;

revoke all on table public.workspaces from anon, authenticated;
grant select, insert, update on table public.workspaces to authenticated;
grant all on table public.workspaces to service_role;

revoke all on function public.configure_provider_priorities(uuid, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.configure_provider_priorities(uuid, jsonb)
to authenticated;

revoke all on table public.workspace_members from anon, authenticated;
grant select, insert, update, delete on table public.workspace_members to authenticated;
grant all on table public.workspace_members to service_role;

revoke all on table public.field_mapping_sets from anon, authenticated;
grant select, insert, update on table public.field_mapping_sets to authenticated;
grant all on table public.field_mapping_sets to service_role;

revoke all on table public.field_mapping_versions from anon, authenticated;
grant select, insert, update on table public.field_mapping_versions to authenticated;
grant all on table public.field_mapping_versions to service_role;

revoke all on table public.source_connections from anon, authenticated;
grant select (
    id, workspace_id, provider, name, connection_kind, status,
    has_secret_reference, connection_config, capabilities,
    default_mapping_version_id, external_connection_id, last_verified_at,
    last_error_code, created_by, updated_by, created_at, updated_at
) on public.source_connections to authenticated;
grant all on table public.source_connections to service_role;

revoke all on table public.source_queries from anon, authenticated;
grant select on table public.source_queries to authenticated;
grant all on table public.source_queries to service_role;

revoke all on table public.ingestion_jobs from anon, authenticated;
grant select on table public.ingestion_jobs to authenticated;
grant all on table public.ingestion_jobs to service_role;

revoke all on table public.source_records from anon, authenticated;
grant select on table public.source_records to authenticated;
grant all on table public.source_records to service_role;

revoke all on table public.source_snapshots from anon, authenticated;
grant select on table public.source_snapshots to authenticated;
grant all on table public.source_snapshots to service_role;

revoke all on table public.company_identifiers from anon, authenticated;
grant select, insert, update on table public.company_identifiers to authenticated;
grant all on table public.company_identifiers to service_role;

revoke all on table public.company_evidence from anon, authenticated;
grant select on table public.company_evidence to authenticated;
grant all on table public.company_evidence to service_role;

revoke all on table public.company_field_facts from anon, authenticated;
grant select on table public.company_field_facts to authenticated;
grant all on table public.company_field_facts to service_role;

revoke all on table public.risk_events from anon, authenticated;
grant select, insert, update on table public.risk_events to authenticated;
grant all on table public.risk_events to service_role;

revoke all on table public.qualifications from anon, authenticated;
grant select, insert, update on table public.qualifications to authenticated;
grant all on table public.qualifications to service_role;

revoke all on table public.company_lists from anon, authenticated;
grant select, insert, update on table public.company_lists to authenticated;
grant all on table public.company_lists to service_role;

revoke all on table public.company_list_members from anon, authenticated;
grant select, insert, update on table public.company_list_members to authenticated;
grant all on table public.company_list_members to service_role;

revoke all on table public.rule_sets from anon, authenticated;
grant select on table public.rule_sets to authenticated;
grant all on table public.rule_sets to service_role;

revoke all on table public.rule_set_versions from anon, authenticated;
grant select on table public.rule_set_versions to authenticated;
grant all on table public.rule_set_versions to service_role;

revoke all on table public.rule_runs from anon, authenticated;
grant select on table public.rule_runs to authenticated;
grant all on table public.rule_runs to service_role;

revoke all on table public.rule_results from anon, authenticated;
grant select on table public.rule_results to authenticated;
grant all on table public.rule_results to service_role;

revoke all on table public.manual_reviews from anon, authenticated;
grant select, insert, update on table public.manual_reviews to authenticated;
grant all on table public.manual_reviews to service_role;

revoke all on table public.exports from anon, authenticated;
grant select on table public.exports to authenticated;
grant all on table public.exports to service_role;

revoke all on table public.company_reports from anon, authenticated;
grant select on table public.company_reports to authenticated;
grant all on table public.company_reports to service_role;

revoke all on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;
grant all on table public.audit_logs to service_role;

-- View grants
grant all on table public.activity_log to anon;
grant all on table public.activity_log to authenticated;
grant all on table public.activity_log to service_role;

revoke all on table public.activity_log from anon, authenticated;

grant all on table public.companies_summary to anon;
grant all on table public.companies_summary to authenticated;
grant all on table public.companies_summary to service_role;

revoke all on table public.companies_summary from anon, authenticated;
grant select on table public.companies_summary to authenticated;
grant all on table public.companies_summary to service_role;

revoke all on table public.source_connections_safe from anon, authenticated;
grant select on table public.source_connections_safe to authenticated;
grant all on table public.source_connections_safe to service_role;

grant all on table public.contacts_summary to anon;
grant all on table public.contacts_summary to authenticated;
grant all on table public.contacts_summary to service_role;

revoke all on table public.contacts_summary from anon, authenticated;

grant all on table public.init_state to anon;
grant all on table public.init_state to authenticated;
grant all on table public.init_state to service_role;

-- Sequence grants
grant all on sequence public.companies_id_seq to anon;
grant all on sequence public.companies_id_seq to authenticated;
grant all on sequence public.companies_id_seq to service_role;

revoke all on sequence public.companies_id_seq from anon;
revoke all on sequence public.companies_id_seq from authenticated;
grant usage, select on sequence public.companies_id_seq to authenticated;

grant all on sequence public."contactNotes_id_seq" to anon;
grant all on sequence public."contactNotes_id_seq" to authenticated;
grant all on sequence public."contactNotes_id_seq" to service_role;

grant all on sequence public.contacts_id_seq to anon;
grant all on sequence public.contacts_id_seq to authenticated;
grant all on sequence public.contacts_id_seq to service_role;

grant all on sequence public."dealNotes_id_seq" to anon;
grant all on sequence public."dealNotes_id_seq" to authenticated;
grant all on sequence public."dealNotes_id_seq" to service_role;

grant all on sequence public.deals_id_seq to anon;
grant all on sequence public.deals_id_seq to authenticated;
grant all on sequence public.deals_id_seq to service_role;

grant all on sequence public.favicons_excluded_domains_id_seq to anon;
grant all on sequence public.favicons_excluded_domains_id_seq to authenticated;
grant all on sequence public.favicons_excluded_domains_id_seq to service_role;

grant all on sequence public.sales_id_seq to anon;
grant all on sequence public.sales_id_seq to authenticated;
grant all on sequence public.sales_id_seq to service_role;

grant all on sequence public.tags_id_seq to anon;
grant all on sequence public.tags_id_seq to authenticated;
grant all on sequence public.tags_id_seq to service_role;

grant all on sequence public.tasks_id_seq to anon;
grant all on sequence public.tasks_id_seq to authenticated;
grant all on sequence public.tasks_id_seq to service_role;

revoke all on sequence public."contactNotes_id_seq" from anon, authenticated;
revoke all on sequence public.contacts_id_seq from anon, authenticated;
revoke all on sequence public."dealNotes_id_seq" from anon, authenticated;
revoke all on sequence public.deals_id_seq from anon, authenticated;
revoke all on sequence public.sales_id_seq from anon, authenticated;
revoke all on sequence public.favicons_excluded_domains_id_seq from anon, authenticated;
revoke all on sequence public.tags_id_seq from anon, authenticated;
revoke all on sequence public.tasks_id_seq from anon, authenticated;

-- Default privileges
alter default privileges for role postgres in schema public grant all on sequences to postgres;
alter default privileges for role postgres in schema public grant all on sequences to anon;
alter default privileges for role postgres in schema public grant all on sequences to authenticated;
alter default privileges for role postgres in schema public grant all on sequences to service_role;

alter default privileges for role postgres in schema public grant all on functions to postgres;
alter default privileges for role postgres in schema public grant all on functions to anon;
alter default privileges for role postgres in schema public grant all on functions to authenticated;
alter default privileges for role postgres in schema public grant all on functions to service_role;

alter default privileges for role postgres in schema public grant all on tables to postgres;
alter default privileges for role postgres in schema public grant all on tables to anon;
alter default privileges for role postgres in schema public grant all on tables to authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;

-- Anonymous-by-default is unsafe for future production domain objects. Any
-- intentionally public table/function must opt in with an explicit grant.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public revoke all on tables from authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from authenticated;
alter default privileges for role postgres in schema public revoke all on functions from authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public;

revoke all on function public.submit_company_report_analysis(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.submit_company_report_analysis(uuid, uuid, text, text, jsonb) to authenticated, service_role;

-- Trigger-only helper; browser/API roles must not invoke it as an RPC.
revoke all on function public.set_company_list_origin() from public, anon, authenticated;
grant execute on function public.set_company_list_origin() to service_role;
