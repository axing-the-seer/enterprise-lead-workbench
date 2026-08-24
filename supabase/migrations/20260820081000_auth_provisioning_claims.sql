-- GoTrue writes custom app_metadata after the initial auth.users INSERT, so an
-- INSERT trigger cannot use it to authorize Auth Admin provisioning.  A short
-- lived, service-issued claim carried only as an opaque UUID in user_metadata
-- gives the trigger an atomic capability it can validate during that INSERT.

create table if not exists private.user_provisioning_claims (
  claim_id uuid primary key,
  email text not null,
  purpose text not null,
  administrator boolean not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint user_provisioning_claims_email_normalized_check
    check (email = lower(btrim(email)) and length(email) between 3 and 254),
  constraint user_provisioning_claims_purpose_check
    check (purpose in ('bootstrap', 'administrator')),
  constraint user_provisioning_claims_expiry_check
    check (expires_at > created_at)
);

alter table private.user_provisioning_claims enable row level security;

revoke all on table private.user_provisioning_claims
  from public, anon, authenticated, service_role;

create or replace function public.issue_user_provisioning_claim(
  p_claim_id uuid,
  p_email text,
  p_purpose text,
  p_administrator boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(p_email));
  affected integer;
begin
  if p_claim_id is null
     or normalized_email is null
     or length(normalized_email) not between 3 and 254
     or p_purpose not in ('bootstrap', 'administrator')
     or p_administrator is null then
    return false;
  end if;

  if p_purpose = 'bootstrap' then
    if p_administrator is not true
       or not exists (
         select 1
         from private.first_admin_bootstrap b
         where b.singleton = true
           and b.state = 'claimed'
           and b.claim_id = p_claim_id
           and b.claimed_at > now() - interval '5 minutes'
       ) then
      return false;
    end if;
  end if;

  delete from private.user_provisioning_claims
  where expires_at <= now();

  insert into private.user_provisioning_claims (
    claim_id,
    email,
    purpose,
    administrator,
    expires_at
  ) values (
    p_claim_id,
    normalized_email,
    p_purpose,
    p_administrator,
    now() + interval '5 minutes'
  )
  on conflict (claim_id) do nothing;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.release_user_provisioning_claim(
  p_claim_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if p_claim_id is null then
    return false;
  end if;

  delete from private.user_provisioning_claims
  where claim_id = p_claim_id;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

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
  provisioning_claim_id uuid;
  provisioning_claim private.user_provisioning_claims%rowtype;
  has_provisioning_claim boolean := false;
  is_bootstrap_claim_valid boolean := false;
  profile_is_administrator boolean := false;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('enterprise-workbench:user-provisioning', 0)
  );

  select count(s.id) into sales_count
  from public.sales s;

  begin
    provisioning_claim_id := nullif(
      new.raw_user_meta_data ->> 'workbench_provisioning_claim_id',
      ''
    )::uuid;
  exception when invalid_text_representation then
    provisioning_claim_id := null;
  end;

  if provisioning_claim_id is not null then
    delete from private.user_provisioning_claims c
    where c.claim_id = provisioning_claim_id
      and c.email = lower(btrim(new.email))
      and c.expires_at > now()
    returning c.* into provisioning_claim;
    has_provisioning_claim := found;
  end if;

  if has_provisioning_claim then
    if provisioning_claim.purpose = 'bootstrap' then
      select exists (
        select 1
        from private.first_admin_bootstrap b
        where b.singleton = true
          and b.state = 'claimed'
          and b.claim_id = provisioning_claim.claim_id
          and b.claimed_at > now() - interval '5 minutes'
      ) into is_bootstrap_claim_valid;

      if sales_count > 0
         or provisioning_claim.administrator is not true
         or not is_bootstrap_claim_valid then
        raise exception using
          errcode = '42501',
          message = 'first administrator bootstrap is not authorized';
      end if;
    elsif provisioning_claim.purpose <> 'administrator' then
      raise exception using
        errcode = '42501',
        message = 'user provisioning claim is not authorized';
    end if;

    profile_is_administrator := provisioning_claim.administrator;
  else
    -- Keep the trusted direct-DB/Auth Admin metadata path for migrations and
    -- database fixtures. GoTrue public signup cannot set raw_app_meta_data.
    provisioning_source := coalesce(
      new.raw_app_meta_data ->> 'workbench_provisioning',
      ''
    );

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
      profile_is_administrator := true;
    elsif provisioning_source = 'administrator' then
      profile_is_administrator := sales_count = 0;
    elsif sales_count > 0
          and coalesce(new.raw_app_meta_data ->> 'provider', '') in ('sso', 'saml') then
      profile_is_administrator := false;
    else
      raise exception using
        errcode = '42501',
        message = 'public user provisioning is closed';
    end if;
  end if;

  insert into public.sales (first_name, last_name, email, user_id, administrator)
  values (
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    new.email,
    new.id,
    profile_is_administrator
  );

  return new;
end;
$$;

revoke all on function public.issue_user_provisioning_claim(uuid, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.release_user_provisioning_claim(uuid)
  from public, anon, authenticated;
grant execute on function public.issue_user_provisioning_claim(uuid, text, text, boolean)
  to service_role;
grant execute on function public.release_user_provisioning_claim(uuid)
  to service_role;

revoke all on function public.handle_new_user()
  from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;
