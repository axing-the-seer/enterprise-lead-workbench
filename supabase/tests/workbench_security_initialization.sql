begin;

create extension if not exists pgtap with schema extensions;

select plan(46);

select has_function(
  'public',
  'initialize_workbench_workspace',
  array['text', 'text'],
  'atomic workspace initialization RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.initialize_workbench_workspace(text,text)',
    'EXECUTE'
  ),
  'anonymous callers cannot initialize workspaces'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.initialize_workbench_workspace(text,text)',
    'EXECUTE'
  ),
  'authenticated callers can initialize a workspace'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.enqueue_workbench_job(uuid,text,jsonb,text)',
    'EXECUTE'
  ),
  'anonymous callers cannot enqueue workbench jobs'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.enqueue_workbench_job(uuid,text,jsonb,text)',
    'EXECUTE'
  ),
  'authenticated callers can use the validated enqueue RPC'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.claim_next_workbench_job(text)',
      'public.complete_workbench_job(text,uuid,text,jsonb,text,text)',
      'public.complete_workbench_job_guarded(text,uuid,text,text,jsonb,text,text)',
      'public.renew_workbench_job_lease(text,uuid,text)',
      'public.expire_stale_workbench_jobs(text)',
      'public.get_company_list_manifest_hash(uuid,uuid)',
      'public.persist_workbench_ingestion_record(uuid,text,text,jsonb,text,timestamp with time zone,jsonb,text,jsonb)',
      'public.persist_workbench_web_evidence(uuid,bigint,text,jsonb,text,timestamp with time zone,jsonb,text,jsonb)',
      'public.ensure_ingestion_company_list(uuid,text)',
      'public.add_ingestion_list_member(uuid,uuid,bigint,uuid)'
    ]) as f(signature)
    where has_function_privilege('anon', signature, 'EXECUTE')
  ),
  0,
  'anonymous callers cannot execute any worker RPC'
);

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  0,
  'anonymous callers have no executable public RPC or helper function'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.claim_next_workbench_job(text)',
      'public.complete_workbench_job(text,uuid,text,jsonb,text,text)',
      'public.complete_workbench_job_guarded(text,uuid,text,text,jsonb,text,text)',
      'public.renew_workbench_job_lease(text,uuid,text)',
      'public.expire_stale_workbench_jobs(text)',
      'public.get_company_list_manifest_hash(uuid,uuid)',
      'public.persist_workbench_ingestion_record(uuid,text,text,jsonb,text,timestamp with time zone,jsonb,text,jsonb)',
      'public.persist_workbench_web_evidence(uuid,bigint,text,jsonb,text,timestamp with time zone,jsonb,text,jsonb)',
      'public.ensure_ingestion_company_list(uuid,text)',
      'public.add_ingestion_list_member(uuid,uuid,bigint,uuid)'
    ]) as f(signature)
    where has_function_privilege('authenticated', signature, 'EXECUTE')
  ),
  0,
  'authenticated callers cannot execute any worker RPC'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.claim_next_workbench_job(text)',
      'public.complete_workbench_job_guarded(text,uuid,text,text,jsonb,text,text)',
      'public.renew_workbench_job_lease(text,uuid,text)',
      'public.get_company_list_manifest_hash(uuid,uuid)',
      'public.persist_workbench_ingestion_record(uuid,text,text,jsonb,text,timestamp with time zone,jsonb,text,jsonb)',
      'public.persist_workbench_web_evidence(uuid,bigint,text,jsonb,text,timestamp with time zone,jsonb,text,jsonb)',
      'public.ensure_ingestion_company_list(uuid,text)',
      'public.add_ingestion_list_member(uuid,uuid,bigint,uuid)'
    ]) as f(signature)
    where has_function_privilege('service_role', signature, 'EXECUTE')
  ),
  8,
  'service role can execute every worker RPC'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.complete_workbench_job(text,uuid,text,jsonb,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.expire_stale_workbench_jobs(text)',
    'EXECUTE'
  ),
  'service workers cannot bypass lease ownership or call cleanup directly'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'workspaces', 'workspace_members', 'companies',
      'field_mapping_sets', 'field_mapping_versions', 'source_connections',
      'source_queries', 'ingestion_jobs', 'source_records', 'source_snapshots',
      'company_identifiers', 'company_evidence', 'company_field_facts',
      'risk_events', 'qualifications', 'company_lists', 'company_list_members',
      'rule_sets', 'rule_set_versions', 'rule_runs', 'rule_results',
      'manual_reviews', 'exports', 'audit_logs'
    ]) as t(table_name)
    where has_table_privilege(
      'anon',
      format('public.%I', table_name),
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )
  ),
  0,
  'anonymous callers have no privilege on any production domain table'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'workspaces', 'workspace_members', 'companies',
      'field_mapping_sets', 'field_mapping_versions', 'source_connections',
      'source_queries', 'ingestion_jobs', 'source_records', 'source_snapshots',
      'company_identifiers', 'company_evidence', 'company_field_facts',
      'risk_events', 'qualifications', 'company_lists', 'company_list_members',
      'rule_sets', 'rule_set_versions', 'rule_runs', 'rule_results',
      'manual_reviews', 'exports', 'audit_logs'
    ]) as t(table_name)
    where has_table_privilege(
      'authenticated',
      format('public.%I', table_name),
      'TRUNCATE'
    )
  ),
  0,
  'authenticated callers cannot truncate production domain tables'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public."contactNotes_id_seq"', 'public.contacts_id_seq',
      'public."dealNotes_id_seq"', 'public.deals_id_seq',
      'public.favicons_excluded_domains_id_seq', 'public.sales_id_seq',
      'public.tags_id_seq', 'public.tasks_id_seq'
    ]) as s(sequence_name)
    where has_sequence_privilege('anon', sequence_name, 'USAGE')
       or has_sequence_privilege('anon', sequence_name, 'SELECT')
       or has_sequence_privilege('anon', sequence_name, 'UPDATE')
  ),
  0,
  'anonymous callers cannot consume quarantined Atomic CRM sequences'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public."contactNotes_id_seq"', 'public.contacts_id_seq',
      'public."dealNotes_id_seq"', 'public.deals_id_seq',
      'public.favicons_excluded_domains_id_seq', 'public.sales_id_seq',
      'public.tags_id_seq', 'public.tasks_id_seq'
    ]) as s(sequence_name)
    where has_sequence_privilege('authenticated', sequence_name, 'USAGE')
       or has_sequence_privilege('authenticated', sequence_name, 'SELECT')
       or has_sequence_privilege('authenticated', sequence_name, 'UPDATE')
  ),
  0,
  'authenticated callers cannot consume quarantined Atomic CRM sequences'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'source_queries', 'ingestion_jobs', 'source_records', 'source_snapshots',
      'company_evidence', 'company_field_facts', 'rule_runs', 'rule_results',
      'exports'
    ]) as t(table_name)
    where has_table_privilege(
      'authenticated',
      format('public.%I', table_name),
      'INSERT'
    )
  ),
  0,
  'authenticated callers cannot directly insert queue, raw or derived rows'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.source_connections',
    'has_secret_reference',
    'SELECT'
  ),
  'clients can read the safe credential-presence flag'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.source_connections',
    'secret_reference',
    'SELECT'
  ),
  'clients cannot read provider secret references'
);

select ok(
  has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated RLS evaluation can resolve private policy helpers'
);

select ok(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'anonymous callers cannot resolve private policy helpers'
);

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('activity_log', 'companies_summary', 'contacts_summary', 'source_connections_safe')
      and (
        coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true']
        or coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=on']
      )
  ),
  4,
  'all rebuilt public views execute with caller privileges'
);

select ok(
  has_table_privilege('authenticated', 'public.companies_summary', 'SELECT'),
  'authenticated members can read the tenant-safe company summary'
);

select ok(
  not has_table_privilege('authenticated', 'public.activity_log', 'SELECT'),
  'legacy activity view is not client-accessible'
);

select ok(
  not has_table_privilege('authenticated', 'public.contacts_summary', 'SELECT'),
  'legacy contact summary is not client-accessible'
);

select is(
  (select public from storage.buckets where id = 'workbench-imports'),
  false,
  'workbench import bucket is private'
);

select is(
  (select public from storage.buckets where id = 'workbench-exports'),
  false,
  'workbench export bucket is private'
);

select is(
  (select public from storage.buckets where id = 'attachments'),
  false,
  'legacy attachment objects are preserved behind a private bucket'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'initializer@example.test',
  '',
  now(),
  '{"workbench_provisioning":"administrator"}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);

select lives_ok(
  $$
    select *
    from public.initialize_workbench_workspace('生产名单工作台', 'production-list-workbench')
  $$,
  'authenticated user can atomically initialize the full workbench'
);

select is(
  (select count(id)::integer from public.workspaces),
  1,
  'initialization creates exactly one visible workspace'
);

select is(
  (
    select role || '|' || status
    from public.workspace_members
    where user_id = '00000000-0000-0000-0000-000000000011'
  ),
  'owner|active',
  'initialization creates an active owner membership'
);

select is(
  (
    select string_agg(
      provider || '|' || connection_kind || '|' || status,
      ',' order by provider
    )
    from public.source_connections
  ),
  'file_upload|upload|ready,huoke_assistant|api|draft,qcc|cli|draft,web_search|web_search|draft',
  'initialization creates four source connections without fake verification'
);

select is(
  (
    select (connection_config ->> 'engine') || '|' || array_to_string(capabilities, ',')
    from public.source_connections
    where provider = 'web_search'
  ),
  'ego_lite|web_evidence,public_report,html_report',
  'initialization creates the deployment-managed Ego Lite report connection'
);

select is(
  (
    select count(id)::integer
    from public.field_mapping_sets
    where is_locked and status = 'active'
  ),
  2,
  'initialization creates two locked provider mapping sets'
);

select is(
  (
    select count(id)::integer
    from public.field_mapping_versions
    where is_locked and status = 'published'
  ),
  2,
  'initialization creates two immutable published mapping versions'
);

select is(
  (
    select status || '|' || jsonb_array_length(rule_definition -> 'rules')::text
    from public.rule_set_versions
    where version_number = 1
  ),
  'draft|0',
  'initialization creates an editable empty RuleTemplate v1 draft'
);

select is(
  (
    select created
    from public.initialize_workbench_workspace('生产名单工作台', 'production-list-workbench')
  ),
  false,
  'explicit-slug retry reuses the initialized workspace'
);

select is(
  (select count(id)::integer from public.source_connections),
  4,
  'initialization retry does not duplicate source connections'
);

select is(
  (
    select created
    from public.initialize_workbench_workspace('忽略的重命名', null)
  ),
  false,
  'default-workspace retry reuses the owner first active workspace'
);

select is_empty(
  $$
    update public.field_mapping_sets
    set description = '客户端不得覆盖'
    where is_locked
    returning id
  $$,
  'authenticated admins cannot mutate locked system mapping sets'
);

select lives_ok(
  $$
    select *
    from public.save_rule_template(
      (select workspace_id from public.rule_sets limit 1),
      (select id from public.rule_sets limit 1),
      (select name from public.rule_sets limit 1),
      (select description from public.rule_sets limit 1),
      (select business_objective from public.rule_sets limit 1),
      (
        select rule_definition
        from public.rule_set_versions
        where status = 'draft'
        order by version_number
        limit 1
      ),
      (
        select scoring_definition
        from public.rule_set_versions
        where status = 'draft'
        order by version_number
        limit 1
      ),
      '通过初始化安全测试发布'
    )
  $$,
  'a user publishes a new immutable version through the atomic rule RPC'
);

select throws_ok(
  $$
    update public.rule_set_versions
    set change_note = '篡改历史'
    where status = 'published'
  $$,
  '42501',
  null,
  'authenticated users cannot edit published rule versions in place'
);

select throws_ok(
  $$
    insert into public.ingestion_jobs (
      workspace_id, source_connection_id, job_kind,
      idempotency_key, input_params, requested_by
    ) values (
      '10000000-0000-0000-0000-000000000099',
      '20000000-0000-0000-0000-000000000099',
      'import',
      'direct-bypass-attempt-1',
      '{}'::jsonb,
      '00000000-0000-0000-0000-000000000011'
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot bypass enqueue with a direct queue insert'
);

select lives_ok(
  $$
    select id, provider, status, has_secret_reference
    from public.source_connections
  $$,
  'safe source connection projection remains readable'
);

select throws_ok(
  $$
    select secret_reference from public.source_connections
  $$,
  '42501',
  null,
  'source connection secret references are not selectable'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.source_connections
    where secret_reference is not null
       or last_verified_at is not null
  ),
  0,
  'initialization stores no credential reference and claims no verification'
);

select throws_ok(
  $$
    update public.field_mapping_versions
    set mapping_definition = '{"tampered":true}'::jsonb
    where status = 'published'
  $$,
  '42501',
  'published versions are immutable; create a new draft version',
  'published mappings remain immutable even for trusted maintenance roles'
);

select throws_ok(
  $$
    select public.add_ingestion_list_member(
      p_job_id => '20000000-0000-0000-0000-000000000099',
      p_company_list_id => '30000000-0000-0000-0000-000000000099',
      p_company_id => 999,
      p_source_record_id => null
    )
  $$,
  'P0002',
  'ingestion job not found',
  'worker list-member RPC exposes the production p_company_list_id contract'
);

select * from finish();

rollback;
