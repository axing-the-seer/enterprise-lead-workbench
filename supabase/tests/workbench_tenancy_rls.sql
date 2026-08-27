begin;

create extension if not exists pgtap with schema extensions;

select plan(69);

select has_table('public', 'workspaces', 'workspaces table exists');
select has_table('public', 'source_connections', 'source connections table exists');
select has_table('public', 'companies', 'canonical companies table exists');
select has_table('public', 'rule_runs', 'rule runs table exists');
select has_table('public', 'audit_logs', 'audit log table exists');
select has_column('public', 'companies', 'paid_in_capital_amount', 'QCC paid-in capital is retained canonically');
select has_column('public', 'companies', 'personnel_scale_text', 'QCC personnel scale source text is retained');
select has_column('public', 'companies', 'region_text', 'QCC source region text is retained');
select has_function(
  'public',
  'enqueue_workbench_job',
  array['uuid', 'text', 'jsonb', 'text'],
  'controlled enqueue RPC exists'
);

select has_function(
  'public',
  'claim_next_workbench_job',
  array['text'],
  'worker claim RPC exists'
);

select has_function(
  'public',
  'complete_workbench_job_guarded',
  array['text', 'uuid', 'text', 'text', 'jsonb', 'text', 'text'],
  'lease-guarded worker completion RPC exists'
);

select has_function(
  'public',
  'persist_workbench_ingestion_record',
  array['uuid', 'text', 'text', 'jsonb', 'text', 'timestamp with time zone', 'jsonb', 'text', 'jsonb'],
  'atomic ingestion persistence RPC exists'
);

select ok(
  not has_function_privilege('authenticated', 'public.claim_next_workbench_job(text)', 'EXECUTE'),
  'authenticated clients cannot claim worker jobs'
);

select ok(
  has_function_privilege('service_role', 'public.claim_next_workbench_job(text)', 'EXECUTE'),
  'service role can claim worker jobs'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.persist_workbench_ingestion_record(uuid,text,text,jsonb,text,timestamp with time zone,jsonb,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot call atomic ingestion persistence'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.persist_workbench_ingestion_record(uuid,text,text,jsonb,text,timestamp with time zone,jsonb,text,jsonb)',
    'EXECUTE'
  ),
  'service role can persist normalized ingestion records'
);

select ok(
  not has_column_privilege('authenticated', 'public.source_connections', 'secret_reference', 'SELECT'),
  'authenticated clients cannot read secret references'
);

select ok(
  not has_table_privilege('anon', 'public.companies', 'SELECT'),
  'anonymous users have no access to canonical companies'
);

select ok(
  not has_table_privilege('authenticated', 'public.contacts', 'SELECT'),
  'unused legacy contacts are not exposed to authenticated users'
);

select ok(
  not has_table_privilege('authenticated', 'public.deals', 'INSERT'),
  'unused legacy deals cannot be written by authenticated users'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'Attachments 1mt4rzk_0',
        'Attachments 1mt4rzk_1',
        'Attachments 1mt4rzk_3'
      )
  ),
  0,
  'tenant-blind legacy attachment policies are removed'
);

select ok(
  not has_table_privilege('authenticated', 'public.favicons_excluded_domains', 'SELECT'),
  'unused legacy favicon registry is service-role-only'
);

select ok(
  not has_table_privilege('anon', 'public.configuration', 'SELECT'),
  'anonymous users cannot read application configuration'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'workspace_id'
      and table_name = any(array[
        'workspace_members', 'companies', 'field_mapping_sets',
        'field_mapping_versions', 'source_connections', 'source_queries',
        'ingestion_jobs', 'source_records', 'source_snapshots',
        'company_identifiers', 'company_evidence', 'company_field_facts',
        'risk_events', 'qualifications', 'company_lists',
        'company_list_members', 'rule_sets', 'rule_set_versions',
        'rule_runs', 'rule_results', 'manual_reviews', 'exports',
        'audit_logs'
      ])
  ),
  23,
  'every tenant-owned production table has workspace_id'
);

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relrowsecurity
      and c.relname = any(array[
        'workspace_members', 'companies', 'field_mapping_sets',
        'field_mapping_versions', 'source_connections', 'source_queries',
        'ingestion_jobs', 'source_records', 'source_snapshots',
        'company_identifiers', 'company_evidence', 'company_field_facts',
        'risk_events', 'qualifications', 'company_lists',
        'company_list_members', 'rule_sets', 'rule_set_versions',
        'rule_runs', 'rule_results', 'manual_reviews', 'exports',
        'audit_logs'
      ])
  ),
  23,
  'RLS is enabled on every tenant-owned production table'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@example.test', '', now(), '{"workbench_provisioning":"administrator"}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@example.test', '', now(), '{"workbench_provisioning":"administrator"}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor-a@example.test', '', now(), '{"workbench_provisioning":"administrator"}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer-a@example.test', '', now(), '{"workbench_provisioning":"administrator"}'::jsonb, '{}'::jsonb, now(), now());

insert into public.workspaces (id, name, slug, owner_user_id) values
  ('10000000-0000-0000-0000-000000000001', 'Workspace A', 'workspace-a', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', 'Workspace B', 'workspace-b', '00000000-0000-0000-0000-000000000002');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'editor', 'active', now()),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'viewer', 'active', now());

insert into public.companies (id, workspace_id, name, unified_social_credit_code) values
  (101, '10000000-0000-0000-0000-000000000001', '企业 A', '91110000000000001A'),
  (201, '10000000-0000-0000-0000-000000000002', '企业 B', '91110000000000002B');

insert into public.company_lists (id, workspace_id, name, created_by) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '名单 A', '00000000-0000-0000-0000-000000000001');

insert into public.source_connections (
  id, workspace_id, provider, name, connection_kind, status,
  secret_reference, created_by
) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'qcc', '企查查', 'mcp', 'ready', 'vault://qcc/production',
  '00000000-0000-0000-0000-000000000001'
);

select is(
  (
    select role
    from public.workspace_members
    where workspace_id = '10000000-0000-0000-0000-000000000001'
      and user_id = '00000000-0000-0000-0000-000000000001'
  ),
  'owner',
  'workspace creation atomically creates owner membership'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::integer from public.workspaces),
  1,
  'owner only sees their workspace'
);
select is(
  (select count(*)::integer from public.companies),
  1,
  'company RLS hides another workspace'
);
select is(
  (select name from public.companies limit 1),
  '企业 A',
  'company visible through RLS is from the active workspace'
);

select throws_ok(
  $$
    insert into public.source_connections (
      workspace_id, provider, name, connection_kind, status,
      connection_config, created_by
    ) values (
      '10000000-0000-0000-0000-000000000001', 'qcc', '泄漏密钥', 'api', 'draft',
      '{"nested":{"api_key":"must-not-be-stored"}}'::jsonb,
      '00000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot bypass the controlled source-configuration RPC'
);

select throws_ok(
  $$
    insert into public.company_list_members (
      workspace_id, company_list_id, company_id, added_by
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      201,
      '00000000-0000-0000-0000-000000000001'
    )
  $$,
  '23503',
  null,
  'composite foreign keys reject cross-workspace references'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);

select throws_ok(
  $$
    select * from public.enqueue_workbench_job(
      '10000000-0000-0000-0000-000000000001',
      'test_connection',
      '{"source_connection_id":"20000000-0000-0000-0000-000000000001"}'::jsonb,
      'viewer-cannot-enqueue'
    )
  $$,
  '42501',
  'workspace editor role required',
  'viewer cannot enqueue a billable or mutating job'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

select lives_ok(
  $$
    select * from public.enqueue_workbench_job(
      '10000000-0000-0000-0000-000000000001',
      'test_connection',
      '{"source_connection_id":"20000000-0000-0000-0000-000000000001"}'::jsonb,
      'connection-test-1'
    )
  $$,
  'editor can enqueue a connection test'
);

select is(
  (
    select count(*)::integer
    from public.ingestion_jobs
    where workspace_id = '10000000-0000-0000-0000-000000000001'
      and idempotency_key = 'connection-test-1'
  ),
  1,
  'first enqueue creates exactly one ingestion job'
);

select lives_ok(
  $$
    select * from public.enqueue_workbench_job(
      '10000000-0000-0000-0000-000000000001',
      'test_connection',
      '{"source_connection_id":"20000000-0000-0000-0000-000000000001"}'::jsonb,
      'connection-test-1'
    )
  $$,
  'repeating the same idempotency key reuses the job'
);

select is(
  (
    select count(*)::integer
    from public.ingestion_jobs
    where workspace_id = '10000000-0000-0000-0000-000000000001'
      and idempotency_key = 'connection-test-1'
  ),
  1,
  'idempotent enqueue does not duplicate the job'
);

reset role;

insert into public.source_records (
  workspace_id,
  ingestion_job_id,
  source_connection_id,
  source_record_key,
  record_kind,
  raw_payload,
  content_hash
) values (
  '10000000-0000-0000-0000-000000000001',
  (
    select id
    from public.ingestion_jobs
    where idempotency_key = 'connection-test-1'
  ),
  '20000000-0000-0000-0000-000000000001',
  'raw-visibility-test',
  'company_registration',
  '{"contact":"cleartext stays restricted to editors"}'::jsonb,
  repeat('a', 64)
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);

select is(
  (select count(*)::integer from public.source_records),
  0,
  'viewer cannot read raw provider payloads'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

reset role;

select is(
  (select job_type from public.claim_next_workbench_job('pgtap-worker-1')),
  'ingestion_job',
  'worker atomically claims the queued ingestion job'
);

select is(
  (
    select status
    from public.complete_workbench_job_guarded(
      'ingestion_job',
      (
        select id
        from public.ingestion_jobs
        where idempotency_key = 'connection-test-1'
      ),
      'pgtap-worker-1',
      'completed',
      '{"received_count":0,"accepted_count":0,"rejected_count":0}'::jsonb,
      null,
      null
    )
  ),
  'completed',
  'worker completes the claimed job through the service RPC'
);

select is(
  (
    select status
    from public.ingestion_jobs
    where idempotency_key = 'connection-test-1'
  ),
  'completed',
  'completed job state is durable'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

select lives_ok(
  $$
    select * from public.enqueue_workbench_job(
      '10000000-0000-0000-0000-000000000001',
      'start_ingestion',
      '{
        "source_connection_id":"20000000-0000-0000-0000-000000000001",
        "job_kind":"query",
        "input_params":{
          "query_kind":"company_search",
          "query_text":"查找北京软件企业",
          "criteria":{"industry":"software","region":"Beijing"}
        }
      }'::jsonb,
      'source-query-smoke-1'
    )
  $$,
  'query ingestion atomically creates its source query'
);

select is(
  (
    select sq.query_kind || '|' || sq.query_text || '|' || sq.status
    from public.source_queries sq
    where sq.workspace_id = '10000000-0000-0000-0000-000000000001'
      and sq.idempotency_key like 'source-query:%'
  ),
  'company_search|查找北京软件企业|running',
  'source query preserves the user request and starts running'
);

select ok(
  (
    select sq.criteria_hash = encode(
      extensions.digest(sq.criteria::text, 'sha256'),
      'hex'
    )
    from public.source_queries sq
    where sq.workspace_id = '10000000-0000-0000-0000-000000000001'
      and sq.idempotency_key like 'source-query:%'
  ),
  'source query criteria hash is database-computed SHA-256 of stable jsonb text'
);

select ok(
  (
    select ij.source_query_id = sq.id
    from public.ingestion_jobs ij
    join public.source_queries sq
      on sq.workspace_id = ij.workspace_id
     and sq.id = ij.source_query_id
    where ij.workspace_id = '10000000-0000-0000-0000-000000000001'
      and ij.idempotency_key = 'source-query-smoke-1'
  ),
  'ingestion job references the atomically created source query'
);

select lives_ok(
  $$
    select * from public.enqueue_workbench_job(
      '10000000-0000-0000-0000-000000000001',
      'start_ingestion',
      '{
        "source_connection_id":"20000000-0000-0000-0000-000000000001",
        "job_kind":"query",
        "input_params":{
          "query_kind":"company_search",
          "query_text":"查找北京软件企业",
          "criteria":{"region":"Beijing","industry":"software"}
        }
      }'::jsonb,
      'source-query-smoke-1'
    )
  $$,
  'query enqueue can be retried with the same idempotency key'
);

select is(
  (
    select count(*)::integer
    from public.source_queries
    where workspace_id = '10000000-0000-0000-0000-000000000001'
      and idempotency_key like 'source-query:%'
  ),
  1,
  'query retry does not duplicate the source query'
);

reset role;

select is(
  (select job_type from public.claim_next_workbench_job('pgtap-worker-2')),
  'ingestion_job',
  'worker claims the queued query ingestion job'
);

select is(
  (
    select status
    from public.complete_workbench_job_guarded(
      'ingestion_job',
      (
        select id
        from public.ingestion_jobs
        where idempotency_key = 'source-query-smoke-1'
      ),
      'pgtap-worker-2',
      'partial',
      '{"received_count":2,"accepted_count":1,"rejected_count":1}'::jsonb,
      null,
      null
    )
  ),
  'partial',
  'worker can complete a query ingestion with partial results'
);

select is(
  (
    select status
    from public.source_queries
    where workspace_id = '10000000-0000-0000-0000-000000000001'
      and idempotency_key like 'source-query:%'
  ),
  'completed',
  'partial ingestion synchronizes its source query to completed'
);

insert into public.company_list_members (
  workspace_id,
  company_list_id,
  company_id,
  source_record_id,
  added_by
) values (
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  101,
  (
    select id
    from public.source_records
    where source_record_key = 'raw-visibility-test'
  ),
  '00000000-0000-0000-0000-000000000003'
);

insert into public.rule_sets (
  id, workspace_id, name, status, created_by
) values (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Manifest Test',
  'active',
  '00000000-0000-0000-0000-000000000003'
);

insert into public.rule_set_versions (
  id, workspace_id, rule_set_id, version_number, status,
  rule_definition, created_by
) values (
  '41000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  1,
  'published',
  '{}'::jsonb,
  '00000000-0000-0000-0000-000000000003'
);

select lives_ok(
  $$
    select * from public.enqueue_workbench_job(
      '10000000-0000-0000-0000-000000000001',
      'run_rules',
      '{
        "rule_version_id":"41000000-0000-0000-0000-000000000001",
        "company_list_id":"30000000-0000-0000-0000-000000000001",
        "run_mode":"full",
        "engine_version":"rules-v1",
        "input_manifest_hash":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
      }'::jsonb,
      'rule-manifest-test-1'
    )
  $$,
  'rule run can be enqueued for a non-empty list'
);

select ok(
  (
    select length(input_manifest_hash) = 64
      and input_manifest_hash <> repeat('f', 64)
    from public.rule_runs
    where idempotency_key = 'rule-manifest-test-1'
  ),
  'rule input manifest is computed by the database and ignores browser input'
);

select is(
  (
    select public
    from storage.buckets
    where id = 'workbench-imports'
  ),
  false,
  'workbench import bucket is private'
);

select is(
  (
    select file_size_limit
    from storage.buckets
    where id = 'workbench-imports'
  ),
  20971520::bigint,
  'workbench import bucket enforces a 20 MiB limit'
);

select is(
  (
    select public
    from storage.buckets
    where id = 'workbench-exports'
  ),
  false,
  'workbench export bucket is private'
);

select is(
  (
    select file_size_limit
    from storage.buckets
    where id = 'workbench-exports'
  ),
  52428800::bigint,
  'workbench export bucket enforces a 50 MiB limit'
);

update public.ingestion_jobs
set status = 'running',
    worker_id = 'dead-worker',
    claimed_at = now() - interval '10 minutes',
    started_at = now() - interval '10 minutes',
    completed_at = null,
    error_code = null,
    error_message = null
where idempotency_key = 'connection-test-1';

select count(*) from public.claim_next_workbench_job('lease-cleanup-worker');

select is(
  (
    select ij.status || ':' || ij.error_code
    from public.ingestion_jobs ij
    where ij.idempotency_key = 'connection-test-1'
  ),
  'failed:JOB_LEASE_EXPIRED',
  'claiming work safely expires a worker job whose heartbeat stopped'
);

select is(
  public.renew_workbench_job_lease(
    'ingestion_job',
    (select id from public.ingestion_jobs where idempotency_key = 'connection-test-1'),
    'dead-worker'
  ),
  false,
  'an expired worker cannot renew its former lease'
);

select throws_ok(
  $$
    select * from public.complete_workbench_job_guarded(
      'ingestion_job',
      (select id from public.ingestion_jobs where idempotency_key = 'connection-test-1'),
      'dead-worker',
      'completed',
      '{}'::jsonb,
      null,
      null
    )
  $$,
  '55000',
  'job lease is not active for this worker',
  'an expired worker cannot overwrite the final job state'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'Workspace members can read workbench imports',
        'Workspace members can upload own workbench imports',
        'Workspace admins can delete workbench imports'
      )
  ),
  3,
  'private import storage has read, upload and admin-delete policies'
);

reset role;

insert into public.company_lists (id, workspace_id, name, created_by) values
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '名单 B',
    '00000000-0000-0000-0000-000000000002'
  );

insert into public.company_list_members (
  workspace_id, company_list_id, company_id, added_by
) values (
  '10000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002',
  201,
  '00000000-0000-0000-0000-000000000002'
);

select has_view(
  'public',
  'company_lists_overview',
  'tenant-aware company list overview exists'
);

select has_view(
  'public',
  'company_list_entries',
  'tenant-aware company list entry view exists'
);

select has_function(
  'public',
  'search_company_list_ids',
  array['uuid', 'text', 'integer'],
  'server-side company list search exists'
);

select ok(
  not has_table_privilege('anon', 'public.company_lists_overview', 'SELECT'),
  'anonymous users cannot read company list overviews'
);

select ok(
  not has_table_privilege('anon', 'public.company_list_entries', 'SELECT'),
  'anonymous users cannot read company list entries'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::integer from public.company_lists_overview),
  1,
  'list overview hides another workspace'
);

select is(
  (
    select company_count::integer
    from public.company_lists_overview
    where id = '30000000-0000-0000-0000-000000000001'
  ),
  1,
  'list overview returns an accurate active company count'
);

select is(
  (select string_agg(name, ',') from public.company_list_entries),
  '企业 A',
  'list entry view returns only companies visible in the active workspace'
);

select is(
  (
    select count(*)::integer
    from public.search_company_list_ids(
      '10000000-0000-0000-0000-000000000001',
      '企业 A',
      5000
    )
  ),
  1,
  'list search returns a matching company from the active workspace'
);

select is(
  (
    select count(*)::integer
    from public.search_company_list_ids(
      '10000000-0000-0000-0000-000000000001',
      '企业 B',
      5000
    )
  ),
  0,
  'list search cannot reveal another workspace company'
);

select * from finish();

rollback;
