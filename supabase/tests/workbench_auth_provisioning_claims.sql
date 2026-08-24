begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

select has_table(
  'private',
  'user_provisioning_claims',
  'private one-use user provisioning claims exist'
);

select has_function(
  'public',
  'issue_user_provisioning_claim',
  array['uuid', 'text', 'text', 'boolean'],
  'service-side claim issuance RPC exists'
);

select has_function(
  'public',
  'release_user_provisioning_claim',
  array['uuid'],
  'service-side claim release RPC exists'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.issue_user_provisioning_claim(uuid,text,text,boolean)',
      'public.release_user_provisioning_claim(uuid)'
    ]) signature
    where has_function_privilege('anon', signature, 'EXECUTE')
  ),
  0,
  'anonymous callers cannot issue or release provisioning claims'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.issue_user_provisioning_claim(uuid,text,text,boolean)',
      'public.release_user_provisioning_claim(uuid)'
    ]) signature
    where has_function_privilege('authenticated', signature, 'EXECUTE')
  ),
  0,
  'authenticated callers cannot issue or release provisioning claims'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.issue_user_provisioning_claim(uuid,text,text,boolean)',
      'public.release_user_provisioning_claim(uuid)'
    ]) signature
    where has_function_privilege('service_role', signature, 'EXECUTE')
  ),
  2,
  'service role can issue and release provisioning claims'
);

select ok(
  not has_table_privilege('anon', 'private.user_provisioning_claims', 'SELECT,INSERT,UPDATE,DELETE'),
  'anonymous callers cannot inspect or mutate claim rows'
);

select ok(
  not has_table_privilege('authenticated', 'private.user_provisioning_claims', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated callers cannot inspect or mutate claim rows'
);

select ok(
  not has_table_privilege('service_role', 'private.user_provisioning_claims', 'SELECT,INSERT,UPDATE,DELETE'),
  'service role must use the bounded claim RPCs rather than direct table access'
);

select is(
  public.issue_user_provisioning_claim(
    '30000000-0000-4000-8000-000000000001',
    'owner@example.test',
    'bootstrap',
    true
  ),
  false,
  'a bootstrap provisioning claim requires the matching singleton claim first'
);

select is(
  public.claim_first_admin_bootstrap('30000000-0000-4000-8000-000000000001'),
  true,
  'the bootstrap singleton accepts the first claim'
);

select is(
  public.issue_user_provisioning_claim(
    '30000000-0000-4000-8000-000000000001',
    'owner@example.test',
    'bootstrap',
    false
  ),
  false,
  'a bootstrap provisioning claim cannot remove administrator privilege'
);

select is(
  public.issue_user_provisioning_claim(
    '30000000-0000-4000-8000-000000000001',
    'OWNER@example.test',
    'bootstrap',
    true
  ),
  true,
  'service role issues a normalized, short-lived bootstrap claim'
);

select is(
  public.issue_user_provisioning_claim(
    '30000000-0000-4000-8000-000000000001',
    'owner@example.test',
    'bootstrap',
    true
  ),
  false,
  'the same capability UUID cannot be issued twice'
);

select throws_ok(
  $$
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '30000000-0000-4000-8000-000000000002',
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'attacker@example.test', '', now(),
      '{}'::jsonb,
      '{"workbench_provisioning_claim_id":"30000000-0000-4000-8000-000000000001"}'::jsonb,
      now(), now()
    )
  $$,
  '42501',
  'public user provisioning is closed',
  'a claim is bound to the normalized email address'
);

select is(
  (select count(*)::integer from private.user_provisioning_claims),
  1,
  'a rejected Auth transaction does not consume the valid claim'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '30000000-0000-4000-8000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'owner@example.test', '', now(),
  '{}'::jsonb,
  '{"first_name":"首位","last_name":"管理员","workbench_provisioning_claim_id":"30000000-0000-4000-8000-000000000001"}'::jsonb,
  now(), now()
);

select is(
  (
    select administrator
    from public.sales
    where user_id = '30000000-0000-4000-8000-000000000003'
  ),
  true,
  'the exact bootstrap claim creates the first administrator'
);

select is(
  (select count(*)::integer from private.user_provisioning_claims),
  0,
  'a successful Auth transaction atomically consumes its claim'
);

select is(
  public.issue_user_provisioning_claim(
    '30000000-0000-4000-8000-000000000004',
    'member@example.test',
    'administrator',
    false
  ),
  true,
  'the administrator provisioning path can issue a non-admin member claim'
);

select throws_ok(
  $$
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '30000000-0000-4000-8000-000000000005',
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'spoof@example.test', '', now(),
      '{}'::jsonb,
      '{"administrator":true,"workbench_provisioning_claim_id":"30000000-0000-4000-8000-000000000099"}'::jsonb,
      now(), now()
    )
  $$,
  '42501',
  'public user provisioning is closed',
  'user metadata cannot self-assert a claim or administrator privilege'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '30000000-0000-4000-8000-000000000006',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'member@example.test', '', now(),
  '{}'::jsonb,
  '{"administrator":true,"workbench_provisioning_claim_id":"30000000-0000-4000-8000-000000000004"}'::jsonb,
  now(), now()
);

select is(
  (
    select administrator
    from public.sales
    where user_id = '30000000-0000-4000-8000-000000000006'
  ),
  false,
  'the server-side claim, not user metadata, determines administrator privilege'
);

select is(
  (select count(*)::integer from private.user_provisioning_claims),
  0,
  'the later-user claim is also consumed exactly once'
);

select is(
  public.release_user_provisioning_claim('30000000-0000-4000-8000-000000000004'),
  false,
  'a consumed claim cannot be released or reused'
);

select * from finish();

rollback;
