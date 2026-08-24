begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'existing-owner@example.test', '', now(),
  '{"workbench_provisioning":"administrator"}'::jsonb,
  '{}'::jsonb,
  now(), now()
);

select is(
  public.claim_first_admin_bootstrap('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  false,
  'an existing Auth user blocks first-administrator bootstrap'
);

select is(
  (select is_initialized from public.get_first_admin_bootstrap_state()),
  true,
  'existing-user discovery permanently closes bootstrap state'
);

delete from public.sales
where user_id = '20000000-0000-4000-8000-000000000001';
delete from auth.users
where id = '20000000-0000-4000-8000-000000000001';

select is(
  (select is_initialized from public.get_first_admin_bootstrap_state()),
  true,
  'deleting every user does not reopen bootstrap'
);

select is(
  public.claim_first_admin_bootstrap('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  false,
  'a completed marker remains non-claimable after user deletion'
);

select * from finish();

rollback;
