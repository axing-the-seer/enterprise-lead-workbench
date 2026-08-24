begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

select has_table(
  'private',
  'first_admin_bootstrap',
  'private first-administrator state exists'
);

select has_function(
  'public',
  'get_first_admin_bootstrap_state',
  array[]::text[],
  'bootstrap status RPC exists'
);

select has_function(
  'public',
  'claim_first_admin_bootstrap',
  array['uuid'],
  'bootstrap claim RPC exists'
);

select has_function(
  'public',
  'complete_first_admin_bootstrap',
  array['uuid', 'uuid'],
  'bootstrap completion RPC exists'
);

select has_function(
  'public',
  'release_first_admin_bootstrap',
  array['uuid'],
  'bootstrap release RPC exists'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.get_first_admin_bootstrap_state()',
      'public.claim_first_admin_bootstrap(uuid)',
      'public.complete_first_admin_bootstrap(uuid,uuid)',
      'public.release_first_admin_bootstrap(uuid)'
    ]) signature
    where has_function_privilege('anon', signature, 'EXECUTE')
  ),
  0,
  'anonymous callers cannot execute bootstrap state RPCs'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.get_first_admin_bootstrap_state()',
      'public.claim_first_admin_bootstrap(uuid)',
      'public.complete_first_admin_bootstrap(uuid,uuid)',
      'public.release_first_admin_bootstrap(uuid)'
    ]) signature
    where has_function_privilege('authenticated', signature, 'EXECUTE')
  ),
  0,
  'authenticated callers cannot execute bootstrap state RPCs'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.get_first_admin_bootstrap_state()',
      'public.claim_first_admin_bootstrap(uuid)',
      'public.complete_first_admin_bootstrap(uuid,uuid)',
      'public.release_first_admin_bootstrap(uuid)'
    ]) signature
    where has_function_privilege('service_role', signature, 'EXECUTE')
  ),
  4,
  'service role can execute the complete bootstrap state machine'
);

select ok(
  not has_table_privilege('anon', 'private.first_admin_bootstrap', 'SELECT,INSERT,UPDATE,DELETE'),
  'anonymous callers cannot inspect or mutate bootstrap state'
);

select ok(
  not has_table_privilege('authenticated', 'private.first_admin_bootstrap', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated callers cannot inspect or mutate bootstrap state'
);

select is(
  (select is_initialized from public.get_first_admin_bootstrap_state()),
  false,
  'a fresh project is not initialized'
);

select is(
  public.claim_first_admin_bootstrap('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  true,
  'the first valid service claim wins'
);

select is(
  public.claim_first_admin_bootstrap('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  false,
  'a concurrent claim is rejected'
);

select is(
  public.release_first_admin_bootstrap('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  false,
  'a caller cannot release another request claim'
);

select is(
  public.release_first_admin_bootstrap('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  true,
  'a failed creation can safely release its matching claim'
);

select is(
  public.claim_first_admin_bootstrap('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  true,
  'bootstrap can be retried after a safe release'
);

select throws_ok(
  $$
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'public-signup@example.test', '', now(),
      '{}'::jsonb, '{}'::jsonb, now(), now()
    )
  $$,
  '42501',
  'public user provisioning is closed',
  'an unmarked direct signup is rejected before it can create a sales row'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '10000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'owner@example.test', '', now(),
  '{"workbench_provisioning":"bootstrap","workbench_bootstrap_claim_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'::jsonb,
  '{"first_name":"首位","last_name":"管理员"}'::jsonb,
  now(), now()
);

select is(
  (
    select first_name || '|' || last_name || '|' || administrator::text
    from public.sales
    where user_id = '10000000-0000-4000-8000-000000000002'
  ),
  '首位|管理员|true',
  'a claimed bootstrap creates the first administrator profile'
);

select is(
  public.complete_first_admin_bootstrap(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '10000000-0000-4000-8000-000000000002'
  ),
  true,
  'the matching administrator completes bootstrap exactly once'
);

select is(
  (select is_initialized from public.get_first_admin_bootstrap_state()),
  true,
  'completed bootstrap is permanently initialized'
);

select is(
  public.claim_first_admin_bootstrap('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  false,
  'a completed installation cannot be claimed again'
);

select throws_ok(
  $$
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '10000000-0000-4000-8000-000000000003',
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'second-public@example.test', '', now(),
      '{}'::jsonb, '{}'::jsonb, now(), now()
    )
  $$,
  '42501',
  'public user provisioning is closed',
  'public signup remains rejected after initialization'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '10000000-0000-4000-8000-000000000004',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'invited@example.test', '', now(),
  '{"workbench_provisioning":"administrator"}'::jsonb,
  '{"first_name":"受邀","last_name":"成员"}'::jsonb,
  now(), now()
);

select is(
  (
    select administrator
    from public.sales
    where user_id = '10000000-0000-4000-8000-000000000004'
  ),
  false,
  'trusted administrator provisioning creates later users without owner privilege'
);

select is(
  public.release_first_admin_bootstrap('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  false,
  'a completed bootstrap cannot be released or reopened'
);

select * from finish();

rollback;
