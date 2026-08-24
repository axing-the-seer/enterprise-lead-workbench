-- Close the legacy public signup path and provide a concurrency-safe state
-- machine for the server-side first-administrator bootstrap.
--
-- The bootstrap secret is intentionally not stored in Postgres. The public
-- Edge Function verifies it before calling these service-role-only RPCs.

create table if not exists private.first_admin_bootstrap (
  singleton boolean primary key default true,
  state text not null default 'pending',
  claim_id uuid,
  claimed_at timestamp with time zone,
  completed_at timestamp with time zone,
  admin_user_id uuid,
  constraint first_admin_bootstrap_singleton check (singleton),
  constraint first_admin_bootstrap_state check (state in ('pending', 'claimed', 'completed')),
  constraint first_admin_bootstrap_claim_shape check (
    (state = 'pending' and claim_id is null and claimed_at is null and completed_at is null and admin_user_id is null)
    or (state = 'claimed' and claim_id is not null and claimed_at is not null and completed_at is null and admin_user_id is null)
    or (state = 'completed' and completed_at is not null)
  )
);

revoke all on table private.first_admin_bootstrap from public, anon, authenticated, service_role;

insert into private.first_admin_bootstrap (
  singleton,
  state,
  completed_at,
  admin_user_id
)
select
  true,
  case when existing_user.id is null then 'pending' else 'completed' end,
  case when existing_user.id is null then null else now() end,
  existing_user.id
from (
  select au.id
  from auth.users au
  order by au.created_at, au.id
  limit 1
) existing_user
right join (select true) seed on true
on conflict (singleton) do nothing;

create or replace function public.get_first_admin_bootstrap_state()
returns table(is_initialized boolean, claim_in_progress boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  bootstrap_row private.first_admin_bootstrap%rowtype;
  existing_user_id uuid;
begin
  select b.* into bootstrap_row
  from private.first_admin_bootstrap b
  where b.singleton = true
  for update;

  select au.id into existing_user_id
  from auth.users au
  order by au.created_at, au.id
  limit 1;

  if existing_user_id is not null and bootstrap_row.state <> 'completed' then
    update private.first_admin_bootstrap
    set state = 'completed',
        claim_id = null,
        claimed_at = null,
        completed_at = now(),
        admin_user_id = existing_user_id
    where singleton = true
    returning * into bootstrap_row;
  end if;

  return query
  select
    bootstrap_row.state = 'completed',
    bootstrap_row.state = 'claimed'
      and bootstrap_row.claimed_at > now() - interval '5 minutes';
end;
$$;

create or replace function public.claim_first_admin_bootstrap(p_claim_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  bootstrap_row private.first_admin_bootstrap%rowtype;
  existing_user_id uuid;
begin
  if p_claim_id is null then
    raise exception using errcode = '22023', message = 'bootstrap claim id is required';
  end if;

  select b.* into bootstrap_row
  from private.first_admin_bootstrap b
  where b.singleton = true
  for update;

  select au.id into existing_user_id
  from auth.users au
  order by au.created_at, au.id
  limit 1;

  if existing_user_id is not null then
    if bootstrap_row.state <> 'completed' then
      update private.first_admin_bootstrap
      set state = 'completed',
          claim_id = null,
          claimed_at = null,
          completed_at = now(),
          admin_user_id = existing_user_id
      where singleton = true;
    end if;
    return false;
  end if;

  if bootstrap_row.state = 'completed' then
    return false;
  end if;

  if bootstrap_row.state = 'claimed'
     and bootstrap_row.claimed_at > now() - interval '5 minutes' then
    return false;
  end if;

  update private.first_admin_bootstrap
  set state = 'claimed',
      claim_id = p_claim_id,
      claimed_at = now(),
      completed_at = null,
      admin_user_id = null
  where singleton = true;

  return true;
end;
$$;

create or replace function public.complete_first_admin_bootstrap(
  p_claim_id uuid,
  p_admin_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  bootstrap_row private.first_admin_bootstrap%rowtype;
begin
  select b.* into bootstrap_row
  from private.first_admin_bootstrap b
  where b.singleton = true
  for update;

  if p_claim_id is null
     or p_admin_user_id is null
     or bootstrap_row.state <> 'claimed'
     or bootstrap_row.claim_id <> p_claim_id then
    return false;
  end if;

  if not exists (
    select 1
    from auth.users au
    join public.sales s on s.user_id = au.id
    where au.id = p_admin_user_id
      and s.administrator = true
  ) then
    return false;
  end if;

  update private.first_admin_bootstrap
  set state = 'completed',
      claim_id = null,
      claimed_at = null,
      completed_at = now(),
      admin_user_id = p_admin_user_id
  where singleton = true;

  return true;
end;
$$;

create or replace function public.release_first_admin_bootstrap(p_claim_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  bootstrap_row private.first_admin_bootstrap%rowtype;
  existing_user_id uuid;
begin
  select b.* into bootstrap_row
  from private.first_admin_bootstrap b
  where b.singleton = true
  for update;

  if p_claim_id is null
     or bootstrap_row.state <> 'claimed'
     or bootstrap_row.claim_id <> p_claim_id then
    return false;
  end if;

  select au.id into existing_user_id
  from auth.users au
  order by au.created_at, au.id
  limit 1;

  if existing_user_id is not null then
    update private.first_admin_bootstrap
    set state = 'completed',
        claim_id = null,
        claimed_at = null,
        completed_at = now(),
        admin_user_id = existing_user_id
    where singleton = true;
    return false;
  end if;

  update private.first_admin_bootstrap
  set state = 'pending',
      claim_id = null,
      claimed_at = null,
      completed_at = null,
      admin_user_id = null
  where singleton = true;

  return true;
end;
$$;

-- App metadata is writable only through the trusted Auth Admin API. Requiring
-- a server provisioning marker makes a direct /auth/v1/signup fail even if a
-- hosted Auth switch is accidentally reopened later.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sales_count integer;
  provisioning_source text;
  bootstrap_claim_id uuid;
  is_bootstrap_claim_valid boolean := false;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('enterprise-workbench:user-provisioning', 0)
  );

  select count(s.id) into sales_count
  from public.sales s;

  provisioning_source := coalesce(new.raw_app_meta_data ->> 'workbench_provisioning', '');

  if provisioning_source = 'bootstrap' then
    begin
      bootstrap_claim_id := nullif(
        new.raw_app_meta_data ->> 'workbench_bootstrap_claim_id',
        ''
      )::uuid;
    exception when invalid_text_representation then
      bootstrap_claim_id := null;
    end;

    select exists (
      select 1
      from private.first_admin_bootstrap b
      where b.singleton = true
        and b.state = 'claimed'
        and b.claim_id = bootstrap_claim_id
        and b.claimed_at > now() - interval '5 minutes'
    ) into is_bootstrap_claim_valid;

    if sales_count > 0 or not is_bootstrap_claim_valid then
      raise exception using
        errcode = '42501',
        message = 'first administrator bootstrap is not authorized';
    end if;
  elsif provisioning_source = 'administrator' then
    -- Trusted administrator and test provisioning use the Auth Admin API.
    null;
  elsif sales_count > 0
        and coalesce(new.raw_app_meta_data ->> 'provider', '') in ('sso', 'saml') then
    -- Organization SSO may provision non-admin members only after an owner
    -- already exists. The IdP/domain remains a deployment configuration duty.
    null;
  else
    raise exception using
      errcode = '42501',
      message = 'public user provisioning is closed';
  end if;

  insert into public.sales (first_name, last_name, email, user_id, administrator)
  values (
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    new.email,
    new.id,
    sales_count = 0
  );

  return new;
end;
$$;

revoke all on function public.get_first_admin_bootstrap_state() from public, anon, authenticated;
revoke all on function public.claim_first_admin_bootstrap(uuid) from public, anon, authenticated;
revoke all on function public.complete_first_admin_bootstrap(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_first_admin_bootstrap(uuid) from public, anon, authenticated;
grant execute on function public.get_first_admin_bootstrap_state() to service_role;
grant execute on function public.claim_first_admin_bootstrap(uuid) to service_role;
grant execute on function public.complete_first_admin_bootstrap(uuid, uuid) to service_role;
grant execute on function public.release_first_admin_bootstrap(uuid) to service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;
