-- Security-critical grants and initialization are explicit here because
-- pg_dump-based declarative diffs do not reliably preserve column ACLs,
-- default function EXECUTE revocations, storage bucket upserts, or view
-- security options.

alter table public.field_mapping_sets
  add column if not exists is_locked boolean not null default false;
alter table public.field_mapping_versions
  add column if not exists is_locked boolean not null default false;

CREATE OR REPLACE FUNCTION "private"."prevent_published_version_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
    begin
      if old.status = 'published' then
        raise exception using
          errcode = '42501',
          message = 'published versions are immutable; create a new draft version';
      end if;
      return new;
    end;
    $$;

drop trigger if exists protect_published_field_mapping_version
  on public.field_mapping_versions;
create trigger protect_published_field_mapping_version
  before update on public.field_mapping_versions
  for each row execute function private.prevent_published_version_mutation();

drop trigger if exists protect_published_rule_set_version
  on public.rule_set_versions;
create trigger protect_published_rule_set_version
  before update on public.rule_set_versions
  for each row execute function private.prevent_published_version_mutation();

-- All client-originated jobs pass through this validated RPC. The function
-- owns the inserts because the queue and derived tables are service-only.
alter function public.enqueue_workbench_job(uuid, text, jsonb, text)
  security definer;

drop policy if exists "Editors can insert source queries" on public.source_queries;
drop policy if exists "Editors can update source queries" on public.source_queries;
drop policy if exists "Editors can enqueue ingestion jobs" on public.ingestion_jobs;
drop policy if exists "Editors can insert source records" on public.source_records;
drop policy if exists "Editors can insert source snapshots" on public.source_snapshots;
drop policy if exists "Editors can insert company evidence" on public.company_evidence;
drop policy if exists "Editors can insert company field facts" on public.company_field_facts;
drop policy if exists "Editors can enqueue rule runs" on public.rule_runs;
drop policy if exists "Editors can insert rule results" on public.rule_results;
drop policy if exists "Editors can enqueue exports" on public.exports;

drop policy if exists "Admins can insert field mapping sets" on public.field_mapping_sets;
create policy "Admins can insert field mapping sets"
  on public.field_mapping_sets for insert to authenticated
  with check (
    not is_locked
    and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
  );

drop policy if exists "Admins can update field mapping sets" on public.field_mapping_sets;
create policy "Admins can update field mapping sets"
  on public.field_mapping_sets for update to authenticated
  using (
    not is_locked
    and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
  )
  with check (
    not is_locked
    and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
  );

drop policy if exists "Admins can insert field mapping versions" on public.field_mapping_versions;
create policy "Admins can insert field mapping versions"
  on public.field_mapping_versions for insert to authenticated
  with check (
    not is_locked
    and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
  );

drop policy if exists "Admins can update field mapping versions" on public.field_mapping_versions;
create policy "Admins can update field mapping versions"
  on public.field_mapping_versions for update to authenticated
  using (
    not is_locked
    and status <> 'published'
    and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
  )
  with check (
    not is_locked
    and private.has_workspace_role(workspace_id, array['owner', 'admin']::text[])
  );

drop policy if exists "Editors can update rule set versions" on public.rule_set_versions;
create policy "Editors can update rule set versions"
  on public.rule_set_versions for update to authenticated
  using (status <> 'published' and private.can_write_workspace(workspace_id))
  with check (private.can_write_workspace(workspace_id));

-- Private helpers are callable only as narrowly required by RLS and workers.
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

revoke all on function private.is_workspace_member(uuid) from public, anon;
revoke all on function private.has_workspace_role(uuid, text[]) from public, anon;
revoke all on function private.can_write_workspace(uuid) from public, anon;
revoke all on function private.calculate_company_list_manifest_hash(uuid, uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function private.has_workspace_role(uuid, text[]) to authenticated, service_role;
grant execute on function private.can_write_workspace(uuid) to authenticated, service_role;
grant execute on function private.calculate_company_list_manifest_hash(uuid, uuid) to authenticated, service_role;

revoke all on function private.jsonb_get_dot_path(jsonb, text) from public, anon, authenticated;
grant execute on function private.jsonb_get_dot_path(jsonb, text) to service_role;
revoke all on function private.create_workspace_owner_membership() from public, anon, authenticated;
revoke all on function private.prevent_workspace_owner_change() from public, anon, authenticated;
revoke all on function private.prevent_workspace_reassignment() from public, anon, authenticated;
revoke all on function private.prevent_published_version_mutation() from public, anon, authenticated;
grant execute on function private.create_workspace_owner_membership() to service_role;
grant execute on function private.prevent_workspace_owner_change() to service_role;
grant execute on function private.prevent_workspace_reassignment() to service_role;
grant execute on function private.prevent_published_version_mutation() to service_role;

revoke usage on schema extensions from public, anon;
grant usage on schema extensions to authenticated, service_role;
grant execute on function extensions.digest(text, text) to authenticated, service_role;

-- PostgreSQL grants PUBLIC execute on new functions unless explicitly
-- revoked. Only enqueue/initialize are client RPCs; workers use service_role.
revoke all on function public.enqueue_workbench_job(uuid, text, jsonb, text) from public, anon;
grant execute on function public.enqueue_workbench_job(uuid, text, jsonb, text) to authenticated, service_role;

revoke all on function public.claim_next_workbench_job(text) from public, anon, authenticated;
revoke all on function public.complete_workbench_job(text, uuid, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.get_company_list_manifest_hash(uuid, uuid) from public, anon, authenticated;
revoke all on function public.persist_workbench_ingestion_record(uuid, text, text, jsonb, text, timestamp with time zone, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.ensure_ingestion_company_list(uuid, text) from public, anon, authenticated;
revoke all on function public.add_ingestion_list_member(uuid, uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.claim_next_workbench_job(text) to service_role;
grant execute on function public.complete_workbench_job(text, uuid, text, jsonb, text, text) to service_role;
grant execute on function public.get_company_list_manifest_hash(uuid, uuid) to service_role;
grant execute on function public.persist_workbench_ingestion_record(uuid, text, text, jsonb, text, timestamp with time zone, jsonb, text, jsonb) to service_role;
grant execute on function public.ensure_ingestion_company_list(uuid, text) to service_role;
grant execute on function public.add_ingestion_list_member(uuid, uuid, bigint, uuid) to service_role;

-- The archived Atomic CRM helpers are trigger/internal implementation details,
-- not anonymous PostgREST RPCs.  Revoke the upstream default EXECUTE grants so
-- the production API has no anonymous function surface.
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
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.prepare_company_record() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Remove inherited broad privileges before granting the exact client surface.
revoke all on table public.workspaces from anon, authenticated;
revoke all on table public.workspace_members from anon, authenticated;
revoke all on table public.companies from anon, authenticated;
revoke all on table public.field_mapping_sets from anon, authenticated;
revoke all on table public.field_mapping_versions from anon, authenticated;
revoke all on table public.source_connections from anon, authenticated;
revoke all on table public.source_queries from anon, authenticated;
revoke all on table public.ingestion_jobs from anon, authenticated;
revoke all on table public.source_records from anon, authenticated;
revoke all on table public.source_snapshots from anon, authenticated;
revoke all on table public.company_identifiers from anon, authenticated;
revoke all on table public.company_evidence from anon, authenticated;
revoke all on table public.company_field_facts from anon, authenticated;
revoke all on table public.risk_events from anon, authenticated;
revoke all on table public.qualifications from anon, authenticated;
revoke all on table public.company_lists from anon, authenticated;
revoke all on table public.company_list_members from anon, authenticated;
revoke all on table public.rule_sets from anon, authenticated;
revoke all on table public.rule_set_versions from anon, authenticated;
revoke all on table public.rule_runs from anon, authenticated;
revoke all on table public.rule_results from anon, authenticated;
revoke all on table public.manual_reviews from anon, authenticated;
revoke all on table public.exports from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

grant select, insert, update on table public.workspaces to authenticated;
grant select, insert, update, delete on table public.workspace_members to authenticated;
grant select, insert, update on table public.companies to authenticated;
grant select, insert, update on table public.field_mapping_sets to authenticated;
grant select, insert, update on table public.field_mapping_versions to authenticated;
grant select (
  id, workspace_id, provider, name, connection_kind, status,
  has_secret_reference, connection_config, capabilities,
  default_mapping_version_id, external_connection_id, last_verified_at,
  last_error_code, created_by, updated_by, created_at, updated_at
) on public.source_connections to authenticated;
grant insert, update on table public.source_connections to authenticated;
grant select on table public.source_queries to authenticated;
grant select on table public.ingestion_jobs to authenticated;
grant select on table public.source_records to authenticated;
grant select on table public.source_snapshots to authenticated;
grant select, insert, update on table public.company_identifiers to authenticated;
grant select on table public.company_evidence to authenticated;
grant select on table public.company_field_facts to authenticated;
grant select, insert, update on table public.risk_events to authenticated;
grant select, insert, update on table public.qualifications to authenticated;
grant select, insert, update on table public.company_lists to authenticated;
grant select, insert, update on table public.company_list_members to authenticated;
grant select, insert, update on table public.rule_sets to authenticated;
grant select, insert, update on table public.rule_set_versions to authenticated;
grant select on table public.rule_runs to authenticated;
grant select on table public.rule_results to authenticated;
grant select, insert, update on table public.manual_reviews to authenticated;
grant select on table public.exports to authenticated;
grant select on table public.audit_logs to authenticated;

grant all on table public.workspaces to service_role;
grant all on table public.workspace_members to service_role;
grant all on table public.companies to service_role;
grant all on table public.field_mapping_sets to service_role;
grant all on table public.field_mapping_versions to service_role;
grant all on table public.source_connections to service_role;
grant all on table public.source_queries to service_role;
grant all on table public.ingestion_jobs to service_role;
grant all on table public.source_records to service_role;
grant all on table public.source_snapshots to service_role;
grant all on table public.company_identifiers to service_role;
grant all on table public.company_evidence to service_role;
grant all on table public.company_field_facts to service_role;
grant all on table public.risk_events to service_role;
grant all on table public.qualifications to service_role;
grant all on table public.company_lists to service_role;
grant all on table public.company_list_members to service_role;
grant all on table public.rule_sets to service_role;
grant all on table public.rule_set_versions to service_role;
grant all on table public.rule_runs to service_role;
grant all on table public.rule_results to service_role;
grant all on table public.manual_reviews to service_role;
grant all on table public.exports to service_role;
grant all on table public.audit_logs to service_role;

revoke all on sequence public.companies_id_seq from anon, authenticated;
grant usage, select on sequence public.companies_id_seq to authenticated;
grant all on sequence public.companies_id_seq to service_role;

-- Quarantined Atomic CRM sequences must not remain usable through nextval().
revoke all on sequence public."contactNotes_id_seq" from anon, authenticated;
revoke all on sequence public.contacts_id_seq from anon, authenticated;
revoke all on sequence public."dealNotes_id_seq" from anon, authenticated;
revoke all on sequence public.deals_id_seq from anon, authenticated;
revoke all on sequence public.favicons_excluded_domains_id_seq from anon, authenticated;
revoke all on sequence public.sales_id_seq from anon, authenticated;
revoke all on sequence public.tags_id_seq from anon, authenticated;
revoke all on sequence public.tasks_id_seq from anon, authenticated;

alter view public.activity_log set (security_invoker = on);
alter view public.companies_summary set (security_invoker = on);
alter view public.contacts_summary set (security_invoker = on);
revoke all on table public.activity_log from anon, authenticated;
revoke all on table public.companies_summary from anon, authenticated;
revoke all on table public.contacts_summary from anon, authenticated;
grant select on table public.companies_summary to authenticated;
grant all on table public.activity_log to service_role;
grant all on table public.companies_summary to service_role;
grant all on table public.contacts_summary to service_role;

-- Keep legacy CRM records recoverable but never public or client-writable.
revoke all on table public.contacts from anon, authenticated;
revoke all on table public.contact_notes from anon, authenticated;
revoke all on table public.deals from anon, authenticated;
revoke all on table public.deal_notes from anon, authenticated;
revoke all on table public.tags from anon, authenticated;
revoke all on table public.tasks from anon, authenticated;
revoke all on table public.sales from anon, authenticated;
grant select on table public.sales to authenticated;

update storage.buckets set public = false where id = 'attachments';

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'workbench-imports', 'workbench-imports', false, 20971520,
  array[
    'text/csv', 'text/plain', 'application/json',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'workbench-exports', 'workbench-exports', false, 52428800,
  array[
    'text/csv', 'text/html', 'application/json', 'application/zip',
    'application/octet-stream', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated;

-- Atomic, idempotent GUI initialization. This creates only metadata and
-- reviewed mappings; provider credentials remain outside the database.
CREATE OR REPLACE FUNCTION "public"."initialize_workbench_workspace"(
    "p_workspace_name" "text",
    "p_workspace_slug" "text" DEFAULT NULL::"text"
) RETURNS TABLE(
    "workspace_id" "uuid",
    "created" boolean,
    "qcc_connection_id" "uuid",
    "huoke_connection_id" "uuid",
    "file_connection_id" "uuid",
    "default_rule_set_id" "uuid"
)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    declare
      actor_id uuid := auth.uid();
      normalized_name text := nullif(btrim(p_workspace_name), '');
      normalized_slug text;
      existing_owner_id uuid;
      initialized_workspace_id uuid;
      initialized_created boolean := false;
      qcc_mapping_set_id uuid;
      qcc_mapping_version_id uuid;
      huoke_mapping_set_id uuid;
      huoke_mapping_version_id uuid;
      initialized_qcc_connection_id uuid;
      initialized_huoke_connection_id uuid;
      initialized_file_connection_id uuid;
      initialized_web_connection_id uuid;
      initialized_rule_set_id uuid;
    begin
      if actor_id is null then
        raise exception using errcode = '42501', message = 'authentication required';
      end if;
      if normalized_name is null then
        raise exception using errcode = '22023', message = 'workspace name is required';
      end if;

      if p_workspace_slug is null or btrim(p_workspace_slug) = '' then
        select w.id, w.slug::text
          into initialized_workspace_id, normalized_slug
        from public.workspaces w
        where w.owner_user_id = actor_id
          and w.status = 'active'
        order by w.created_at, w.id
        limit 1;

        if initialized_workspace_id is null then
          normalized_slug := 'workspace-' || substr(
            encode(extensions.digest(actor_id::text, 'sha256'), 'hex'),
            1,
            24
          );
        end if;
      else
        normalized_slug := lower(btrim(p_workspace_slug));
      end if;

      if length(normalized_slug) not between 2 and 63
         or normalized_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
        raise exception using errcode = '22023', message = 'invalid workspace slug';
      end if;

      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'workbench-initialize:' || actor_id::text || ':' || normalized_slug,
          0
        )
      );

      select w.id, w.owner_user_id
        into initialized_workspace_id, existing_owner_id
      from public.workspaces w
      where w.slug = normalized_slug
      limit 1;

      if initialized_workspace_id is not null and existing_owner_id <> actor_id then
        raise exception using errcode = '23505', message = 'workspace slug is unavailable';
      end if;

      if initialized_workspace_id is null then
        insert into public.workspaces (name, slug, owner_user_id)
        values (normalized_name, normalized_slug, actor_id)
        returning id into initialized_workspace_id;
        initialized_created := true;
      end if;

      insert into public.workspace_members (
        workspace_id, user_id, role, status, joined_at
      ) values (
        initialized_workspace_id, actor_id, 'owner', 'active', now()
      )
      on conflict on constraint workspace_members_workspace_user_key do update set
        role = 'owner',
        status = 'active',
        joined_at = coalesce(public.workspace_members.joined_at, excluded.joined_at),
        updated_at = now();

      insert into public.field_mapping_sets (
        workspace_id, provider, name, description, status, is_locked,
        current_version_number, created_by
      ) values (
        initialized_workspace_id,
        'qcc',
        '企查查工商字段映射（系统）',
        '内置企查查 CLI 工商信息到 Canonical v1 的已审阅映射。',
        'active',
        true,
        1,
        actor_id
      )
      on conflict on constraint field_mapping_sets_workspace_name_key do nothing
      returning id into qcc_mapping_set_id;

      if qcc_mapping_set_id is null then
        select fms.id into qcc_mapping_set_id
        from public.field_mapping_sets fms
        where fms.workspace_id = initialized_workspace_id
          and fms.provider = 'qcc'
          and fms.name = '企查查工商字段映射（系统）';
      end if;

      insert into public.field_mapping_versions (
        workspace_id, mapping_set_id, version_number, status, is_locked,
        mapping_definition, source_schema_version, canonical_schema_version,
        change_note, created_by, published_at
      ) values (
        initialized_workspace_id,
        qcc_mapping_set_id,
        1,
        'published',
        true,
        jsonb_build_object(
          'contractVersion', '1.0',
          'provider', 'qcc',
          'adapter', 'qichacha',
          'apiProduct', 'qcc-agent-cli/get_company_registration_info',
          'apiVersion', '1.0.10-cn-json',
          'mappingReviewedAt', '2026-08-20',
          'usageScope', 'internal_analysis',
          'fields', jsonb_build_object(
            'companyName', '企业名称',
            'creditCode', '统一社会信用代码',
            'legalPerson', '法定代表人',
            'companyType', '企业类型',
            'registeredCapital', '注册资本',
            'paidInCapital', '实缴资本',
            'establishedDate', '成立日期',
            'approvedDate', '核准日期',
            'registrationAuthority', '登记机关',
            'status', '登记状态',
            'industryL2', '国标行业',
            'regionRaw', '所属地区',
            'personnelScale', '人员规模',
            'insuredCount', '参保人数',
            'registeredAddress', '注册地址',
            'businessScope', '经营范围',
            'sourceUpdatedAt', '核准日期'
          ),
          'units', jsonb_build_object(
            'registeredCapital', 'wan_cny',
            'paidInCapital', 'wan_cny'
          )
        ),
        'qcc-agent-cli-1.0.10-cn-json',
        '1.0',
        '生产内置；仅保存字段契约，不保存密钥。',
        actor_id,
        now()
      )
      on conflict on constraint field_mapping_versions_set_version_key do nothing
      returning id into qcc_mapping_version_id;

      if qcc_mapping_version_id is null then
        select fmv.id into qcc_mapping_version_id
        from public.field_mapping_versions fmv
        where fmv.workspace_id = initialized_workspace_id
          and fmv.mapping_set_id = qcc_mapping_set_id
          and fmv.version_number = 1;
      end if;

      insert into public.field_mapping_sets (
        workspace_id, provider, name, description, status, is_locked,
        current_version_number, created_by
      ) values (
        initialized_workspace_id,
        'huoke_assistant',
        '获客助手企业字段映射（系统）',
        '内置获客助手名单字段到 Canonical v1 的已审阅映射。',
        'active',
        true,
        1,
        actor_id
      )
      on conflict on constraint field_mapping_sets_workspace_name_key do nothing
      returning id into huoke_mapping_set_id;

      if huoke_mapping_set_id is null then
        select fms.id into huoke_mapping_set_id
        from public.field_mapping_sets fms
        where fms.workspace_id = initialized_workspace_id
          and fms.provider = 'huoke_assistant'
          and fms.name = '获客助手企业字段映射（系统）';
      end if;

      insert into public.field_mapping_versions (
        workspace_id, mapping_set_id, version_number, status, is_locked,
        mapping_definition, source_schema_version, canonical_schema_version,
        change_note, created_by, published_at
      ) values (
        initialized_workspace_id,
        huoke_mapping_set_id,
        1,
        'published',
        true,
        jsonb_build_object(
          'contractVersion', '1.0',
          'provider', 'huoke_assistant',
          'adapter', 'kc',
          'sourceSchemaVersion', 'kc-company-search-v1',
          'usageScope', 'internal_analysis',
          'fields', jsonb_build_object(
            'companyName', jsonb_build_object('sourceField', 'companyName', 'unit', 'text'),
            'creditCode', jsonb_build_object('sourceField', 'taxId', 'unit', 'text'),
            'legalPerson', jsonb_build_object('sourceField', 'legalPerson', 'unit', 'text'),
            'legalChangeDate', jsonb_build_object('sourceField', 'legalChangeDate', 'unit', 'date'),
            'legalPersonSharePercent', jsonb_build_object('sourceField', 'stockProportion', 'unit', 'percent'),
            'registeredCapital.valueWan', jsonb_build_object('sourceField', 'capitalNum', 'unit', 'wan_cny'),
            'establishedDate', jsonb_build_object('sourceField', 'establishDate', 'unit', 'date'),
            'status.raw', jsonb_build_object('sourceField', 'status', 'unit', 'text'),
            'status.normalized', jsonb_build_object('sourceField', 'status', 'unit', 'text'),
            'industry.l1', jsonb_build_object('sourceField', 'idy1', 'unit', 'text'),
            'industry.l2', jsonb_build_object('sourceField', 'idy2', 'unit', 'text'),
            'insuredCount', jsonb_build_object('sourceField', 'insuredNum', 'unit', 'person'),
            'registeredAddress', jsonb_build_object('sourceField', 'address', 'unit', 'text'),
            'businessScope', jsonb_build_object('sourceField', 'businessScope', 'unit', 'text'),
            'contact.phoneMasked', jsonb_build_object('sourceField', 'phone', 'unit', 'text', 'redaction', 'masked_only'),
            'contact.emailMasked', jsonb_build_object('sourceField', 'email', 'unit', 'text', 'redaction', 'masked_only'),
            'tags.qualifications', jsonb_build_object('sourceField', 'tag.blue', 'unit', 'text'),
            'tags.operational', jsonb_build_object('sourceField', 'tag.blue', 'unit', 'text'),
            'tags.risk', jsonb_build_object('sourceField', 'tag.red', 'unit', 'text')
          )
        ),
        'kc-company-search-v1',
        '1.0',
        '生产内置；联系方式只允许脱敏值，不保存密钥。',
        actor_id,
        now()
      )
      on conflict on constraint field_mapping_versions_set_version_key do nothing
      returning id into huoke_mapping_version_id;

      if huoke_mapping_version_id is null then
        select fmv.id into huoke_mapping_version_id
        from public.field_mapping_versions fmv
        where fmv.workspace_id = initialized_workspace_id
          and fmv.mapping_set_id = huoke_mapping_set_id
          and fmv.version_number = 1;
      end if;

      insert into public.source_connections (
        workspace_id, provider, name, connection_kind, status,
        connection_config, capabilities, default_mapping_version_id,
        created_by, updated_by
      ) values (
        initialized_workspace_id, 'qcc', '企查查（系统）', 'cli', 'draft',
        '{}'::jsonb, array['company_registration']::text[], qcc_mapping_version_id,
        actor_id, actor_id
      )
      on conflict on constraint source_connections_workspace_name_key do nothing
      returning id into initialized_qcc_connection_id;

      if initialized_qcc_connection_id is null then
        select sc.id into initialized_qcc_connection_id
        from public.source_connections sc
        where sc.workspace_id = initialized_workspace_id
          and sc.name = '企查查（系统）'
          and sc.provider = 'qcc';
      end if;

      insert into public.source_connections (
        workspace_id, provider, name, connection_kind, status,
        connection_config, capabilities, default_mapping_version_id,
        created_by, updated_by
      ) values (
        initialized_workspace_id, 'huoke_assistant', '获客助手（系统）', 'api', 'draft',
        '{}'::jsonb, array['company_search', 'risk_check']::text[], huoke_mapping_version_id,
        actor_id, actor_id
      )
      on conflict on constraint source_connections_workspace_name_key do nothing
      returning id into initialized_huoke_connection_id;

      if initialized_huoke_connection_id is null then
        select sc.id into initialized_huoke_connection_id
        from public.source_connections sc
        where sc.workspace_id = initialized_workspace_id
          and sc.name = '获客助手（系统）'
          and sc.provider = 'huoke_assistant';
      end if;

      insert into public.source_connections (
        workspace_id, provider, name, connection_kind, status,
        connection_config, capabilities, created_by, updated_by
      ) values (
        initialized_workspace_id, 'file_upload', '文件上传（系统）', 'upload', 'ready',
        '{}'::jsonb, array['file_import']::text[], actor_id, actor_id
      )
      on conflict on constraint source_connections_workspace_name_key do nothing
      returning id into initialized_file_connection_id;

      if initialized_file_connection_id is null then
        select sc.id into initialized_file_connection_id
        from public.source_connections sc
        where sc.workspace_id = initialized_workspace_id
          and sc.name = '文件上传（系统）'
          and sc.provider = 'file_upload';
      end if;

      insert into public.source_connections (
        workspace_id, provider, name, connection_kind, status,
        connection_config, capabilities, created_by, updated_by
      ) values (
        initialized_workspace_id,
        'web_search',
        '腾讯云联网搜索（系统）',
        'web_search',
        'draft',
        jsonb_build_object(
          'endpoint', 'https://api.wsa.cloud.tencent.com/SearchPro'
        ),
        array['web_evidence']::text[],
        actor_id,
        actor_id
      )
      on conflict on constraint source_connections_workspace_name_key do nothing
      returning id into initialized_web_connection_id;

      if initialized_web_connection_id is null then
        select sc.id into initialized_web_connection_id
        from public.source_connections sc
        where sc.workspace_id = initialized_workspace_id
          and sc.name = '腾讯云联网搜索（系统）'
          and sc.provider = 'web_search';
      end if;

      if initialized_qcc_connection_id is null
         or initialized_huoke_connection_id is null
         or initialized_file_connection_id is null
         or initialized_web_connection_id is null then
        raise exception using errcode = '23505', message = 'reserved system connection name is already in use';
      end if;

      insert into public.rule_sets (
        workspace_id, name, description, business_objective, status,
        current_version_number, created_by
      ) values (
        initialized_workspace_id,
        '默认名单规则',
        '可编辑的 RuleTemplate v1 空模板。',
        '由用户按行业场景配置准入、优先级与风险规则。',
        'draft',
        1,
        actor_id
      )
      on conflict on constraint rule_sets_workspace_name_key do nothing
      returning id into initialized_rule_set_id;

      if initialized_rule_set_id is null then
        select rs.id into initialized_rule_set_id
        from public.rule_sets rs
        where rs.workspace_id = initialized_workspace_id
          and rs.name = '默认名单规则';
      end if;

      insert into public.rule_set_versions (
        workspace_id, rule_set_id, version_number, status,
        rule_definition, scoring_definition, canonical_schema_version,
        change_note, created_by
      ) values (
        initialized_workspace_id,
        initialized_rule_set_id,
        1,
        'draft',
        jsonb_build_object(
          'id', 'default-lead-rules-v1',
          'name', '默认名单规则',
          'rules', '[]'::jsonb,
          'thresholds', jsonb_build_object(
            'p1', 75,
            'p2', 50,
            'minimumCompleteness', 60
          )
        ),
        '{}'::jsonb,
        '1.0',
        '初始化可编辑空模板。',
        actor_id
      )
      on conflict on constraint rule_set_versions_set_version_key do nothing;

      return query select
        initialized_workspace_id,
        initialized_created,
        initialized_qcc_connection_id,
        initialized_huoke_connection_id,
        initialized_file_connection_id,
        initialized_rule_set_id;
    end;
    $$;

revoke all on function public.initialize_workbench_workspace(text, text) from public, anon;
grant execute on function public.initialize_workbench_workspace(text, text) to authenticated, service_role;
