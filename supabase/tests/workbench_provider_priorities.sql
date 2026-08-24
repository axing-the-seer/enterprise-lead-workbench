begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select has_function(
  'public',
  'configure_provider_priorities',
  array['uuid', 'jsonb'],
  'controlled provider-priority RPC exists'
);

select ok(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'configure_provider_priorities'
      and pg_get_function_identity_arguments(p.oid) =
        'p_workspace_id uuid, p_priorities jsonb'
  ),
  'provider-priority RPC validates as a security definer'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.configure_provider_priorities(uuid,jsonb)',
    'EXECUTE'
  ),
  'anonymous callers cannot configure provider priorities'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.configure_provider_priorities(uuid,jsonb)',
    'EXECUTE'
  ),
  'authenticated workspace administrators can reach the RPC'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.configure_provider_priorities(uuid,jsonb)',
    'EXECUTE'
  ),
  'service workers only read persisted priorities'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'priority-owner@example.test', '', now(), '{"workbench_provisioning":"administrator"}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'priority-admin@example.test', '', now(), '{"workbench_provisioning":"administrator"}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000073', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'priority-editor@example.test', '', now(), '{"workbench_provisioning":"administrator"}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000074', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'priority-outsider@example.test', '', now(), '{"workbench_provisioning":"administrator"}'::jsonb, '{}'::jsonb, now(), now());

insert into public.workspaces (id, name, slug, owner_user_id) values
  ('17000000-0000-0000-0000-000000000001', 'Priority Workspace', 'priority-workspace', '00000000-0000-0000-0000-000000000071'),
  ('17000000-0000-0000-0000-000000000002', 'Other Priority Workspace', 'other-priority-workspace', '00000000-0000-0000-0000-000000000074');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at) values
  ('17000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000072', 'admin', 'active', now()),
  ('17000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000073', 'editor', 'active', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000071', true);

select is(
  public.configure_provider_priorities(
    '17000000-0000-0000-0000-000000000001',
    '{"qichacha":300,"kingdee-credit-kc-assistant":200,"csv-upload":100}'::jsonb
  ),
  '{"qichacha":300,"kingdee-credit-kc-assistant":200,"csv-upload":100}'::jsonb,
  'owner can persist an explicit deterministic order'
);

select is(
  (
    select settings -> 'providerPriorities'
    from public.workspaces
    where id = '17000000-0000-0000-0000-000000000001'
  ),
  '{"qichacha":300,"kingdee-credit-kc-assistant":200,"csv-upload":100}'::jsonb,
  'workspace stores provider priorities under the versioned settings namespace'
);

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where workspace_id = '17000000-0000-0000-0000-000000000001'
      and action = 'workspace.provider_priorities.updated'
      and actor_user_id = '00000000-0000-0000-0000-000000000071'
  ),
  1,
  'saving priorities creates an attributable audit record'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000072', true);

select lives_ok(
  $$
    select public.configure_provider_priorities(
      '17000000-0000-0000-0000-000000000001',
      '{"qichacha":100,"kingdee-credit-kc-assistant":300,"csv-upload":200}'::jsonb
    )
  $$,
  'workspace admin can update the order'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000073', true);

select throws_ok(
  $$
    select public.configure_provider_priorities(
      '17000000-0000-0000-0000-000000000001',
      '{"qichacha":300,"kingdee-credit-kc-assistant":200,"csv-upload":100}'::jsonb
    )
  $$,
  '42501',
  'workspace owner or admin required',
  'editor cannot change merge policy'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000074', true);

select throws_ok(
  $$
    select public.configure_provider_priorities(
      '17000000-0000-0000-0000-000000000001',
      '{"qichacha":300,"kingdee-credit-kc-assistant":200,"csv-upload":100}'::jsonb
    )
  $$,
  '42501',
  'workspace owner or admin required',
  'owner of another workspace cannot change this workspace'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000071', true);

select throws_ok(
  $$
    select public.configure_provider_priorities(
      '17000000-0000-0000-0000-000000000001',
      '{"qichacha":300,"kingdee-credit-kc-assistant":200}'::jsonb
    )
  $$,
  '22023',
  'provider priorities must contain exactly the supported providers',
  'all supported providers are required'
);

select throws_ok(
  $$
    select public.configure_provider_priorities(
      '17000000-0000-0000-0000-000000000001',
      '{"qichacha":300,"kingdee-credit-kc-assistant":200,"csv-upload":100,"unknown":50}'::jsonb
    )
  $$,
  '22023',
  'provider priorities must contain exactly the supported providers',
  'unknown provider keys are rejected'
);

select throws_ok(
  $$
    select public.configure_provider_priorities(
      '17000000-0000-0000-0000-000000000001',
      '{"qichacha":100,"kingdee-credit-kc-assistant":100,"csv-upload":100}'::jsonb
    )
  $$,
  '22023',
  'provider priority values must be three distinct integers between 0 and 1000',
  'ambiguous equal priorities are rejected'
);

select throws_ok(
  $$
    select public.configure_provider_priorities(
      '17000000-0000-0000-0000-000000000001',
      '{"qichacha":1001,"kingdee-credit-kc-assistant":200,"csv-upload":100}'::jsonb
    )
  $$,
  '22023',
  'provider priority values must be three distinct integers between 0 and 1000',
  'out-of-range priorities are rejected'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$
    select public.configure_provider_priorities(
      '17000000-0000-0000-0000-000000000001',
      '{"qichacha":300,"kingdee-credit-kc-assistant":200,"csv-upload":100}'::jsonb
    )
  $$,
  '28000',
  'authentication required',
  'unauthenticated direct calls are rejected'
);

select * from finish();
rollback;
