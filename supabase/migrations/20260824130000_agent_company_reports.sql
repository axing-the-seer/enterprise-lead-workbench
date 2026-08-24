begin;

create table public.company_reports (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    company_id bigint not null,
    evidence_job_id uuid not null,
    source_snapshot_id uuid not null,
    revision integer not null,
    status text not null default 'completed',
    schema_version text not null default 'company-agent-analysis.v1',
    agent_provider text not null,
    agent_name text not null,
    analysis jsonb not null,
    is_current boolean not null default true,
    submitted_by uuid,
    submitted_at timestamp with time zone not null default now(),
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    constraint company_reports_workspace_id_id_key unique (workspace_id, id),
    constraint company_reports_job_revision_key unique (workspace_id, evidence_job_id, revision),
    constraint company_reports_revision_positive check (revision > 0),
    constraint company_reports_status_check check (status in ('completed', 'superseded')),
    constraint company_reports_schema_check check (schema_version = 'company-agent-analysis.v1'),
    constraint company_reports_agent_provider_check check (length(agent_provider) between 2 and 64 and agent_provider ~ '^[a-z0-9][a-z0-9._-]*$'),
    constraint company_reports_agent_name_check check (length(btrim(agent_name)) between 1 and 120 and agent_name !~ '[[:cntrl:]]'),
    constraint company_reports_analysis_object check (jsonb_typeof(analysis) = 'object'),
    constraint company_reports_analysis_size check (octet_length(analysis::text) <= 131072),
    constraint company_reports_workspace_fkey foreign key (workspace_id) references public.workspaces(id) on delete restrict,
    constraint company_reports_company_fkey foreign key (workspace_id, company_id) references public.companies(workspace_id, id) on delete restrict,
    constraint company_reports_job_fkey foreign key (workspace_id, evidence_job_id) references public.ingestion_jobs(workspace_id, id) on delete restrict,
    constraint company_reports_snapshot_fkey foreign key (workspace_id, source_snapshot_id) references public.source_snapshots(workspace_id, id) on delete restrict,
    constraint company_reports_submitted_by_fkey foreign key (submitted_by) references auth.users(id) on delete set null
);

create unique index company_reports_one_current_job_idx on public.company_reports (workspace_id, evidence_job_id) where is_current;
create index company_reports_company_recent_idx on public.company_reports (workspace_id, company_id, submitted_at desc);
create index company_reports_workspace_status_idx on public.company_reports (workspace_id, status, submitted_at desc);

alter table public.company_reports enable row level security;
create policy "Members can read company reports" on public.company_reports for select to authenticated
  using (private.is_workspace_member(workspace_id));

revoke all on table public.company_reports from anon, authenticated;
grant select on table public.company_reports to authenticated;
grant all on table public.company_reports to service_role;

do $migration$
declare
  function_sql text;
begin
  select pg_get_functiondef(
    'public.persist_workbench_web_evidence(uuid,bigint,text,jsonb,text,timestamptz,jsonb,text,jsonb)'::regprocedure
  ) into function_sql;
  function_sql := replace(function_sql, $$'tencent_wsa'$$, $$'ego_lite'$$);
  execute function_sql;
end;
$migration$;

update public.company_evidence
set source_provider = 'ego_lite'
where source_provider = 'tencent_wsa'
  and metadata ->> 'version' like 'ego-lite-%';

create or replace function public.submit_company_report_analysis(
  p_workspace_id uuid,
  p_evidence_job_id uuid,
  p_agent_provider text,
  p_agent_name text,
  p_analysis jsonb
) returns table(report_id uuid, company_id bigint, revision integer, submitted_at timestamp with time zone)
language plpgsql security definer set search_path = '' as $$
declare
  job_record public.ingestion_jobs%rowtype;
  resolved_company_id bigint;
  resolved_snapshot_id uuid;
  next_revision integer;
  inserted_report public.company_reports%rowtype;
begin
  if auth.uid() is null or not private.can_write_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'workspace write access is required';
  end if;
  if p_agent_provider is null or length(p_agent_provider) not between 2 and 64 or p_agent_provider !~ '^[a-z0-9][a-z0-9._-]*$' then
    raise exception using errcode = '22023', message = 'agent provider is invalid';
  end if;
  if p_agent_name is null or length(btrim(p_agent_name)) not between 1 and 120 or p_agent_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'agent name is invalid';
  end if;
  if jsonb_typeof(p_analysis) is distinct from 'object' or p_analysis ->> 'schemaVersion' is distinct from 'company-agent-analysis.v1' or octet_length(p_analysis::text) > 131072 then
    raise exception using errcode = '22023', message = 'agent analysis payload is invalid';
  end if;
  select ij.* into job_record from public.ingestion_jobs ij
  where ij.workspace_id = p_workspace_id and ij.id = p_evidence_job_id
    and ij.status in ('completed', 'partial')
    and ij.input_params ->> 'query_kind' = 'web_evidence'
    and ij.input_params -> 'criteria' ->> 'claimType' = 'public_report'
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'completed evidence job was not found'; end if;
  begin
    resolved_company_id := (job_record.result ->> 'company_id')::bigint;
    resolved_snapshot_id := (job_record.result ->> 'source_snapshot_id')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'evidence job result is incomplete';
  end;
  if resolved_company_id is null or resolved_snapshot_id is null then
    raise exception using errcode = '22023', message = 'evidence job result is incomplete';
  end if;
  update public.company_reports set is_current = false, status = 'superseded', updated_at = now()
  where workspace_id = p_workspace_id and evidence_job_id = p_evidence_job_id and is_current = true;
  select coalesce(max(cr.revision), 0) + 1 into next_revision from public.company_reports cr
  where cr.workspace_id = p_workspace_id and cr.evidence_job_id = p_evidence_job_id;
  insert into public.company_reports (workspace_id, company_id, evidence_job_id, source_snapshot_id, revision, status, schema_version, agent_provider, agent_name, analysis, is_current, submitted_by)
  values (p_workspace_id, resolved_company_id, p_evidence_job_id, resolved_snapshot_id, next_revision, 'completed', 'company-agent-analysis.v1', p_agent_provider, btrim(p_agent_name), p_analysis, true, auth.uid())
  returning * into inserted_report;
  insert into public.audit_logs (workspace_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, request_id, metadata)
  values (p_workspace_id, 'agent', auth.uid(), btrim(p_agent_name), 'company_report.analysis_submitted', 'company_report', inserted_report.id::text, p_evidence_job_id::text,
    jsonb_build_object('agent_provider', p_agent_provider, 'company_id', resolved_company_id, 'revision', next_revision));
  return query select inserted_report.id, inserted_report.company_id, inserted_report.revision, inserted_report.submitted_at;
end;
$$;

revoke all on function public.submit_company_report_analysis(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.submit_company_report_analysis(uuid, uuid, text, text, jsonb) to authenticated, service_role;

commit;
