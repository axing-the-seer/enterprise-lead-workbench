begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_function(
  'public',
  'submit_company_report_analysis',
  array['uuid', 'uuid', 'text', 'text', 'jsonb'],
  'company report submission RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.submit_company_report_analysis(uuid,uuid,text,text,jsonb)',
    'EXECUTE'
  ),
  'anonymous callers cannot submit company reports'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.submit_company_report_analysis(uuid,uuid,text,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated workspace writers can submit through the guarded RPC'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000081',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'report-owner@example.test', '', now(),
  '{"workbench_provisioning":"administrator"}'::jsonb,
  '{}'::jsonb, now(), now()
);

insert into public.workspaces (id, name, slug, owner_user_id) values (
  '18000000-0000-0000-0000-000000000001',
  'Report Security Workspace',
  'report-security-workspace',
  '00000000-0000-0000-0000-000000000081'
);

insert into public.companies (
  id, workspace_id, name, unified_social_credit_code
) values (
  801,
  '18000000-0000-0000-0000-000000000001',
  '报告安全测试企业',
  '91110000000000801A'
);

insert into public.source_connections (
  id, workspace_id, provider, name, connection_kind, status,
  connection_config, capabilities, created_by, updated_by
) values (
  '28000000-0000-0000-0000-000000000001',
  '18000000-0000-0000-0000-000000000001',
  'web_search', 'Ego Lite 测试连接', 'other', 'ready',
  '{"engine":"ego_lite"}'::jsonb, array['web_evidence']::text[],
  '00000000-0000-0000-0000-000000000081',
  '00000000-0000-0000-0000-000000000081'
);

insert into public.ingestion_jobs (
  id, workspace_id, source_connection_id, job_kind, status,
  idempotency_key, input_params, result, requested_by,
  started_at, completed_at, worker_id
) values (
  '38000000-0000-0000-0000-000000000001',
  '18000000-0000-0000-0000-000000000001',
  '28000000-0000-0000-0000-000000000001',
  'enrich', 'completed', 'report-security-job-0001',
  '{"query_kind":"web_evidence","criteria":{"claimType":"public_report"}}'::jsonb,
  '{"company_id":801,"source_snapshot_id":"58000000-0000-0000-0000-000000000001"}'::jsonb,
  '00000000-0000-0000-0000-000000000081', now(), now(), 'report-test-worker'
);

insert into public.source_records (
  id, workspace_id, ingestion_job_id, source_connection_id,
  source_record_key, record_kind, raw_payload, content_hash
) values (
  '48000000-0000-0000-0000-000000000001',
  '18000000-0000-0000-0000-000000000001',
  '38000000-0000-0000-0000-000000000001',
  '28000000-0000-0000-0000-000000000001',
  'report-security-source-0001', 'web_evidence', '{}'::jsonb, repeat('a', 64)
);

insert into public.source_snapshots (
  id, workspace_id, source_record_id, company_id,
  normalized_payload, content_hash, match_status
) values (
  '58000000-0000-0000-0000-000000000001',
  '18000000-0000-0000-0000-000000000001',
  '48000000-0000-0000-0000-000000000001', 801,
  '{"evidence":[
    {"id":"ev-001","title":"企业官网","url":"https://example.com/company"},
    {"title":"招聘信息","url":"https://example.com/jobs"},
    {"id":"ev-999","title":"无效链接协议","url":"file:///private/data"}
  ]}'::jsonb,
  repeat('b', 64), 'matched'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000081', true);

select lives_ok(
  $$
    select * from public.submit_company_report_analysis(
      '18000000-0000-0000-0000-000000000001',
      '38000000-0000-0000-0000-000000000001',
      'workbuddy',
      'WorkBuddy 测试 Agent',
      '{
        "schemaVersion":"company-agent-analysis.v1",
        "executiveSummary":"基于公开资料形成的测试结论。",
        "executiveEvidenceIds":["ev-001"],
        "businessProfile":[{"evidenceIds":["ev-002"]}]
      }'::jsonb
    )
  $$,
  'valid evidence references can be submitted'
);

reset role;

select is(
  (
    select submitted_by::text
    from public.company_reports
    where evidence_job_id = '38000000-0000-0000-0000-000000000001'
      and is_current
  ),
  '00000000-0000-0000-0000-000000000081',
  'report records the authenticated submitting user'
);

select is(
  (
    select actor_type || '|' || actor_user_id::text || '|' || coalesce(actor_label, '')
    from public.audit_logs
    where action = 'company_report.analysis_submitted'
      and request_id = '38000000-0000-0000-0000-000000000001'
  ),
  'user|00000000-0000-0000-0000-000000000081|',
  'audit identity cannot be forged as an agent by an authenticated client'
);

select is(
  (
    select metadata ->> 'claimed_agent_provider'
    from public.audit_logs
    where action = 'company_report.analysis_submitted'
      and request_id = '38000000-0000-0000-0000-000000000001'
  ),
  'workbuddy',
  'claimed agent provider remains non-authoritative audit metadata'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000081', true);

select throws_ok(
  $$
    select * from public.submit_company_report_analysis(
      '18000000-0000-0000-0000-000000000001',
      '38000000-0000-0000-0000-000000000001',
      'workbuddy',
      '伪造引用测试',
      '{"schemaVersion":"company-agent-analysis.v1","executiveEvidenceIds":["ev-999"]}'::jsonb
    )
  $$,
  '22023',
  'agent analysis evidence references are invalid',
  'RPC rejects an evidence id that is not usable in the current evidence task'
);

select throws_ok(
  $$
    select * from public.submit_company_report_analysis(
      '18000000-0000-0000-0000-000000000001',
      '38000000-0000-0000-0000-000000000001',
      'workbuddy',
      '空引用测试',
      '{"schemaVersion":"company-agent-analysis.v1","executiveEvidenceIds":[]}'::jsonb
    )
  $$,
  '22023',
  'agent analysis evidence references are invalid',
  'RPC rejects an empty evidence citation set'
);

select * from finish();
rollback;
