-- Prevent worker crashes from leaving jobs permanently stuck in `running`.
-- Active workers renew a five-minute lease. Expired jobs fail closed and must
-- be retried explicitly so paid provider calls are never repeated silently.

create or replace function public.expire_stale_workbench_jobs(p_actor_label text)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_actor_label text := btrim(p_actor_label);
  expired_count integer := 0;
  expired_job record;
begin
  if normalized_actor_label is null
     or length(normalized_actor_label) not between 3 and 200 then
    raise exception using errcode = '22023', message = 'invalid worker id';
  end if;

  for expired_job in
    update public.ingestion_jobs ij
    set status = 'failed',
        completed_at = now(),
        error_code = 'JOB_LEASE_EXPIRED',
        error_message = '执行器中断，任务已安全停止；请确认调用记录后手动重试。'
    where ij.status = 'running'
      and coalesce(ij.claimed_at, ij.started_at, ij.requested_at)
          < now() - interval '5 minutes'
    returning ij.id, ij.workspace_id, ij.source_query_id, ij.worker_id
  loop
    expired_count := expired_count + 1;
    if expired_job.source_query_id is not null then
      update public.source_queries sq
      set status = 'failed'
      where sq.workspace_id = expired_job.workspace_id
        and sq.id = expired_job.source_query_id
        and sq.status = 'running';
    end if;
    insert into public.audit_logs (
      workspace_id, actor_type, actor_label, action,
      entity_type, entity_id, metadata
    ) values (
      expired_job.workspace_id, 'service', normalized_actor_label,
      'workbench.job.lease_expired', 'ingestion_job', expired_job.id::text,
      jsonb_build_object('previous_worker_id', expired_job.worker_id)
    );
  end loop;

  for expired_job in
    update public.rule_runs rr
    set status = 'failed',
        completed_at = now(),
        error_code = 'JOB_LEASE_EXPIRED',
        error_message = '执行器中断，任务已安全停止；请手动重试。'
    where rr.status = 'running'
      and coalesce(rr.claimed_at, rr.started_at, rr.requested_at)
          < now() - interval '5 minutes'
    returning rr.id, rr.workspace_id, rr.worker_id
  loop
    expired_count := expired_count + 1;
    insert into public.audit_logs (
      workspace_id, actor_type, actor_label, action,
      entity_type, entity_id, metadata
    ) values (
      expired_job.workspace_id, 'service', normalized_actor_label,
      'workbench.job.lease_expired', 'rule_run', expired_job.id::text,
      jsonb_build_object('previous_worker_id', expired_job.worker_id)
    );
  end loop;

  for expired_job in
    update public.exports e
    set status = 'failed',
        completed_at = now(),
        error_code = 'JOB_LEASE_EXPIRED',
        error_message = '执行器中断，任务已安全停止；请手动重试。'
    where e.status = 'running'
      and coalesce(e.claimed_at, e.requested_at)
          < now() - interval '5 minutes'
    returning e.id, e.workspace_id, e.worker_id
  loop
    expired_count := expired_count + 1;
    insert into public.audit_logs (
      workspace_id, actor_type, actor_label, action,
      entity_type, entity_id, metadata
    ) values (
      expired_job.workspace_id, 'service', normalized_actor_label,
      'workbench.job.lease_expired', 'export', expired_job.id::text,
      jsonb_build_object('previous_worker_id', expired_job.worker_id)
    );
  end loop;

  return expired_count;
end;
$function$;

create or replace function public.renew_workbench_job_lease(
  p_job_type text,
  p_job_id uuid,
  p_worker_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_job_type text := lower(btrim(p_job_type));
  normalized_worker_id text := btrim(p_worker_id);
  renewed_count integer := 0;
begin
  if normalized_worker_id is null
     or length(normalized_worker_id) not between 3 and 200 then
    raise exception using errcode = '22023', message = 'invalid worker id';
  end if;

  if normalized_job_type = 'ingestion_job' then
    update public.ingestion_jobs ij
    set claimed_at = now()
    where ij.id = p_job_id
      and ij.status = 'running'
      and ij.worker_id = normalized_worker_id;
  elsif normalized_job_type = 'rule_run' then
    update public.rule_runs rr
    set claimed_at = now()
    where rr.id = p_job_id
      and rr.status = 'running'
      and rr.worker_id = normalized_worker_id;
  elsif normalized_job_type = 'export' then
    update public.exports e
    set claimed_at = now()
    where e.id = p_job_id
      and e.status = 'running'
      and e.worker_id = normalized_worker_id;
  else
    raise exception using errcode = '22023', message = 'unsupported job type';
  end if;

  get diagnostics renewed_count = row_count;
  return renewed_count = 1;
end;
$function$;

create or replace function public.complete_workbench_job_guarded(
  p_job_type text,
  p_job_id uuid,
  p_worker_id text,
  p_status text,
  p_result jsonb,
  p_error_code text,
  p_error_message text
)
returns table(job_type text, job_id uuid, workspace_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_job_type text := lower(btrim(p_job_type));
  normalized_worker_id text := btrim(p_worker_id);
  lease_is_active boolean := false;
begin
  if normalized_worker_id is null
     or length(normalized_worker_id) not between 3 and 200 then
    raise exception using errcode = '22023', message = 'invalid worker id';
  end if;

  if normalized_job_type = 'ingestion_job' then
    select true into lease_is_active
    from public.ingestion_jobs ij
    where ij.id = p_job_id
      and ij.status = 'running'
      and ij.worker_id = normalized_worker_id
    for update;
  elsif normalized_job_type = 'rule_run' then
    select true into lease_is_active
    from public.rule_runs rr
    where rr.id = p_job_id
      and rr.status = 'running'
      and rr.worker_id = normalized_worker_id
    for update;
  elsif normalized_job_type = 'export' then
    select true into lease_is_active
    from public.exports e
    where e.id = p_job_id
      and e.status = 'running'
      and e.worker_id = normalized_worker_id
    for update;
  else
    raise exception using errcode = '22023', message = 'unsupported job type';
  end if;

  if not coalesce(lease_is_active, false) then
    raise exception using errcode = '55000', message = 'job lease is not active for this worker';
  end if;

  return query
  select *
  from public.complete_workbench_job(
    normalized_job_type,
    p_job_id,
    p_status,
    p_result,
    p_error_code,
    p_error_message
  );
end;
$function$;

-- Claiming also performs bounded stale-job cleanup. The helper remains private.
create or replace function public.claim_next_workbench_job(p_worker_id text)
returns table(job_type text, job_id uuid, workspace_id uuid, payload jsonb)
language plpgsql
security definer
set search_path = ''
as $function$
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

  perform public.expire_stale_workbench_jobs(normalized_worker_id);

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
        attempt_count = ij.attempt_count + 1,
        error_code = null,
        error_message = null,
        completed_at = null
    where ij.id = selected_id
      and ij.status = 'queued'
    returning ij.workspace_id,
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
        attempt_count = rr.attempt_count + 1,
        error_code = null,
        error_message = null,
        completed_at = null
    where rr.id = selected_id
      and rr.status = 'queued'
    returning rr.workspace_id,
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
        attempt_count = e.attempt_count + 1,
        error_code = null,
        error_message = null,
        completed_at = null
    where e.id = selected_id
      and e.status = 'queued'
    returning e.workspace_id,
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
    workspace_id, actor_type, actor_label, action,
    entity_type, entity_id, metadata
  ) values (
    selected_workspace_id, 'service', normalized_worker_id,
    'workbench.job.claimed', selected_type, selected_id::text,
    jsonb_build_object('worker_id', normalized_worker_id)
  );

  return query
  select selected_type, selected_id, selected_workspace_id, selected_payload;
end;
$function$;

revoke all on function public.expire_stale_workbench_jobs(text)
  from public, anon, authenticated, service_role;
revoke all on function public.renew_workbench_job_lease(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.complete_workbench_job_guarded(text, uuid, text, text, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.complete_workbench_job(text, uuid, text, jsonb, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.renew_workbench_job_lease(text, uuid, text)
  to service_role;
grant execute on function public.complete_workbench_job_guarded(text, uuid, text, text, jsonb, text, text)
  to service_role;

comment on function public.expire_stale_workbench_jobs(text) is
  'Private lease cleanup called by the trusted claim RPC; expired paid-provider work is failed, never silently retried.';
comment on function public.renew_workbench_job_lease(text, uuid, text) is
  'Trusted worker heartbeat; renews only the currently assigned running job.';
comment on function public.complete_workbench_job_guarded(text, uuid, text, text, jsonb, text, text) is
  'Trusted completion entry point; rejects workers that no longer own the active job lease.';
