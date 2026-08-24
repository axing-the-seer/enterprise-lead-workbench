begin;

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
  evidence_payload jsonb;
  available_evidence_ids text[];
  cited_evidence_ids text[];
  next_revision integer;
  inserted_report public.company_reports%rowtype;
begin
  if auth.uid() is null or not private.can_write_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'workspace write access is required';
  end if;
  if p_agent_provider is null
     or length(p_agent_provider) not between 2 and 64
     or p_agent_provider !~ '^[a-z0-9][a-z0-9._-]*$' then
    raise exception using errcode = '22023', message = 'agent provider is invalid';
  end if;
  if p_agent_name is null
     or length(btrim(p_agent_name)) not between 1 and 120
     or p_agent_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'agent name is invalid';
  end if;
  if jsonb_typeof(p_analysis) is distinct from 'object'
     or p_analysis ->> 'schemaVersion' is distinct from 'company-agent-analysis.v1'
     or octet_length(p_analysis::text) > 131072 then
    raise exception using errcode = '22023', message = 'agent analysis payload is invalid';
  end if;

  select ij.* into job_record
  from public.ingestion_jobs ij
  where ij.workspace_id = p_workspace_id
    and ij.id = p_evidence_job_id
    and ij.status in ('completed', 'partial')
    and ij.input_params ->> 'query_kind' = 'web_evidence'
    and ij.input_params -> 'criteria' ->> 'claimType' = 'public_report'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'completed evidence job was not found';
  end if;

  begin
    resolved_company_id := (job_record.result ->> 'company_id')::bigint;
    resolved_snapshot_id := (job_record.result ->> 'source_snapshot_id')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'evidence job result is incomplete';
  end;
  if resolved_company_id is null or resolved_snapshot_id is null then
    raise exception using errcode = '22023', message = 'evidence job result is incomplete';
  end if;

  select ss.normalized_payload into evidence_payload
  from public.source_snapshots ss
  join public.source_records sr
    on sr.workspace_id = ss.workspace_id
   and sr.id = ss.source_record_id
  where ss.workspace_id = p_workspace_id
    and ss.id = resolved_snapshot_id
    and ss.company_id = resolved_company_id
    and sr.ingestion_job_id = p_evidence_job_id;
  if not found then
    raise exception using errcode = '22023', message = 'evidence job result is incomplete';
  end if;

  select coalesce(array_agg(candidate.evidence_id order by candidate.ordinality), array[]::text[])
  into available_evidence_ids
  from (
    select item.ordinality,
      case
        when item.value ->> 'id' ~ '^ev-[0-9]{3}$' then item.value ->> 'id'
        else 'ev-' || lpad(item.ordinality::text, 3, '0')
      end as evidence_id
    from jsonb_array_elements(
      case
        when jsonb_typeof(evidence_payload -> 'evidence') = 'array'
          then evidence_payload -> 'evidence'
        else '[]'::jsonb
      end
    ) with ordinality as item(value, ordinality)
    where item.ordinality <= 50
      and jsonb_typeof(item.value) = 'object'
      and coalesce(item.value ->> 'title', '') <> ''
      and coalesce(item.value ->> 'url', '') ~* '^https?://'
  ) candidate;

  if jsonb_typeof(p_analysis -> 'executiveEvidenceIds') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'agent analysis evidence references are invalid';
  end if;
  if jsonb_array_length(p_analysis -> 'executiveEvidenceIds') = 0 then
    raise exception using errcode = '22023', message = 'agent analysis evidence references are invalid';
  end if;
  select coalesce(array_agg(distinct reference.value #>> '{}'), array[]::text[])
  into cited_evidence_ids
  from jsonb_path_query(p_analysis, '$.**.evidenceIds[*]') as reference(value);
  if cardinality(cited_evidence_ids) = 0
     or exists (
       select 1
       from unnest(cited_evidence_ids) cited_id
       where cited_id !~ '^ev-[0-9]{3}$'
          or not (cited_id = any(available_evidence_ids))
     ) then
    raise exception using errcode = '22023', message = 'agent analysis evidence references are invalid';
  end if;

  update public.company_reports
  set is_current = false, status = 'superseded', updated_at = now()
  where workspace_id = p_workspace_id
    and evidence_job_id = p_evidence_job_id
    and is_current = true;

  select coalesce(max(cr.revision), 0) + 1 into next_revision
  from public.company_reports cr
  where cr.workspace_id = p_workspace_id
    and cr.evidence_job_id = p_evidence_job_id;

  insert into public.company_reports (
    workspace_id, company_id, evidence_job_id, source_snapshot_id, revision,
    status, schema_version, agent_provider, agent_name, analysis, is_current,
    submitted_by
  ) values (
    p_workspace_id, resolved_company_id, p_evidence_job_id,
    resolved_snapshot_id, next_revision, 'completed',
    'company-agent-analysis.v1', p_agent_provider, btrim(p_agent_name),
    p_analysis, true, auth.uid()
  ) returning * into inserted_report;

  insert into public.audit_logs (
    workspace_id, actor_type, actor_user_id, actor_label, action,
    entity_type, entity_id, request_id, metadata
  ) values (
    p_workspace_id, 'user', auth.uid(), null,
    'company_report.analysis_submitted', 'company_report',
    inserted_report.id::text, p_evidence_job_id::text,
    jsonb_build_object(
      'submission_channel', 'authenticated_rpc',
      'claimed_agent_provider', p_agent_provider,
      'claimed_agent_name', btrim(p_agent_name),
      'company_id', resolved_company_id,
      'revision', next_revision
    )
  );

  return query select inserted_report.id, inserted_report.company_id,
    inserted_report.revision, inserted_report.submitted_at;
end;
$$;

revoke all on function public.submit_company_report_analysis(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.submit_company_report_analysis(uuid, uuid, text, text, jsonb) to authenticated, service_role;

commit;
