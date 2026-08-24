--
-- Row Level Security
-- This file declares RLS policies for all tables.
--

-- Enable RLS on all tables
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_notes enable row level security;
alter table public.deals enable row level security;
alter table public.deal_notes enable row level security;
alter table public.sales enable row level security;
alter table public.tags enable row level security;
alter table public.tasks enable row level security;
alter table public.configuration enable row level security;
alter table public.favicons_excluded_domains enable row level security;
alter table private.user_provisioning_claims enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.field_mapping_sets enable row level security;
alter table public.field_mapping_versions enable row level security;
alter table public.source_connections enable row level security;
alter table public.source_queries enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.source_records enable row level security;
alter table public.source_snapshots enable row level security;
alter table public.company_identifiers enable row level security;
alter table public.company_evidence enable row level security;
alter table public.company_field_facts enable row level security;
alter table public.risk_events enable row level security;
alter table public.qualifications enable row level security;
alter table public.company_lists enable row level security;
alter table public.company_list_members enable row level security;
alter table public.rule_sets enable row level security;
alter table public.rule_set_versions enable row level security;
alter table public.rule_runs enable row level security;
alter table public.rule_results enable row level security;
alter table public.manual_reviews enable row level security;
alter table public.exports enable row level security;
alter table public.company_reports enable row level security;
alter table public.audit_logs enable row level security;

-- Companies
create policy "Workspace members can read companies" on public.companies for select to authenticated
    using (private.is_workspace_member(workspace_id));
create policy "Workspace editors can insert companies" on public.companies for insert to authenticated
    with check (private.can_write_workspace(workspace_id));
create policy "Workspace editors can update companies" on public.companies for update to authenticated
    using (private.can_write_workspace(workspace_id))
    with check (private.can_write_workspace(workspace_id));

-- The upstream contact/deal/task/tag tables are not part of the enterprise
-- workbench. They deliberately have no authenticated policies and remain
-- service-role-only, so a hidden legacy route cannot become a cross-tenant
-- data bypass.

-- Sales is retained only as the Atomic authentication profile. A user may
-- read their own row; legacy global administrators may read all profiles.
create policy "Users can read own sales profile" on public.sales for select to authenticated
    using (user_id = auth.uid() or public.is_admin());

-- Configuration (admin-only for writes)
create policy "Enable read for authenticated" on public.configuration for select to authenticated using (true);
create policy "Enable insert for admins" on public.configuration for insert to authenticated with check (public.is_admin());
create policy "Enable update for admins" on public.configuration for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Favicons belong to the unused upstream contact enrichment path. Remove the
-- old tenant-blind policy when replaying this declarative schema; the table is
-- service-role-only in the production workbench.
drop policy if exists "Enable access for authenticated users only" on public.favicons_excluded_domains;

-- Workspaces and membership bootstrap. Hard deletion is intentionally not
-- exposed to authenticated clients; archive a workspace instead.
create policy "Users can read their workspaces" on public.workspaces for select to authenticated
    using (owner_user_id = auth.uid() or private.is_workspace_member(id));
create policy "Users can create owned workspaces" on public.workspaces for insert to authenticated
    with check (owner_user_id = auth.uid());
create policy "Workspace admins can update workspaces" on public.workspaces for update to authenticated
    using (private.has_workspace_role(id, array['owner', 'admin']::text[]))
    with check (private.has_workspace_role(id, array['owner', 'admin']::text[]));

create policy "Members can read workspace membership" on public.workspace_members for select to authenticated
    using (user_id = auth.uid() or private.is_workspace_member(workspace_id));
create policy "Workspace admins can invite members" on public.workspace_members for insert to authenticated
    with check (
      role <> 'owner'
      and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
    );
create policy "Workspace admins can update non-owner members" on public.workspace_members for update to authenticated
    using (
      role <> 'owner'
      and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
    )
    with check (
      role <> 'owner'
      and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
    );
create policy "Workspace admins can remove non-owner members" on public.workspace_members for delete to authenticated
    using (
      role <> 'owner'
      and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
    );

-- Mapping definitions and connection metadata are visible to members but only
-- workspace administrators may configure them.
create policy "Members can read field mapping sets" on public.field_mapping_sets for select to authenticated
    using (private.is_workspace_member(workspace_id));
create policy "Admins can insert field mapping sets" on public.field_mapping_sets for insert to authenticated
    with check (
      not is_locked
      and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
    );
create policy "Admins can update field mapping sets" on public.field_mapping_sets for update to authenticated
    using (
      not is_locked
      and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
    )
    with check (
      not is_locked
      and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
    );

create policy "Members can read field mapping versions" on public.field_mapping_versions for select to authenticated
    using (private.is_workspace_member(workspace_id));
create policy "Admins can insert field mapping versions" on public.field_mapping_versions for insert to authenticated
    with check (
      not is_locked
      and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
    );
create policy "Admins can update field mapping versions" on public.field_mapping_versions for update to authenticated
    using (
      not is_locked
      and status <> 'published'
      and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
    )
    with check (
      not is_locked
      and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
    );

create policy "Members can read source connections" on public.source_connections for select to authenticated
    using (private.is_workspace_member(workspace_id));

-- Query and job records are created only through the validated enqueue RPC.
-- Trusted workers own raw/derived writes so a client cannot forge an object
-- path or execution history by bypassing that RPC.
create policy "Members can read source queries" on public.source_queries for select to authenticated
    using (private.is_workspace_member(workspace_id));

create policy "Members can read ingestion jobs" on public.ingestion_jobs for select to authenticated
    using (private.is_workspace_member(workspace_id));

create policy "Editors can read raw source records" on public.source_records for select to authenticated
    using (private.can_write_workspace(workspace_id));

create policy "Members can read source snapshots" on public.source_snapshots for select to authenticated
    using (private.is_workspace_member(workspace_id));

-- Canonical company facts, evidence and enrichment.
create policy "Members can read company identifiers" on public.company_identifiers for select to authenticated
    using (private.is_workspace_member(workspace_id));
create policy "Editors can insert company identifiers" on public.company_identifiers for insert to authenticated
    with check (private.can_write_workspace(workspace_id));
create policy "Editors can update company identifiers" on public.company_identifiers for update to authenticated
    using (private.can_write_workspace(workspace_id))
    with check (private.can_write_workspace(workspace_id));

create policy "Members can read company evidence" on public.company_evidence for select to authenticated
    using (private.is_workspace_member(workspace_id));

create policy "Members can read company field facts" on public.company_field_facts for select to authenticated
    using (private.is_workspace_member(workspace_id));

create policy "Members can read risk events" on public.risk_events for select to authenticated
    using (private.is_workspace_member(workspace_id));
create policy "Editors can insert risk events" on public.risk_events for insert to authenticated
    with check (private.can_write_workspace(workspace_id));
create policy "Editors can update risk events" on public.risk_events for update to authenticated
    using (private.can_write_workspace(workspace_id))
    with check (private.can_write_workspace(workspace_id));

create policy "Members can read qualifications" on public.qualifications for select to authenticated
    using (private.is_workspace_member(workspace_id));
create policy "Editors can insert qualifications" on public.qualifications for insert to authenticated
    with check (private.can_write_workspace(workspace_id));
create policy "Editors can update qualifications" on public.qualifications for update to authenticated
    using (private.can_write_workspace(workspace_id))
    with check (private.can_write_workspace(workspace_id));

-- Lists, rules and reviews are editable by editors. Run inputs/results remain
-- append-only for authenticated users so an accepted result can be audited.
create policy "Members can read company lists" on public.company_lists for select to authenticated
    using (private.is_workspace_member(workspace_id));
create policy "Editors can insert company lists" on public.company_lists for insert to authenticated
    with check (private.can_write_workspace(workspace_id));
create policy "Editors can update company lists" on public.company_lists for update to authenticated
    using (private.can_write_workspace(workspace_id))
    with check (private.can_write_workspace(workspace_id));

create policy "Members can read company list members" on public.company_list_members for select to authenticated
    using (private.is_workspace_member(workspace_id));
create policy "Editors can insert company list members" on public.company_list_members for insert to authenticated
    with check (private.can_write_workspace(workspace_id));
create policy "Editors can update company list members" on public.company_list_members for update to authenticated
    using (private.can_write_workspace(workspace_id))
    with check (private.can_write_workspace(workspace_id));

create policy "Members can read rule sets" on public.rule_sets for select to authenticated
    using (private.is_workspace_member(workspace_id));

create policy "Members can read rule set versions" on public.rule_set_versions for select to authenticated
    using (private.is_workspace_member(workspace_id));

-- RuleTemplate v1 writes are atomic through save_rule_template. Keeping the
-- base tables read-only to browser roles prevents callers from choosing a
-- version number, bypassing validation, or separating publish/current updates.

create policy "Members can read rule runs" on public.rule_runs for select to authenticated
    using (private.is_workspace_member(workspace_id));

create policy "Members can read rule results" on public.rule_results for select to authenticated
    using (private.is_workspace_member(workspace_id));

create policy "Members can read manual reviews" on public.manual_reviews for select to authenticated
    using (private.is_workspace_member(workspace_id));
create policy "Editors can insert own manual reviews" on public.manual_reviews for insert to authenticated
    with check (private.can_write_workspace(workspace_id) and reviewer_user_id = auth.uid());
create policy "Editors can update own manual reviews" on public.manual_reviews for update to authenticated
    using (private.can_write_workspace(workspace_id) and reviewer_user_id = auth.uid())
    with check (private.can_write_workspace(workspace_id) and reviewer_user_id = auth.uid());

create policy "Members can read exports" on public.exports for select to authenticated
    using (private.is_workspace_member(workspace_id));

-- Reports are written only through submit_company_report_analysis so an
-- authenticated browser cannot forge Agent identity or bypass validation.
create policy "Members can read company reports" on public.company_reports for select to authenticated
    using (private.is_workspace_member(workspace_id));

-- Audit records are append-only and written by trusted workers. Workspace
-- owners/admins can inspect them; editors/viewers cannot enumerate them.
create policy "Workspace admins can read audit logs" on public.audit_logs for select to authenticated
    using (private.has_workspace_role(workspace_id, array['owner', 'admin']::text[]));
