begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

select has_view(
  'public',
  'source_connections_safe',
  'safe source-connection view exists'
);

select ok(
  exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'source_connections_safe'
      and (
        coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true']
        or coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=on']
      )
  ),
  'safe source-connection view executes with caller privileges'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'source_connections_safe'
      and column_name = 'secret_reference'
  ),
  0,
  'safe view never exposes secret_reference'
);

select has_function(
  'public',
  'configure_source_connection',
  array['uuid', 'uuid', 'text', 'text', 'text', 'jsonb'],
  'controlled source-configuration RPC exists'
);

select ok(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'configure_source_connection'
      and pg_get_function_identity_arguments(p.oid) =
        'p_workspace_id uuid, p_connection_id uuid, p_provider text, p_name text, p_secret_reference text, p_connection_config jsonb'
  ),
  'source-configuration RPC is security definer with explicit validation'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.configure_source_connection(uuid,uuid,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'anonymous callers cannot configure source connections'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.configure_source_connection(uuid,uuid,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated owners and admins can reach the validated RPC'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.configure_source_connection(uuid,uuid,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'service workers use direct trusted maintenance paths, not the browser RPC'
);

select ok(
  not has_table_privilege('authenticated', 'public.source_connections', 'INSERT'),
  'authenticated clients cannot directly insert source connections'
);

select ok(
  not has_table_privilege('authenticated', 'public.source_connections', 'UPDATE'),
  'authenticated clients cannot directly update source connections'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'source_connections'
      and cmd in ('INSERT', 'UPDATE', 'ALL')
  ),
  0,
  'source connections have no client write policy'
);

select ok(
  has_table_privilege('authenticated', 'public.source_connections_safe', 'SELECT'),
  'authenticated members can select the safe view'
);

select ok(
  not has_table_privilege('anon', 'public.source_connections_safe', 'SELECT'),
  'anonymous callers cannot select the safe view'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'source-owner@example.test', '', now(), '{"workbench_provisioning":"administrator"}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'source-admin@example.test', '', now(), '{"workbench_provisioning":"administrator"}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'source-editor@example.test', '', now(), '{"workbench_provisioning":"administrator"}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'source-viewer@example.test', '', now(), '{"workbench_provisioning":"administrator"}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-owner@example.test', '', now(), '{"workbench_provisioning":"administrator"}'::jsonb, '{}'::jsonb, now(), now());

insert into public.workspaces (id, name, slug, owner_user_id) values
  ('11000000-0000-0000-0000-000000000001', 'Source Workspace A', 'source-workspace-a', '00000000-0000-0000-0000-000000000021'),
  ('11000000-0000-0000-0000-000000000002', 'Source Workspace B', 'source-workspace-b', '00000000-0000-0000-0000-000000000025');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at) values
  ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000022', 'admin', 'active', now()),
  ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000023', 'editor', 'active', now()),
  ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000024', 'viewer', 'active', now());

insert into public.source_connections (
  id, workspace_id, provider, name, connection_kind, status,
  secret_reference, connection_config, last_verified_at, last_error_code,
  created_by, updated_by
) values
  (
    '21000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    'qcc', 'QCC internal', 'mcp', 'ready',
    'vault://qcc/internal', '{"executable":"/opt/qcc-agent-cli"}'::jsonb,
    now(), 'OLD_QCC_ERROR',
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000021'
  ),
  (
    '21000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000001',
    'huoke_assistant', 'Huoke old', 'other', 'ready',
    null, '{}'::jsonb, now(), 'OLD_KC_ERROR',
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000021'
  ),
  (
    '21000000-0000-0000-0000-000000000003',
    '11000000-0000-0000-0000-000000000001',
    'file_upload', 'File upload', 'upload', 'ready',
    null, '{}'::jsonb, now(), 'OLD_FILE_ERROR',
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000021'
  ),
  (
    '21000000-0000-0000-0000-000000000005',
    '11000000-0000-0000-0000-000000000001',
    'web_search', 'Ego Lite 公开信息报告', 'other', 'ready',
    null,
    '{"engine":"ego_lite"}'::jsonb,
    now(), 'OLD_WEB_ERROR',
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000021'
  ),
  (
    '21000000-0000-0000-0000-000000000004',
    '11000000-0000-0000-0000-000000000002',
    'qcc', 'Other workspace QCC', 'cli', 'draft',
    null, '{}'::jsonb, null, null,
    '00000000-0000-0000-0000-000000000025',
    '00000000-0000-0000-0000-000000000025'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000024', true);

select lives_ok(
  $$ select * from public.source_connections_safe $$,
  'viewer can select every safe view column without touching secret_reference'
);

select is(
  (select count(*)::integer from public.source_connections_safe),
  4,
  'safe view applies base-table RLS and hides other workspaces'
);

select throws_ok(
  $$
    select public.configure_source_connection(
      '11000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000002',
      'huoke_assistant', 'Viewer update', null, '{}'::jsonb
    )
  $$,
  '42501',
  'workspace owner or admin required',
  'viewer cannot configure a source connection'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000023', true);

select throws_ok(
  $$
    select public.configure_source_connection(
      '11000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000002',
      'huoke_assistant', 'Editor update', null, '{}'::jsonb
    )
  $$,
  '42501',
  'workspace owner or admin required',
  'editor member cannot configure a source connection'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000022', true);

select throws_ok(
  $$
    update public.source_connections
    set secret_reference = 'env://KC_API_KEY'
    where id = '21000000-0000-0000-0000-000000000002'
  $$,
  '42501',
  null,
  'admin cannot directly update secret_reference'
);

select throws_ok(
  $$
    insert into public.source_connections (
      workspace_id, provider, name, connection_kind, status
    ) values (
      '11000000-0000-0000-0000-000000000001',
      'other', 'Browser-created connection', 'other', 'draft'
    )
  $$,
  '42501',
  null,
  'admin cannot directly create an unvalidated connection'
);

select is(
  public.configure_source_connection(
    '11000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000002',
    'huoke_assistant',
    '获客助手生产连接',
    'env://KC_API_KEY',
    '{"baseUrl":"https://loan.kdbank.cn/"}'::jsonb
  ),
  '21000000-0000-0000-0000-000000000002'::uuid,
  'admin can configure the initialized KC connection'
);

select is(
  (
    select name || '|' || connection_kind || '|' || status || '|' ||
      has_secret_reference::text || '|' || (connection_config ->> 'baseUrl') || '|' ||
      (last_verified_at is null)::text || '|' || (last_error_code is null)::text
    from public.source_connections_safe
    where id = '21000000-0000-0000-0000-000000000002'
  ),
  '获客助手生产连接|api|draft|true|https://loan.kdbank.cn|true|true',
  'KC update normalizes config and clears prior verification claims'
);

select throws_ok(
  $$
    select public.configure_source_connection(
      '11000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000002',
      'huoke_assistant', 'KC bad secret', 'env://OTHER_KEY', '{}'::jsonb
    )
  $$,
  '22023',
  'KC credential reference must be env://KC_API_KEY',
  'KC rejects arbitrary environment secret references'
);

select throws_ok(
  $$
    select public.configure_source_connection(
      '11000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000002',
      'huoke_assistant', 'KC HTTP', null,
      '{"baseUrl":"http://loan.kdbank.cn"}'::jsonb
    )
  $$,
  '22023',
  'KC baseUrl must be a credential-free HTTPS origin',
  'KC rejects non-HTTPS endpoints'
);

select throws_ok(
  $$
    select public.configure_source_connection(
      '11000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000002',
      'huoke_assistant', 'KC credential URL', null,
      '{"baseUrl":"https://user:password@loan.kdbank.cn"}'::jsonb
    )
  $$,
  '22023',
  'KC baseUrl must be a credential-free HTTPS origin',
  'KC rejects URLs containing credentials'
);

select throws_ok(
  $$
    select public.configure_source_connection(
      '11000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000002',
      'huoke_assistant', 'KC inline key', null,
      '{"apiKey":"must-not-be-stored"}'::jsonb
    )
  $$,
  '22023',
  'inline credentials are forbidden',
  'KC rejects inline credential fields'
);

select is(
  public.configure_source_connection(
    '11000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000005',
    'web_search',
    'Ego Lite 公开信息报告',
    null,
    '{"engine":"ego_lite"}'::jsonb
  ),
  '21000000-0000-0000-0000-000000000005'::uuid,
  'admin can configure the deployment-managed Ego Lite connection'
);

select is(
  (
    select name || '|' || connection_kind || '|' || status || '|' ||
      has_secret_reference::text || '|' || (connection_config ->> 'engine') || '|' ||
      (last_verified_at is null)::text || '|' || (last_error_code is null)::text
    from public.source_connections_safe
    where id = '21000000-0000-0000-0000-000000000005'
  ),
  'Ego Lite 公开信息报告|web_search|draft|false|ego_lite|true|true',
  'Ego Lite configuration fixes the managed engine and clears verification claims'
);

select throws_ok(
  $$
    select public.configure_source_connection(
      '11000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000005',
      'web_search', 'Web bad secret', 'env://OTHER_KEY', '{}'::jsonb
    )
  $$,
  '22023',
  'Ego Lite does not accept browser credentials',
  'Ego Lite rejects browser credential references'
);

select throws_ok(
  $$
    select public.configure_source_connection(
      '11000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000005',
      'web_search', 'Web engine attack', null,
      '{"endpoint":"https://attacker.example/SearchPro"}'::jsonb
    )
  $$,
  '22023',
  'Ego Lite connection_config only accepts the managed engine identifier',
  'Ego Lite rejects browser-controlled engine or endpoint configuration'
);

select throws_ok(
  $$
    select public.configure_source_connection(
      '11000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000001',
      'qcc', 'QCC executable attack', null,
      '{"executable":"/tmp/attacker"}'::jsonb
    )
  $$,
  '22023',
  'QCC executable is server-managed',
  'browser cannot replace the QCC executable'
);

select throws_ok(
  $$
    select public.configure_source_connection(
      '11000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000001',
      'qcc', 'QCC secret attack', 'env://KC_API_KEY', '{}'::jsonb
    )
  $$,
  '22023',
  'QCC credential is server-managed',
  'browser cannot replace the QCC credential reference'
);

select is(
  public.configure_source_connection(
    '11000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'qcc', '企查查 CLI', null, '{}'::jsonb
  ),
  '21000000-0000-0000-0000-000000000001'::uuid,
  'admin can rename QCC without controlling its deployment settings'
);

select is(
  (
    select name || '|' || connection_kind || '|' || status || '|' ||
      (last_verified_at is null)::text || '|' || (last_error_code is null)::text
    from public.source_connections_safe
    where id = '21000000-0000-0000-0000-000000000001'
  ),
  '企查查 CLI|cli|draft|true|true',
  'QCC update enforces the provider-kind mapping and clears verification claims'
);

select throws_ok(
  $$
    select public.configure_source_connection(
      '11000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000001',
      'huoke_assistant', 'Provider swap', null, '{}'::jsonb
    )
  $$,
  '22023',
  'source provider cannot be changed',
  'provider identity cannot be changed through the RPC'
);

select throws_ok(
  $$
    select public.configure_source_connection(
      '11000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000003',
      'file_upload', 'File config attack', null,
      '{"endpoint":"https://example.test"}'::jsonb
    )
  $$,
  '22023',
  'file upload does not accept credentials or connection config',
  'file upload rejects connection config'
);

select throws_ok(
  $$
    select public.configure_source_connection(
      '11000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000003',
      'file_upload', 'File secret attack', 'env://KC_API_KEY', '{}'::jsonb
    )
  $$,
  '22023',
  'file upload does not accept credentials or connection config',
  'file upload rejects credential references'
);

select throws_ok(
  $$
    select public.configure_source_connection(
      '11000000-0000-0000-0000-000000000002',
      '21000000-0000-0000-0000-000000000004',
      'qcc', 'Cross-workspace attack', null, '{}'::jsonb
    )
  $$,
  '42501',
  'workspace owner or admin required',
  'admin cannot configure another workspace connection'
);

select throws_ok(
  $$ select secret_reference from public.source_connections $$,
  '42501',
  null,
  'admin still cannot select the base secret_reference column'
);

reset role;

select is(
  (
    select secret_reference
    from public.source_connections
    where id = '21000000-0000-0000-0000-000000000002'
  ),
  'env://KC_API_KEY',
  'KC persists only the approved server-side environment reference'
);

select is(
  (
    select secret_reference || '|' || (connection_config ->> 'executable')
    from public.source_connections
    where id = '21000000-0000-0000-0000-000000000001'
  ),
  'vault://qcc/internal|/opt/qcc-agent-cli',
  'QCC browser update preserves deployment-owned secret and executable values'
);

select is(
  (
    select secret_reference
    from public.source_connections
    where id = '21000000-0000-0000-0000-000000000005'
  ),
  null::text,
  'Ego Lite persists no browser-managed credential reference'
);

select * from finish();

rollback;
