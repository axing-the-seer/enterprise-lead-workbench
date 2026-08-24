--
-- Triggers
-- This file declares all triggers.
--

-- Auto-populate sales_id from current auth user on insert
create or replace trigger set_company_sales_id_trigger
    before insert on public.companies
    for each row execute function public.set_sales_id_default();

create or replace trigger set_contact_sales_id_trigger
    before insert on public.contacts
    for each row execute function public.set_sales_id_default();

create or replace trigger set_contact_notes_sales_id_trigger
    before insert on public.contact_notes
    for each row execute function public.set_sales_id_default();

create or replace trigger set_deal_sales_id_trigger
    before insert on public.deals
    for each row execute function public.set_sales_id_default();

create or replace trigger set_deal_notes_sales_id_trigger
    before insert on public.deal_notes
    for each row execute function public.set_sales_id_default();

create or replace trigger set_task_sales_id_trigger
    before insert on public.tasks
    for each row execute function public.set_sales_id_default();

-- Lowercase contact emails before insert or update (must run before contact_saved)
create or replace trigger "10_lowercase_contact_emails"
    before insert or update on public.contacts
    for each row execute function public.lowercase_email_jsonb();

-- Auto-fetch contact avatar from email on save (runs after lowercase_contact_emails)
create or replace trigger "20_contact_saved"
    before insert or update on public.contacts
    for each row execute function public.handle_contact_saved();

-- Update contact.last_seen when a contact note is created
create or replace trigger on_public_contact_notes_created_or_updated
    after insert on public.contact_notes
    for each row execute function public.handle_contact_note_created_or_updated();

-- Cleanup storage attachments when contact notes are updated or deleted
create or replace trigger on_contact_notes_attachments_updated_delete_note_attachments
    after update on public.contact_notes
    for each row
    when (old.attachments is distinct from new.attachments)
    execute function public.cleanup_note_attachments();

create or replace trigger on_contact_notes_deleted_delete_note_attachments
    after delete on public.contact_notes
    for each row execute function public.cleanup_note_attachments();

-- Cleanup storage attachments when deal notes are updated or deleted
create or replace trigger on_deal_notes_attachments_updated_delete_note_attachments
    after update on public.deal_notes
    for each row
    when (old.attachments is distinct from new.attachments)
    execute function public.cleanup_note_attachments();

create or replace trigger on_deal_notes_deleted_delete_note_attachments
    after delete on public.deal_notes
    for each row execute function public.cleanup_note_attachments();

-- Auth triggers: sync auth.users to public.sales
create or replace trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create or replace trigger on_auth_user_updated
    after update on auth.users
    for each row execute function public.handle_update_user();

-- Bootstrap exactly one owner membership for every newly created workspace.
create or replace trigger create_workspace_owner_membership_trigger
    after insert on public.workspaces
    for each row execute function private.create_workspace_owner_membership();

create or replace trigger protect_workspace_owner_trigger
    before update on public.workspaces
    for each row execute function private.prevent_workspace_owner_change();

-- Canonical company identity fields are deterministic for direct GUI, API and
-- agent-created records alike.
create or replace trigger "05_prepare_company_record"
    before insert or update on public.companies
    for each row execute function public.prepare_company_record();

-- Keep audit timestamps authoritative at the database boundary.
create or replace trigger set_workspaces_updated_at before update on public.workspaces
    for each row execute function public.set_updated_at();
create or replace trigger set_workspace_members_updated_at before update on public.workspace_members
    for each row execute function public.set_updated_at();
create or replace trigger set_companies_updated_at before update on public.companies
    for each row execute function public.set_updated_at();
create or replace trigger set_field_mapping_sets_updated_at before update on public.field_mapping_sets
    for each row execute function public.set_updated_at();
create or replace trigger set_source_connections_updated_at before update on public.source_connections
    for each row execute function public.set_updated_at();
create or replace trigger set_source_queries_updated_at before update on public.source_queries
    for each row execute function public.set_updated_at();
create or replace trigger set_ingestion_jobs_updated_at before update on public.ingestion_jobs
    for each row execute function public.set_updated_at();
create or replace trigger set_company_identifiers_updated_at before update on public.company_identifiers
    for each row execute function public.set_updated_at();
create or replace trigger set_risk_events_updated_at before update on public.risk_events
    for each row execute function public.set_updated_at();
create or replace trigger set_qualifications_updated_at before update on public.qualifications
    for each row execute function public.set_updated_at();
create or replace trigger set_company_lists_updated_at before update on public.company_lists
    for each row execute function public.set_updated_at();
create or replace trigger set_company_list_members_updated_at before update on public.company_list_members
    for each row execute function public.set_updated_at();
create or replace trigger set_rule_sets_updated_at before update on public.rule_sets
    for each row execute function public.set_updated_at();
create or replace trigger set_rule_runs_updated_at before update on public.rule_runs
    for each row execute function public.set_updated_at();
create or replace trigger set_manual_reviews_updated_at before update on public.manual_reviews
    for each row execute function public.set_updated_at();
create or replace trigger set_exports_updated_at before update on public.exports
    for each row execute function public.set_updated_at();

-- A published mapping or rule version is an audit input. It must never be
-- edited in place; changes are represented by a new draft version.
create or replace trigger protect_published_field_mapping_version
    before update on public.field_mapping_versions
    for each row execute function private.prevent_published_version_mutation();
create or replace trigger protect_published_rule_set_version
    before update on public.rule_set_versions
    for each row execute function private.prevent_published_version_mutation();

-- A row may never be moved between tenants. Updates must create a new record
-- through an explicit, audited import instead.
create or replace trigger protect_workspace_members_workspace before update on public.workspace_members
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_companies_workspace before update on public.companies
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_field_mapping_sets_workspace before update on public.field_mapping_sets
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_field_mapping_versions_workspace before update on public.field_mapping_versions
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_source_connections_workspace before update on public.source_connections
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_source_queries_workspace before update on public.source_queries
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_ingestion_jobs_workspace before update on public.ingestion_jobs
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_source_records_workspace before update on public.source_records
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_source_snapshots_workspace before update on public.source_snapshots
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_company_identifiers_workspace before update on public.company_identifiers
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_company_evidence_workspace before update on public.company_evidence
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_company_field_facts_workspace before update on public.company_field_facts
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_risk_events_workspace before update on public.risk_events
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_qualifications_workspace before update on public.qualifications
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_company_lists_workspace before update on public.company_lists
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_company_list_members_workspace before update on public.company_list_members
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_rule_sets_workspace before update on public.rule_sets
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_rule_set_versions_workspace before update on public.rule_set_versions
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_rule_runs_workspace before update on public.rule_runs
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_rule_results_workspace before update on public.rule_results
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_manual_reviews_workspace before update on public.manual_reviews
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_exports_workspace before update on public.exports
    for each row execute function private.prevent_workspace_reassignment();
create or replace trigger protect_audit_logs_workspace before update on public.audit_logs
    for each row execute function private.prevent_workspace_reassignment();
