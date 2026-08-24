--
-- Functions
-- This file declares all PL/pgSQL functions in the public schema.
--

CREATE OR REPLACE FUNCTION "public"."cleanup_note_attachments"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    DECLARE
      payload jsonb;
      request_headers jsonb;
      auth_header text;
    BEGIN
      request_headers := coalesce(
        nullif(current_setting('request.headers', true), '')::jsonb,
        '{}'::jsonb
      );
      auth_header := request_headers ->> 'authorization';

      IF auth_header IS NULL OR auth_header = '' THEN
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;

        RETURN NEW;
      END IF;

      payload := jsonb_build_object(
        'old_record', OLD,
        'record', NEW,
        'type', TG_OP
      );

      PERFORM net.http_post(
        url := public.get_note_attachments_function_url(),
        body := payload,
        params := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type',
          'application/json',
          'Authorization',
          auth_header
        ),
        timeout_milliseconds := 10000
      );

      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;

      RETURN NEW;
    END;
    $$;

CREATE OR REPLACE FUNCTION "public"."get_avatar_for_email"("email" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare email_hash text;
declare gravatar_url text;
declare gravatar_status int8;
declare email_domain text;
declare favicon_url text;
declare domain_status int8;

begin
    -- Try to fetch a gravatar image
    email_hash = encode(extensions.digest(email, 'sha256'), 'hex');
    gravatar_url = concat('https://www.gravatar.com/avatar/', email_hash, '?d=404');

    select status from extensions.http_get(gravatar_url) into gravatar_status;

    if gravatar_status = 200 then
        return gravatar_url;
    end if;

    -- Fallback to email's domain favicon if not excluded
    email_domain = split_part(email, '@', 2);
    return get_domain_favicon(email_domain);
exception
    when others then
        return 'ERROR';
end;
$$;

CREATE OR REPLACE FUNCTION "public"."submit_company_report_analysis"(
    "p_workspace_id" uuid,
    "p_evidence_job_id" uuid,
    "p_agent_provider" text,
    "p_agent_name" text,
    "p_analysis" jsonb
) RETURNS TABLE(
    "report_id" uuid,
    "company_id" bigint,
    "revision" integer,
    "submitted_at" timestamp with time zone
)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  job_record public.ingestion_jobs%rowtype;
  resolved_company_id bigint;
  resolved_snapshot_id uuid;
  next_revision integer;
  inserted_report public.company_reports%rowtype;
begin
  if auth.uid() is null or not private.can_write_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'workspace write access is required';
  end if;
  if p_agent_provider is null
     or length(p_agent_provider) not between 2 and 64
     or p_agent_provider !~ '^[a-z0-9][a-z0-9._-]*$' then
    raise exception using errcode = '22023', message = 'agent provider is invalid';
  end if;
  if p_agent_name is null
     or length(btrim(p_agent_name)) not between 1 and 120
     or p_agent_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'agent name is invalid';
  end if;
  if jsonb_typeof(p_analysis) is distinct from 'object'
     or p_analysis ->> 'schemaVersion' is distinct from 'company-agent-analysis.v1'
     or octet_length(p_analysis::text) > 131072 then
    raise exception using errcode = '22023', message = 'agent analysis payload is invalid';
  end if;

  select ij.* into job_record
  from public.ingestion_jobs ij
  where ij.workspace_id = p_workspace_id
    and ij.id = p_evidence_job_id
    and ij.status in ('completed', 'partial')
    and ij.input_params ->> 'query_kind' = 'web_evidence'
    and ij.input_params -> 'criteria' ->> 'claimType' = 'public_report'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'completed evidence job was not found';
  end if;

  begin
    resolved_company_id := (job_record.result ->> 'company_id')::bigint;
    resolved_snapshot_id := (job_record.result ->> 'source_snapshot_id')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'evidence job result is incomplete';
  end;
  if resolved_company_id is null or resolved_snapshot_id is null then
    raise exception using errcode = '22023', message = 'evidence job result is incomplete';
  end if;

  update public.company_reports
  set is_current = false, status = 'superseded', updated_at = now()
  where workspace_id = p_workspace_id
    and evidence_job_id = p_evidence_job_id
    and is_current = true;

  select coalesce(max(cr.revision), 0) + 1 into next_revision
  from public.company_reports cr
  where cr.workspace_id = p_workspace_id
    and cr.evidence_job_id = p_evidence_job_id;

  insert into public.company_reports (
    workspace_id, company_id, evidence_job_id, source_snapshot_id, revision,
    status, schema_version, agent_provider, agent_name, analysis, is_current,
    submitted_by
  ) values (
    p_workspace_id, resolved_company_id, p_evidence_job_id,
    resolved_snapshot_id, next_revision, 'completed',
    'company-agent-analysis.v1', p_agent_provider, btrim(p_agent_name),
    p_analysis, true, auth.uid()
  ) returning * into inserted_report;

  insert into public.audit_logs (
    workspace_id, actor_type, actor_user_id, actor_label, action,
    entity_type, entity_id, request_id, metadata
  ) values (
    p_workspace_id, 'agent', auth.uid(), btrim(p_agent_name),
    'company_report.analysis_submitted', 'company_report',
    inserted_report.id::text, p_evidence_job_id::text,
    jsonb_build_object(
      'agent_provider', p_agent_provider,
      'company_id', resolved_company_id,
      'revision', next_revision
    )
  );

  return query select inserted_report.id, inserted_report.company_id,
    inserted_report.revision, inserted_report.submitted_at;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_domain_favicon"("domain_name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare domain_status int8;

begin
    if exists (select from favicons_excluded_domains as fav where fav.domain = domain_name) then
        return null;
    end if;

    return concat(
        'https://favicon.show/',
        (regexp_matches(domain_name, '^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/?\n]+)', 'i'))[1]
    );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_note_attachments_function_url"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
    DECLARE
      issuer text;
      function_url text;
    BEGIN
      issuer := coalesce(
        nullif(current_setting('request.jwt.claim.iss', true), ''),
        (
          coalesce(
            nullif(current_setting('request.jwt.claims', true), ''),
            '{}'
          )::jsonb ->> 'iss'
        )
      );
      issuer := nullif(issuer, '');
      IF issuer IS NOT NULL THEN
        issuer := rtrim(issuer, '/');
        IF right(issuer, 8) = '/auth/v1' THEN
          function_url :=
            left(issuer, length(issuer) - 8) || '/functions/v1/delete_note_attachments';

          IF function_url LIKE 'http://127.0.0.1:%' THEN
            RETURN replace(
              function_url,
              'http://127.0.0.1:',
              'http://host.docker.internal:'
            );
          END IF;

          IF function_url LIKE 'http://localhost:%' THEN
            RETURN replace(
              function_url,
              'http://localhost:',
              'http://host.docker.internal:'
            );
          END IF;

          RETURN function_url;
        END IF;
      END IF;

      RETURN 'http://host.docker.internal:54321/functions/v1/delete_note_attachments';
    END;
    $$;

CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("email" "text") RETURNS TABLE("id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  RETURN QUERY SELECT au.id FROM auth.users au WHERE au.email = $1;
END;
$_$;

CREATE OR REPLACE FUNCTION "public"."handle_company_saved"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare company_logo text;

begin
    if new.logo is not null then
        return new;
    end if;

    company_logo = get_domain_favicon(new.website);
    if company_logo is null then
        return new;
    end if;

    new.logo = concat('{"src":"', company_logo, '","title":"Company favicon"}');
    return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_contact_note_created_or_updated"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.contacts set last_seen = new.date where contacts.id = new.contact_id and contacts.last_seen < new.date;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_contact_saved"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$declare contact_avatar text;
declare emails_length int8;
declare item jsonb;

begin
    if new.avatar is not null then
        return new;
    end if;

    select coalesce(jsonb_array_length(new.email_jsonb), 0) into emails_length;

    if emails_length = 0 then
        return new;
    end if;

    for item in select jsonb_array_elements(new.email_jsonb)
    loop
        select public.get_avatar_for_email(item->>'email') into contact_avatar;
        if (contact_avatar is not null) then
            exit;
        end if;
    end loop;

    if contact_avatar is null then
        return new;
    end if;

    new.avatar = concat('{"src":"', contact_avatar, '"}');
    return new;
end;$$;

CREATE OR REPLACE FUNCTION "public"."issue_user_provisioning_claim"(
  "p_claim_id" uuid,
  "p_email" text,
  "p_purpose" text,
  "p_administrator" boolean
) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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

CREATE OR REPLACE FUNCTION "public"."release_user_provisioning_claim"(
  "p_claim_id" uuid
) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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

CREATE OR REPLACE FUNCTION "public"."handle_update_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.sales
  set
    first_name = coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    last_name = coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    email = new.email
  where user_id = new.id;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return exists (
    select 1 from public.sales where user_id = auth.uid() and administrator = true
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."merge_contacts"("loser_id" bigint, "winner_id" bigint) RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  winner_contact contacts%ROWTYPE;
  loser_contact contacts%ROWTYPE;
  deal_record RECORD;
  merged_emails jsonb;
  merged_phones jsonb;
  merged_tags bigint[];
  winner_emails jsonb;
  loser_emails jsonb;
  winner_phones jsonb;
  loser_phones jsonb;
  email_map jsonb;
  phone_map jsonb;
BEGIN
  -- Fetch both contacts
  SELECT * INTO winner_contact FROM contacts WHERE id = winner_id;
  SELECT * INTO loser_contact FROM contacts WHERE id = loser_id;

  IF winner_contact IS NULL OR loser_contact IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- 1. Reassign tasks from loser to winner
  UPDATE tasks SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 2. Reassign contact notes from loser to winner
  UPDATE contact_notes SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 3. Update deals - replace loser with winner in contact_ids array
  FOR deal_record IN
    SELECT id, contact_ids
    FROM deals
    WHERE contact_ids @> ARRAY[loser_id]
  LOOP
    UPDATE deals
    SET contact_ids = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(
          array_remove(deal_record.contact_ids, loser_id) || ARRAY[winner_id]
        )
      )
    )
    WHERE id = deal_record.id;
  END LOOP;

  -- 4. Merge contact data

  -- Get email arrays
  winner_emails := COALESCE(winner_contact.email_jsonb, '[]'::jsonb);
  loser_emails := COALESCE(loser_contact.email_jsonb, '[]'::jsonb);

  -- Merge emails with deduplication by email address
  -- Build a map of email -> email object, then convert back to array
  email_map := '{}'::jsonb;

  -- Add winner emails to map
  IF jsonb_array_length(winner_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_emails)-1 LOOP
      email_map := email_map || jsonb_build_object(
        winner_emails->i->>'email',
        winner_emails->i
      );
    END LOOP;
  END IF;

  -- Add loser emails to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_emails)-1 LOOP
      IF NOT email_map ? (loser_emails->i->>'email') THEN
        email_map := email_map || jsonb_build_object(
          loser_emails->i->>'email',
          loser_emails->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_emails := (SELECT jsonb_agg(value) FROM jsonb_each(email_map));
  merged_emails := COALESCE(merged_emails, '[]'::jsonb);

  -- Get phone arrays
  winner_phones := COALESCE(winner_contact.phone_jsonb, '[]'::jsonb);
  loser_phones := COALESCE(loser_contact.phone_jsonb, '[]'::jsonb);

  -- Merge phones with deduplication by number
  phone_map := '{}'::jsonb;

  -- Add winner phones to map
  IF jsonb_array_length(winner_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_phones)-1 LOOP
      phone_map := phone_map || jsonb_build_object(
        winner_phones->i->>'number',
        winner_phones->i
      );
    END LOOP;
  END IF;

  -- Add loser phones to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_phones)-1 LOOP
      IF NOT phone_map ? (loser_phones->i->>'number') THEN
        phone_map := phone_map || jsonb_build_object(
          loser_phones->i->>'number',
          loser_phones->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_phones := (SELECT jsonb_agg(value) FROM jsonb_each(phone_map));
  merged_phones := COALESCE(merged_phones, '[]'::jsonb);

  -- Merge tags (remove duplicates)
  merged_tags := ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(winner_contact.tags, ARRAY[]::bigint[]) ||
      COALESCE(loser_contact.tags, ARRAY[]::bigint[])
    )
  );

  -- 5. Update winner with merged data
  UPDATE contacts SET
    avatar = COALESCE(winner_contact.avatar, loser_contact.avatar),
    gender = COALESCE(winner_contact.gender, loser_contact.gender),
    first_name = COALESCE(winner_contact.first_name, loser_contact.first_name),
    last_name = COALESCE(winner_contact.last_name, loser_contact.last_name),
    title = COALESCE(winner_contact.title, loser_contact.title),
    company_id = COALESCE(winner_contact.company_id, loser_contact.company_id),
    email_jsonb = merged_emails,
    phone_jsonb = merged_phones,
    linkedin_url = COALESCE(winner_contact.linkedin_url, loser_contact.linkedin_url),
    background = COALESCE(winner_contact.background, loser_contact.background),
    has_newsletter = COALESCE(winner_contact.has_newsletter, loser_contact.has_newsletter),
    first_seen = LEAST(COALESCE(winner_contact.first_seen, loser_contact.first_seen), COALESCE(loser_contact.first_seen, winner_contact.first_seen)),
    last_seen = GREATEST(COALESCE(winner_contact.last_seen, loser_contact.last_seen), COALESCE(loser_contact.last_seen, winner_contact.last_seen)),
    sales_id = COALESCE(winner_contact.sales_id, loser_contact.sales_id),
    tags = merged_tags
  WHERE id = winner_id;

  -- 6. Delete loser contact
  DELETE FROM contacts WHERE id = loser_id;

  RETURN winner_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."lowercase_email_jsonb"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.email_jsonb IS NOT NULL THEN
    NEW.email_jsonb = COALESCE((
      SELECT jsonb_agg(
        jsonb_set(elem, '{email}', to_jsonb(LOWER(elem->>'email')))
      )
      FROM jsonb_array_elements(NEW.email_jsonb) AS elem
    ), '[]'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."set_sales_id_default"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.sales_id IS NULL THEN
    SELECT id INTO NEW.sales_id FROM sales WHERE user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "private"."is_workspace_member"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    select exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = target_workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    );
    $$;

CREATE OR REPLACE FUNCTION "private"."has_workspace_role"("target_workspace_id" "uuid", "allowed_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    select exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = target_workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role = any(allowed_roles)
    );
    $$;

CREATE OR REPLACE FUNCTION "private"."can_write_workspace"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    select private.has_workspace_role(target_workspace_id, array['owner', 'admin', 'editor']::text[]);
    $$;

CREATE OR REPLACE FUNCTION "private"."jsonb_get_dot_path"("document" "jsonb", "dot_path" "text") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
    select document #> string_to_array(dot_path, '.');
    $$;

CREATE OR REPLACE FUNCTION "private"."calculate_company_list_manifest_hash"("target_workspace_id" "uuid", "target_company_list_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
    select encode(
      extensions.digest(
        string_agg(
          clm.company_id::text || '|' ||
          coalesce(clm.source_record_id::text, '~') || '|' ||
          clm.membership_status || '|' ||
          to_char(
            clm.updated_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US'
          ),
          E'\n' order by clm.company_id
        ),
        'sha256'
      ),
      'hex'
    )
    from public.company_list_members clm
    where clm.workspace_id = target_workspace_id
      and clm.company_list_id = target_company_list_id;
    $$;

CREATE OR REPLACE FUNCTION "private"."create_workspace_owner_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    begin
      insert into public.workspace_members (
        workspace_id,
        user_id,
        role,
        status,
        joined_at
      ) values (
        new.id,
        new.owner_user_id,
        'owner',
        'active',
        now()
      );
      return new;
    end;
    $$;

CREATE OR REPLACE FUNCTION "private"."prevent_workspace_owner_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
    begin
      if new.owner_user_id is distinct from old.owner_user_id then
        raise exception using
          errcode = '42501',
          message = 'workspace ownership must be transferred through an audited administrative workflow';
      end if;
      return new;
    end;
    $$;

CREATE OR REPLACE FUNCTION "private"."prevent_workspace_reassignment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
    begin
      if new.workspace_id is distinct from old.workspace_id then
        raise exception using
          errcode = '42501',
          message = 'workspace_id is immutable';
      end if;
      return new;
    end;
    $$;

CREATE OR REPLACE FUNCTION "private"."prevent_published_version_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
    begin
      if old.status = 'published' then
        raise exception using
          errcode = '42501',
          message = 'published versions are immutable; create a new draft version';
      end if;
      return new;
    end;
    $$;

CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
    begin
      new.updated_at := now();
      return new;
    end;
    $$;

CREATE OR REPLACE FUNCTION "public"."prepare_company_record"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
    declare
      canonical_normalized_name text;
    begin
      new.name := btrim(new.name);
      canonical_normalized_name := lower(
        regexp_replace(new.name, '[[:space:]（）()·._-]+', '', 'g')
      );
      new.normalized_name := canonical_normalized_name;

      if new.unified_social_credit_code is not null then
        new.unified_social_credit_code := upper(btrim(new.unified_social_credit_code::text));
      end if;

      if new.unified_social_credit_code is not null then
        new.deduplication_key := 'uscc:' || new.unified_social_credit_code::text;
      else
        new.deduplication_key := coalesce(
          nullif(btrim(new.deduplication_key), ''),
          'name:' || md5(canonical_normalized_name)
        );
      end if;
      return new;
    end;
    $$;

CREATE OR REPLACE FUNCTION "public"."initialize_workbench_workspace"(
    "p_workspace_name" "text",
    "p_workspace_slug" "text" DEFAULT NULL::"text"
) RETURNS TABLE(
    "workspace_id" "uuid",
    "created" boolean,
    "qcc_connection_id" "uuid",
    "huoke_connection_id" "uuid",
    "file_connection_id" "uuid",
    "default_rule_set_id" "uuid"
)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    declare
      actor_id uuid := auth.uid();
      normalized_name text := nullif(btrim(p_workspace_name), '');
      normalized_slug text;
      existing_owner_id uuid;
      initialized_workspace_id uuid;
      initialized_created boolean := false;
      qcc_mapping_set_id uuid;
      qcc_mapping_version_id uuid;
      huoke_mapping_set_id uuid;
      huoke_mapping_version_id uuid;
      initialized_qcc_connection_id uuid;
      initialized_huoke_connection_id uuid;
      initialized_file_connection_id uuid;
      initialized_web_connection_id uuid;
      initialized_rule_set_id uuid;
    begin
      if actor_id is null then
        raise exception using errcode = '42501', message = 'authentication required';
      end if;
      if normalized_name is null then
        raise exception using errcode = '22023', message = 'workspace name is required';
      end if;

      if p_workspace_slug is null or btrim(p_workspace_slug) = '' then
        select w.id, w.slug::text
          into initialized_workspace_id, normalized_slug
        from public.workspaces w
        where w.owner_user_id = actor_id
          and w.status = 'active'
        order by w.created_at, w.id
        limit 1;

        if initialized_workspace_id is null then
          normalized_slug := 'workspace-' || substr(
            encode(extensions.digest(actor_id::text, 'sha256'), 'hex'),
            1,
            24
          );
        end if;
      else
        normalized_slug := lower(btrim(p_workspace_slug));
      end if;

      if length(normalized_slug) not between 2 and 63
         or normalized_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
        raise exception using errcode = '22023', message = 'invalid workspace slug';
      end if;

      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'workbench-initialize:' || actor_id::text || ':' || normalized_slug,
          0
        )
      );

      select w.id, w.owner_user_id
        into initialized_workspace_id, existing_owner_id
      from public.workspaces w
      where w.slug = normalized_slug
      limit 1;

      if initialized_workspace_id is not null and existing_owner_id <> actor_id then
        raise exception using errcode = '23505', message = 'workspace slug is unavailable';
      end if;

      if initialized_workspace_id is null then
        insert into public.workspaces (name, slug, owner_user_id)
        values (normalized_name, normalized_slug, actor_id)
        returning id into initialized_workspace_id;
        initialized_created := true;
      end if;

      insert into public.workspace_members (
        workspace_id, user_id, role, status, joined_at
      ) values (
        initialized_workspace_id, actor_id, 'owner', 'active', now()
      )
      on conflict on constraint workspace_members_workspace_user_key do update set
        role = 'owner',
        status = 'active',
        joined_at = coalesce(public.workspace_members.joined_at, excluded.joined_at),
        updated_at = now();

      insert into public.field_mapping_sets (
        workspace_id, provider, name, description, status, is_locked,
        current_version_number, created_by
      ) values (
        initialized_workspace_id,
        'qcc',
        '企查查工商字段映射（系统）',
        '内置企查查 CLI 工商信息到 Canonical v1 的已审阅映射。',
        'active',
        true,
        1,
        actor_id
      )
      on conflict on constraint field_mapping_sets_workspace_name_key do nothing
      returning id into qcc_mapping_set_id;

      if qcc_mapping_set_id is null then
        select fms.id into qcc_mapping_set_id
        from public.field_mapping_sets fms
        where fms.workspace_id = initialized_workspace_id
          and fms.provider = 'qcc'
          and fms.name = '企查查工商字段映射（系统）';
      end if;

      insert into public.field_mapping_versions (
        workspace_id, mapping_set_id, version_number, status, is_locked,
        mapping_definition, source_schema_version, canonical_schema_version,
        change_note, created_by, published_at
      ) values (
        initialized_workspace_id,
        qcc_mapping_set_id,
        1,
        'published',
        true,
        jsonb_build_object(
          'contractVersion', '1.0',
          'provider', 'qcc',
          'adapter', 'qichacha',
          'apiProduct', 'qcc-agent-cli/get_company_registration_info',
          'apiVersion', '1.0.10-cn-json',
          'mappingReviewedAt', '2026-08-20',
          'usageScope', 'internal_analysis',
          'fields', jsonb_build_object(
            'companyName', '企业名称',
            'creditCode', '统一社会信用代码',
            'legalPerson', '法定代表人',
            'companyType', '企业类型',
            'registeredCapital', '注册资本',
            'paidInCapital', '实缴资本',
            'establishedDate', '成立日期',
            'approvedDate', '核准日期',
            'registrationAuthority', '登记机关',
            'status', '登记状态',
            'industryL2', '国标行业',
            'regionRaw', '所属地区',
            'personnelScale', '人员规模',
            'insuredCount', '参保人数',
            'registeredAddress', '注册地址',
            'businessScope', '经营范围',
            'sourceUpdatedAt', '核准日期'
          ),
          'units', jsonb_build_object(
            'registeredCapital', 'wan_cny',
            'paidInCapital', 'wan_cny'
          )
        ),
        'qcc-agent-cli-1.0.10-cn-json',
        '1.0',
        '生产内置；仅保存字段契约，不保存密钥。',
        actor_id,
        now()
      )
      on conflict on constraint field_mapping_versions_set_version_key do nothing
      returning id into qcc_mapping_version_id;

      if qcc_mapping_version_id is null then
        select fmv.id into qcc_mapping_version_id
        from public.field_mapping_versions fmv
        where fmv.workspace_id = initialized_workspace_id
          and fmv.mapping_set_id = qcc_mapping_set_id
          and fmv.version_number = 1;
      end if;

      insert into public.field_mapping_sets (
        workspace_id, provider, name, description, status, is_locked,
        current_version_number, created_by
      ) values (
        initialized_workspace_id,
        'huoke_assistant',
        '获客助手企业字段映射（系统）',
        '内置获客助手名单字段到 Canonical v1 的已审阅映射。',
        'active',
        true,
        1,
        actor_id
      )
      on conflict on constraint field_mapping_sets_workspace_name_key do nothing
      returning id into huoke_mapping_set_id;

      if huoke_mapping_set_id is null then
        select fms.id into huoke_mapping_set_id
        from public.field_mapping_sets fms
        where fms.workspace_id = initialized_workspace_id
          and fms.provider = 'huoke_assistant'
          and fms.name = '获客助手企业字段映射（系统）';
      end if;

      insert into public.field_mapping_versions (
        workspace_id, mapping_set_id, version_number, status, is_locked,
        mapping_definition, source_schema_version, canonical_schema_version,
        change_note, created_by, published_at
      ) values (
        initialized_workspace_id,
        huoke_mapping_set_id,
        1,
        'published',
        true,
        jsonb_build_object(
          'contractVersion', '1.0',
          'provider', 'huoke_assistant',
          'adapter', 'kc',
          'sourceSchemaVersion', 'kc-company-search-v1',
          'usageScope', 'internal_analysis',
          'fields', jsonb_build_object(
            'companyName', jsonb_build_object('sourceField', 'companyName', 'unit', 'text'),
            'creditCode', jsonb_build_object('sourceField', 'taxId', 'unit', 'text'),
            'legalPerson', jsonb_build_object('sourceField', 'legalPerson', 'unit', 'text'),
            'legalChangeDate', jsonb_build_object('sourceField', 'legalChangeDate', 'unit', 'date'),
            'legalPersonSharePercent', jsonb_build_object('sourceField', 'stockProportion', 'unit', 'percent'),
            'registeredCapital.valueWan', jsonb_build_object('sourceField', 'capitalNum', 'unit', 'wan_cny'),
            'establishedDate', jsonb_build_object('sourceField', 'establishDate', 'unit', 'date'),
            'status.raw', jsonb_build_object('sourceField', 'status', 'unit', 'text'),
            'status.normalized', jsonb_build_object('sourceField', 'status', 'unit', 'text'),
            'industry.l1', jsonb_build_object('sourceField', 'idy1', 'unit', 'text'),
            'industry.l2', jsonb_build_object('sourceField', 'idy2', 'unit', 'text'),
            'insuredCount', jsonb_build_object('sourceField', 'insuredNum', 'unit', 'person'),
            'registeredAddress', jsonb_build_object('sourceField', 'address', 'unit', 'text'),
            'businessScope', jsonb_build_object('sourceField', 'businessScope', 'unit', 'text'),
            'contact.phoneMasked', jsonb_build_object('sourceField', 'phone', 'unit', 'text', 'redaction', 'masked_only'),
            'contact.emailMasked', jsonb_build_object('sourceField', 'email', 'unit', 'text', 'redaction', 'masked_only'),
            'tags.qualifications', jsonb_build_object('sourceField', 'tag.blue', 'unit', 'text'),
            'tags.operational', jsonb_build_object('sourceField', 'tag.blue', 'unit', 'text'),
            'tags.risk', jsonb_build_object('sourceField', 'tag.red', 'unit', 'text')
          )
        ),
        'kc-company-search-v1',
        '1.0',
        '生产内置；联系方式只允许脱敏值，不保存密钥。',
        actor_id,
        now()
      )
      on conflict on constraint field_mapping_versions_set_version_key do nothing
      returning id into huoke_mapping_version_id;

      if huoke_mapping_version_id is null then
        select fmv.id into huoke_mapping_version_id
        from public.field_mapping_versions fmv
        where fmv.workspace_id = initialized_workspace_id
          and fmv.mapping_set_id = huoke_mapping_set_id
          and fmv.version_number = 1;
      end if;

      insert into public.source_connections (
        workspace_id, provider, name, connection_kind, status,
        connection_config, capabilities, default_mapping_version_id,
        created_by, updated_by
      ) values (
        initialized_workspace_id, 'qcc', '企查查（系统）', 'cli', 'draft',
        '{}'::jsonb, array['company_registration']::text[], qcc_mapping_version_id,
        actor_id, actor_id
      )
      on conflict on constraint source_connections_workspace_name_key do nothing
      returning id into initialized_qcc_connection_id;

      if initialized_qcc_connection_id is null then
        select sc.id into initialized_qcc_connection_id
        from public.source_connections sc
        where sc.workspace_id = initialized_workspace_id
          and sc.name = '企查查（系统）'
          and sc.provider = 'qcc';
      end if;

      insert into public.source_connections (
        workspace_id, provider, name, connection_kind, status,
        connection_config, capabilities, default_mapping_version_id,
        created_by, updated_by
      ) values (
        initialized_workspace_id, 'huoke_assistant', '获客助手（系统）', 'api', 'draft',
        '{}'::jsonb, array['company_search', 'risk_check']::text[], huoke_mapping_version_id,
        actor_id, actor_id
      )
      on conflict on constraint source_connections_workspace_name_key do nothing
      returning id into initialized_huoke_connection_id;

      if initialized_huoke_connection_id is null then
        select sc.id into initialized_huoke_connection_id
        from public.source_connections sc
        where sc.workspace_id = initialized_workspace_id
          and sc.name = '获客助手（系统）'
          and sc.provider = 'huoke_assistant';
      end if;

      insert into public.source_connections (
        workspace_id, provider, name, connection_kind, status,
        connection_config, capabilities, created_by, updated_by
      ) values (
        initialized_workspace_id, 'file_upload', '文件上传（系统）', 'upload', 'ready',
        '{}'::jsonb, array['file_import']::text[], actor_id, actor_id
      )
      on conflict on constraint source_connections_workspace_name_key do nothing
      returning id into initialized_file_connection_id;

      if initialized_file_connection_id is null then
        select sc.id into initialized_file_connection_id
        from public.source_connections sc
        where sc.workspace_id = initialized_workspace_id
          and sc.name = '文件上传（系统）'
          and sc.provider = 'file_upload';
      end if;

      insert into public.source_connections (
        workspace_id, provider, name, connection_kind, status,
        connection_config, capabilities, created_by, updated_by
      ) values (
        initialized_workspace_id,
        'web_search',
        'Ego Lite 公开信息报告（系统）',
        'web_search',
        'draft',
        jsonb_build_object('engine', 'ego_lite'),
        array['web_evidence', 'public_report', 'html_report']::text[],
        actor_id,
        actor_id
      )
      on conflict on constraint source_connections_workspace_name_key do nothing
      returning id into initialized_web_connection_id;

      if initialized_web_connection_id is null then
        select sc.id into initialized_web_connection_id
        from public.source_connections sc
        where sc.workspace_id = initialized_workspace_id
          and sc.provider = 'web_search';
      end if;

      if initialized_qcc_connection_id is null
         or initialized_huoke_connection_id is null
         or initialized_file_connection_id is null
         or initialized_web_connection_id is null then
        raise exception using errcode = '23505', message = 'reserved system connection name is already in use';
      end if;

      insert into public.rule_sets (
        workspace_id, name, description, business_objective, status,
        current_version_number, created_by
      ) values (
        initialized_workspace_id,
        '默认名单规则',
        '可编辑的 RuleTemplate v1 空模板。',
        '由用户按行业场景配置准入、优先级与风险规则。',
        'draft',
        1,
        actor_id
      )
      on conflict on constraint rule_sets_workspace_name_key do nothing
      returning id into initialized_rule_set_id;

      if initialized_rule_set_id is null then
        select rs.id into initialized_rule_set_id
        from public.rule_sets rs
        where rs.workspace_id = initialized_workspace_id
          and rs.name = '默认名单规则';
      end if;

      insert into public.rule_set_versions (
        workspace_id, rule_set_id, version_number, status,
        rule_definition, scoring_definition, canonical_schema_version,
        change_note, created_by
      ) values (
        initialized_workspace_id,
        initialized_rule_set_id,
        1,
        'draft',
        jsonb_build_object(
          'id', 'default-lead-rules-v1',
          'name', '默认名单规则',
          'rules', '[]'::jsonb,
          'thresholds', jsonb_build_object(
            'p1', 75,
            'p2', 50,
            'minimumCompleteness', 60
          )
        ),
        '{}'::jsonb,
        '1.0',
        '初始化可编辑空模板。',
        actor_id
      )
      on conflict on constraint rule_set_versions_set_version_key do nothing;

      return query select
        initialized_workspace_id,
        initialized_created,
        initialized_qcc_connection_id,
        initialized_huoke_connection_id,
        initialized_file_connection_id,
        initialized_rule_set_id;
    end;
    $$;

CREATE OR REPLACE FUNCTION "public"."configure_source_connection"(
    "p_workspace_id" "uuid",
    "p_connection_id" "uuid",
    "p_provider" "text",
    "p_name" "text",
    "p_secret_reference" "text",
    "p_connection_config" "jsonb"
) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    declare
      actor_id uuid := auth.uid();
      requested_provider text := lower(btrim(coalesce(p_provider, '')));
      requested_name text := btrim(coalesce(p_name, ''));
      requested_config jsonb := coalesce(p_connection_config, '{}'::jsonb);
      normalized_config jsonb;
      normalized_secret_reference text;
      expected_kind text;
      base_url text;
      existing_connection public.source_connections%rowtype;
    begin
      if actor_id is null then
        raise exception using errcode = '28000', message = 'authentication required';
      end if;

      if p_workspace_id is null or p_connection_id is null then
        raise exception using errcode = '22023', message = 'workspace and connection ids are required';
      end if;

      if not private.has_workspace_role(
        p_workspace_id,
        array['owner', 'admin']::text[]
      ) then
        raise exception using errcode = '42501', message = 'workspace owner or admin required';
      end if;

      if requested_provider not in ('qcc', 'huoke_assistant', 'file_upload', 'web_search') then
        raise exception using errcode = '22023', message = 'unsupported source provider';
      end if;

      if requested_name = ''
         or length(requested_name) > 120
         or requested_name ~ '[[:cntrl:]]' then
        raise exception using errcode = '22023', message = 'source connection name is invalid';
      end if;

      if jsonb_typeof(requested_config) <> 'object' then
        raise exception using errcode = '22023', message = 'connection_config must be a JSON object';
      end if;

      if requested_config::text ~* '"(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization|private[_-]?key)"[[:space:]]*:' then
        raise exception using errcode = '22023', message = 'inline credentials are forbidden';
      end if;

      select sc.*
      into existing_connection
      from public.source_connections sc
      where sc.workspace_id = p_workspace_id
        and sc.id = p_connection_id
      for update;

      if not found then
        raise exception using errcode = 'P0002', message = 'source connection not found';
      end if;

      if existing_connection.provider <> requested_provider then
        raise exception using errcode = '22023', message = 'source provider cannot be changed';
      end if;

      case requested_provider
        when 'qcc' then
          expected_kind := 'cli';

          -- The executable and credential are deployment-owned. An empty
          -- browser payload means "leave the server-managed values unchanged".
          if p_secret_reference is not null then
            raise exception using errcode = '22023', message = 'QCC credential is server-managed';
          end if;
          if requested_config <> '{}'::jsonb
             or requested_config::text ~* '"executable"[[:space:]]*:' then
            raise exception using errcode = '22023', message = 'QCC executable is server-managed';
          end if;
          normalized_secret_reference := existing_connection.secret_reference;
          normalized_config := existing_connection.connection_config;

        when 'huoke_assistant' then
          expected_kind := 'api';

          if p_secret_reference is not null
             and p_secret_reference <> 'env://KC_API_KEY' then
            raise exception using errcode = '22023', message = 'KC credential reference must be env://KC_API_KEY';
          end if;

          if exists (
            select 1
            from jsonb_object_keys(requested_config) as key_name
            where key_name <> 'baseUrl'
          ) then
            raise exception using errcode = '22023', message = 'KC connection_config only accepts baseUrl';
          end if;

          normalized_config := '{}'::jsonb;
          if requested_config ? 'baseUrl' then
            if jsonb_typeof(requested_config -> 'baseUrl') <> 'string' then
              raise exception using errcode = '22023', message = 'KC baseUrl must be a string';
            end if;

            base_url := btrim(requested_config ->> 'baseUrl');
            if length(base_url) > 2048
               or base_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$'
               or base_url ~ '[@?#[:space:][:cntrl:]]' then
              raise exception using errcode = '22023', message = 'KC baseUrl must be a credential-free HTTPS origin';
            end if;
            normalized_config := jsonb_build_object(
              'baseUrl', regexp_replace(base_url, '/$', '')
            );
          end if;
          normalized_secret_reference := p_secret_reference;

        when 'web_search' then
          expected_kind := 'web_search';

          if p_secret_reference is not null then
            raise exception using errcode = '22023', message = 'Ego Lite does not accept browser credentials';
          end if;
          if requested_config <> '{}'::jsonb
             and requested_config <> jsonb_build_object('engine', 'ego_lite') then
            raise exception using errcode = '22023', message = 'Ego Lite connection_config only accepts the managed engine identifier';
          end if;
          normalized_secret_reference := null;
          normalized_config := jsonb_build_object('engine', 'ego_lite');

        when 'file_upload' then
          expected_kind := 'upload';

          if p_secret_reference is not null or requested_config <> '{}'::jsonb then
            raise exception using errcode = '22023', message = 'file upload does not accept credentials or connection config';
          end if;
          normalized_secret_reference := null;
          normalized_config := '{}'::jsonb;
      end case;

      update public.source_connections sc
      set name = requested_name,
          connection_kind = expected_kind,
          status = 'draft',
          secret_reference = normalized_secret_reference,
          connection_config = normalized_config,
          last_verified_at = null,
          last_error_code = null,
          updated_by = actor_id
      where sc.workspace_id = p_workspace_id
        and sc.id = p_connection_id;

      return p_connection_id;
    end;
    $$;

CREATE OR REPLACE FUNCTION "public"."configure_provider_priorities"(
    "p_workspace_id" "uuid",
    "p_priorities" "jsonb"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    declare
      actor_id uuid := auth.uid();
      requested jsonb := coalesce(p_priorities, '{}'::jsonb);
      previous_priorities jsonb;
      key_count integer;
      distinct_value_count integer;
    begin
      if actor_id is null then
        raise exception using errcode = '28000', message = 'authentication required';
      end if;

      if p_workspace_id is null then
        raise exception using errcode = '22023', message = 'workspace id is required';
      end if;

      if not private.has_workspace_role(
        p_workspace_id,
        array['owner', 'admin']::text[]
      ) then
        raise exception using errcode = '42501', message = 'workspace owner or admin required';
      end if;

      if jsonb_typeof(requested) <> 'object'
         or not requested ?& array[
           'qichacha',
           'kingdee-credit-kc-assistant',
           'csv-upload'
         ]
         or requested - 'qichacha' - 'kingdee-credit-kc-assistant' - 'csv-upload' <> '{}'::jsonb then
        raise exception using errcode = '22023', message = 'provider priorities must contain exactly the supported providers';
      end if;

      select count(*), count(distinct (entry.value #>> '{}')::integer)
        into key_count, distinct_value_count
      from jsonb_each(requested) as entry
      where jsonb_typeof(entry.value) = 'number'
        and entry.value #>> '{}' ~ '^[0-9]+$'
        and (entry.value #>> '{}')::integer between 0 and 1000;

      if key_count <> 3 or distinct_value_count <> 3 then
        raise exception using errcode = '22023', message = 'provider priority values must be three distinct integers between 0 and 1000';
      end if;

      select coalesce(w.settings -> 'providerPriorities', '{}'::jsonb)
        into previous_priorities
      from public.workspaces w
      where w.id = p_workspace_id
      for update;

      if not found then
        raise exception using errcode = 'P0002', message = 'workspace not found';
      end if;

      update public.workspaces w
      set settings = jsonb_set(
            coalesce(w.settings, '{}'::jsonb),
            '{providerPriorities}',
            requested,
            true
          ),
          updated_at = now()
      where w.id = p_workspace_id;

      insert into public.audit_logs (
        workspace_id,
        actor_type,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        before_data,
        after_data,
        metadata
      ) values (
        p_workspace_id,
        'user',
        actor_id,
        'workspace.provider_priorities.updated',
        'workspace',
        p_workspace_id::text,
        jsonb_build_object('providerPriorities', previous_priorities),
        jsonb_build_object('providerPriorities', requested),
        jsonb_build_object('supported_provider_count', 3)
      );

      return requested;
    end;
    $$;

CREATE OR REPLACE FUNCTION "public"."save_rule_template"(
    "p_workspace_id" "uuid",
    "p_rule_set_id" "uuid",
    "p_name" "text",
    "p_description" "text",
    "p_business_objective" "text",
    "p_rule_definition" "jsonb",
    "p_scoring_definition" "jsonb",
    "p_change_note" "text"
) RETURNS TABLE(
    "rule_set_id" "uuid",
    "rule_version_id" "uuid",
    "version_number" integer,
    "status" "text"
)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    declare
      actor_id uuid := auth.uid();
      normalized_name text := btrim(p_name);
      normalized_description text := nullif(btrim(p_description), '');
      normalized_objective text := btrim(p_business_objective);
      normalized_change_note text := coalesce(
        nullif(btrim(p_change_note), ''),
        '通过统一规则接口发布。'
      );
      effective_rule_definition jsonb;
      effective_scoring_definition jsonb := coalesce(
        p_scoring_definition,
        '{"engineVersion":"lead-rules-v1"}'::jsonb
      );
      target_rule_set public.rule_sets%rowtype;
      latest_published_version public.rule_set_versions%rowtype;
      persisted_rule_version_id uuid;
      next_version_number integer;
      threshold_p1 numeric;
      threshold_p2 numeric;
      threshold_minimum_completeness numeric;
      lead_rule jsonb;
      eligibility_maximum_depth integer;
      eligibility_condition_count integer;
      eligibility_invalid_node_count integer;
      eligibility_duplicate_id_count integer;
    begin
      if p_workspace_id is null
         or actor_id is null
         or not private.can_write_workspace(p_workspace_id) then
        raise exception using
          errcode = '42501',
          message = 'workspace editor role is required to save rule templates';
      end if;

      if normalized_name is null
         or normalized_name = ''
         or length(normalized_name) > 160
         or normalized_name ~ '[[:cntrl:]]' then
        raise exception using errcode = '22023', message = 'rule template name is invalid';
      end if;
      if normalized_description is not null
         and length(normalized_description) > 4000 then
        raise exception using errcode = '22023', message = 'rule template description is invalid';
      end if;
      if normalized_objective is null
         or normalized_objective = ''
         or length(normalized_objective) > 2000 then
        raise exception using errcode = '22023', message = 'rule template business objective is invalid';
      end if;
      if length(normalized_change_note) > 1000 then
        raise exception using errcode = '22023', message = 'rule template change note is invalid';
      end if;

      if jsonb_typeof(p_rule_definition) is distinct from 'object' then
        raise exception using errcode = '22023', message = 'rule definition must be a JSON object';
      end if;
      if jsonb_typeof(effective_scoring_definition) is distinct from 'object' then
        raise exception using errcode = '22023', message = 'scoring definition must be a JSON object';
      end if;
      if octet_length(p_rule_definition::text) > 262144
         or octet_length(effective_scoring_definition::text) > 65536 then
        raise exception using errcode = '22023', message = 'rule template JSON is too large';
      end if;
      if (p_rule_definition::text || effective_scoring_definition::text)
           ~* '"(api[_-]?key|access[_-]?token|refresh[_-]?token|cloud[_-]?token|token|client[_-]?secret|secret[_-]?reference|secret|password|authorization|private[_-]?key|credential|cookie)"[[:space:]]*:' then
        raise exception using errcode = '22023', message = 'rule template contains a forbidden secret-like key';
      end if;
      if effective_scoring_definition ? 'engineVersion'
         and (
           jsonb_typeof(effective_scoring_definition -> 'engineVersion') is distinct from 'string'
           or length(btrim(effective_scoring_definition ->> 'engineVersion')) not between 1 and 80
         ) then
        raise exception using errcode = '22023', message = 'scoring engineVersion is invalid';
      end if;

      if p_rule_set_id is null then
        -- A workspace/name advisory lock makes concurrent create-or-append
        -- calls deterministic before the row exists and has a row lock.
        perform pg_advisory_xact_lock(
          hashtextextended(
            p_workspace_id::text || ':rule-set:' || lower(normalized_name),
            0
          )
        );

        select rs.*
          into target_rule_set
        from public.rule_sets rs
        where rs.workspace_id = p_workspace_id
          and rs.name = normalized_name
        for update;

        if target_rule_set.id is null then
          insert into public.rule_sets (
            workspace_id,
            name,
            description,
            business_objective,
            status,
            current_version_number,
            created_by
          ) values (
            p_workspace_id,
            normalized_name,
            normalized_description,
            normalized_objective,
            'draft',
            null,
            actor_id
          )
          on conflict on constraint rule_sets_workspace_name_key do nothing
          returning * into target_rule_set;

          if target_rule_set.id is null then
            select rs.*
              into target_rule_set
            from public.rule_sets rs
            where rs.workspace_id = p_workspace_id
              and rs.name = normalized_name
            for update;
          end if;
        end if;
      else
        select rs.*
          into target_rule_set
        from public.rule_sets rs
        where rs.workspace_id = p_workspace_id
          and rs.id = p_rule_set_id
        for update;

        if target_rule_set.id is null then
          raise exception using errcode = 'P0002', message = 'rule set not found in workspace';
        end if;
      end if;

      if target_rule_set.id is null then
        raise exception using errcode = '23505', message = 'rule set name could not be reserved';
      end if;
      if target_rule_set.status = 'archived' then
        raise exception using errcode = '55000', message = 'archived rule set cannot receive new versions';
      end if;

      -- The database owns the stable template identity and display name. This
      -- lets a single call create both the rule set and its first version.
      effective_rule_definition := p_rule_definition || jsonb_build_object(
        'id', target_rule_set.id::text,
        'name', normalized_name
      );
      if octet_length(effective_rule_definition::text) > 262144 then
        raise exception using errcode = '22023', message = 'rule template JSON is too large';
      end if;

      if jsonb_typeof(effective_rule_definition -> 'rules') is distinct from 'array' then
        raise exception using errcode = '22023', message = 'RuleTemplate v1 rules must be an array with at most 200 entries';
      end if;
      if jsonb_array_length(effective_rule_definition -> 'rules') > 200 then
        raise exception using errcode = '22023', message = 'RuleTemplate v1 rules must be an array with at most 200 entries';
      end if;
      if jsonb_typeof(effective_rule_definition -> 'thresholds') is distinct from 'object'
         or jsonb_typeof(effective_rule_definition #> '{thresholds,p1}') is distinct from 'number'
         or jsonb_typeof(effective_rule_definition #> '{thresholds,p2}') is distinct from 'number' then
        raise exception using errcode = '22023', message = 'RuleTemplate v1 thresholds are invalid';
      end if;

      threshold_p1 := (effective_rule_definition #>> '{thresholds,p1}')::numeric;
      threshold_p2 := (effective_rule_definition #>> '{thresholds,p2}')::numeric;
      if threshold_p1 < 0
         or threshold_p1 > 100
         or threshold_p2 < 0
         or threshold_p2 > 100
         or threshold_p1 < threshold_p2 then
        raise exception using errcode = '22023', message = 'RuleTemplate v1 thresholds are invalid';
      end if;

      if not ((effective_rule_definition -> 'thresholds') ? 'minimumCompleteness') then
        effective_rule_definition := jsonb_set(
          effective_rule_definition,
          '{thresholds,minimumCompleteness}',
          '60'::jsonb,
          true
        );
      end if;
      if jsonb_typeof(effective_rule_definition #> '{thresholds,minimumCompleteness}') is distinct from 'number' then
        raise exception using errcode = '22023', message = 'RuleTemplate v1 minimum completeness is invalid';
      end if;
      threshold_minimum_completeness := (
        effective_rule_definition #>> '{thresholds,minimumCompleteness}'
      )::numeric;
      if threshold_minimum_completeness < 0 or threshold_minimum_completeness > 100 then
        raise exception using errcode = '22023', message = 'RuleTemplate v1 minimum completeness is invalid';
      end if;

      for lead_rule in
        select item.value
        from jsonb_array_elements(effective_rule_definition -> 'rules') with ordinality item(value, ordinal)
        order by item.ordinal
      loop
        if jsonb_typeof(lead_rule) is distinct from 'object'
           or length(btrim(coalesce(lead_rule ->> 'id', ''))) not between 1 and 120
           or length(btrim(coalesce(lead_rule ->> 'label', ''))) not between 1 and 300
           or length(btrim(coalesce(lead_rule ->> 'field', ''))) not between 1 and 300
           or coalesce(lead_rule ->> 'kind', '') not in ('priority', 'risk_gate')
           or coalesce(lead_rule ->> 'operator', '') not in (
             'eq', 'not_eq', 'gte', 'lte', 'contains', 'not_contains',
             'in', 'not_in', 'present', 'absent', 'intersects'
           ) then
          raise exception using errcode = '22023', message = 'RuleTemplate v1 contains an invalid lead rule';
        end if;
        if lead_rule ? 'weight' then
          if jsonb_typeof(lead_rule -> 'weight') is distinct from 'number' then
            raise exception using errcode = '22023', message = 'RuleTemplate v1 lead rule weight is invalid';
          end if;
          if (lead_rule ->> 'weight')::numeric < 0 then
            raise exception using errcode = '22023', message = 'RuleTemplate v1 lead rule weight is invalid';
          end if;
        end if;
        if lead_rule ? 'onMatch'
           and coalesce(lead_rule ->> 'onMatch', '') not in ('score', 'review', 'block') then
          raise exception using errcode = '22023', message = 'RuleTemplate v1 lead rule onMatch is invalid';
        end if;
        if lead_rule ? 'missingPolicy'
           and coalesce(lead_rule ->> 'missingPolicy', '') not in ('review', 'pass', 'fail') then
          raise exception using errcode = '22023', message = 'RuleTemplate v1 lead rule missingPolicy is invalid';
        end if;
        if lead_rule ? 'enabled'
           and jsonb_typeof(lead_rule -> 'enabled') is distinct from 'boolean' then
          raise exception using errcode = '22023', message = 'RuleTemplate v1 lead rule enabled is invalid';
        end if;
      end loop;

      if effective_rule_definition ? 'eligibility' then
        if jsonb_typeof(effective_rule_definition -> 'eligibility') is distinct from 'object'
           or jsonb_typeof(effective_rule_definition #> '{eligibility,root}') is distinct from 'object'
           or coalesce(effective_rule_definition #>> '{eligibility,onNoMatch}', '') <> 'exclude'
           or coalesce(effective_rule_definition #>> '{eligibility,onUnknown}', '') not in ('review', 'exclude', 'pass')
           or coalesce(effective_rule_definition #>> '{eligibility,root,combinator}', '') not in ('and', 'or')
           or jsonb_typeof(effective_rule_definition #> '{eligibility,root,rules}') is distinct from 'array' then
          raise exception using errcode = '22023', message = 'RuleTemplate v1 eligibility root is invalid';
        end if;
        if jsonb_array_length(effective_rule_definition #> '{eligibility,root,rules}') = 0 then
          raise exception using errcode = '22023', message = 'RuleTemplate v1 eligibility root is invalid';
        end if;

        with recursive eligibility_nodes(node, depth) as (
          select effective_rule_definition #> '{eligibility,root}', 1
          union all
          select child.value, parent.depth + 1
          from eligibility_nodes parent
          cross join lateral jsonb_array_elements(
            case
              when jsonb_typeof(parent.node -> 'rules') = 'array'
                then parent.node -> 'rules'
              else '[]'::jsonb
            end
          ) child
          where jsonb_typeof(parent.node) = 'object'
            and parent.node ? 'combinator'
        )
        select
          coalesce(max(depth) filter (
            where jsonb_typeof(node) = 'object' and node ? 'combinator'
          ), 0)::integer,
          count(*) filter (
            where not (jsonb_typeof(node) = 'object' and node ? 'combinator')
          )::integer,
          coalesce(sum(
            case
              when jsonb_typeof(node) is distinct from 'object' then 1
              when length(btrim(coalesce(node ->> 'id', ''))) not between 1 and 120 then 1
              when node ? 'combinator' then
                case
                  when coalesce(node ->> 'combinator', '') not in ('and', 'or') then 1
                  when jsonb_typeof(node -> 'rules') is distinct from 'array' then 1
                  when jsonb_array_length(node -> 'rules') = 0 then 1
                  else 0
                end
              else
                case
                  when length(btrim(coalesce(node ->> 'label', ''))) not between 1 and 300 then 1
                  when length(btrim(coalesce(node ->> 'field', ''))) not between 1 and 300 then 1
                  when coalesce(node ->> 'operator', '') not in (
                    'eq', 'not_eq', 'gte', 'lte', 'contains', 'not_contains',
                    'in', 'not_in', 'present', 'absent', 'intersects'
                  ) then 1
                  when coalesce(node ->> 'missingPolicy', '') not in ('review', 'pass', 'fail') then 1
                  when jsonb_typeof(node -> 'enabled') is distinct from 'boolean' then 1
                  else 0
                end
            end
          ), 0)::integer,
          (
            count(*) filter (
              where length(btrim(coalesce(node ->> 'id', ''))) between 1 and 120
            ) - count(distinct node ->> 'id') filter (
              where length(btrim(coalesce(node ->> 'id', ''))) between 1 and 120
            )
          )::integer
          into
            eligibility_maximum_depth,
            eligibility_condition_count,
            eligibility_invalid_node_count,
            eligibility_duplicate_id_count
        from eligibility_nodes;

        if eligibility_maximum_depth > 5 then
          raise exception using errcode = '22023', message = 'RuleTemplate v1 eligibility exceeds 5 levels';
        end if;
        if eligibility_condition_count > 200 then
          raise exception using errcode = '22023', message = 'RuleTemplate v1 eligibility exceeds 200 conditions';
        end if;
        if eligibility_invalid_node_count > 0 then
          raise exception using errcode = '22023', message = 'RuleTemplate v1 eligibility contains an invalid node';
        end if;
        if eligibility_duplicate_id_count > 0 then
          raise exception using errcode = '22023', message = 'RuleTemplate v1 eligibility node IDs must be unique';
        end if;
      end if;

      select rsv.*
        into latest_published_version
      from public.rule_set_versions rsv
      where rsv.workspace_id = p_workspace_id
        and rsv.rule_set_id = target_rule_set.id
        and rsv.status = 'published'
      order by rsv.version_number desc
      limit 1;

      -- Exact full-request retries are idempotent. Metadata and the change
      -- note participate because they are business-significant version input.
      if latest_published_version.id is not null
         and latest_published_version.rule_definition = effective_rule_definition
         and latest_published_version.scoring_definition = effective_scoring_definition
         and latest_published_version.change_note is not distinct from normalized_change_note
         and target_rule_set.name = normalized_name
         and target_rule_set.description is not distinct from normalized_description
         and target_rule_set.business_objective is not distinct from normalized_objective then
        update public.rule_sets rs
        set name = normalized_name,
            description = normalized_description,
            business_objective = normalized_objective,
            status = 'active',
            current_version_number = latest_published_version.version_number
        where rs.workspace_id = p_workspace_id
          and rs.id = target_rule_set.id;

        return query select
          target_rule_set.id,
          latest_published_version.id,
          latest_published_version.version_number,
          'published'::text;
        return;
      end if;

      select coalesce(max(rsv.version_number), 0) + 1
        into next_version_number
      from public.rule_set_versions rsv
      where rsv.workspace_id = p_workspace_id
        and rsv.rule_set_id = target_rule_set.id;

      insert into public.rule_set_versions (
        workspace_id,
        rule_set_id,
        version_number,
        status,
        rule_definition,
        scoring_definition,
        canonical_schema_version,
        change_note,
        created_by,
        published_at
      ) values (
        p_workspace_id,
        target_rule_set.id,
        next_version_number,
        'published',
        effective_rule_definition,
        effective_scoring_definition,
        '1.0',
        normalized_change_note,
        actor_id,
        now()
      )
      returning id into persisted_rule_version_id;

      update public.rule_sets rs
      set name = normalized_name,
          description = normalized_description,
          business_objective = normalized_objective,
          status = 'active',
          current_version_number = next_version_number
      where rs.workspace_id = p_workspace_id
        and rs.id = target_rule_set.id;

      insert into public.audit_logs (
        workspace_id,
        actor_type,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        after_data,
        metadata
      ) values (
        p_workspace_id,
        'user',
        actor_id,
        'rule_template.published',
        'rule_set_version',
        persisted_rule_version_id::text,
        jsonb_build_object(
          'rule_set_id', target_rule_set.id,
          'version_number', next_version_number,
          'status', 'published'
        ),
        jsonb_build_object(
          'canonical_schema_version', '1.0',
          'rule_name', normalized_name
        )
      );

      return query select
        target_rule_set.id,
        persisted_rule_version_id,
        next_version_number,
        'published'::text;
    end;
    $$;

CREATE OR REPLACE FUNCTION "public"."enqueue_workbench_job"(
    "p_workspace_id" "uuid",
    "p_action" "text",
    "p_payload" "jsonb",
    "p_idempotency_key" "text"
) RETURNS TABLE("job_id" "uuid", "status" "text", "job_type" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    declare
      normalized_action text := lower(btrim(p_action));
      normalized_payload jsonb := coalesce(p_payload, '{}'::jsonb);
      normalized_idempotency_key text := btrim(p_idempotency_key);
      created_job_id uuid;
      created_status text;
      connection_id uuid;
      query_id uuid;
      mapping_id uuid;
      list_id uuid;
      version_id uuid;
      run_id uuid;
      object_path text;
      requested_job_kind text;
      computed_manifest_hash text;
      query_kind_value text;
      query_text_value text;
      query_criteria jsonb;
      query_criteria_hash text;
      query_idempotency_key text;
    begin
      if auth.uid() is null then
        raise exception using errcode = '42501', message = 'authentication required';
      end if;

      if not private.can_write_workspace(p_workspace_id) then
        raise exception using errcode = '42501', message = 'workspace editor role required';
      end if;

      if jsonb_typeof(normalized_payload) <> 'object' then
        raise exception using errcode = '22023', message = 'payload must be a JSON object';
      end if;

      if normalized_payload::text ~* '"(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization|private[_-]?key)"[[:space:]]*:' then
        raise exception using errcode = '22023', message = 'payload must not contain inline credentials';
      end if;

      if normalized_idempotency_key is null
         or length(normalized_idempotency_key) not between 16 and 128
         or normalized_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
        raise exception using errcode = '22023', message = 'invalid idempotency key';
      end if;

      if normalized_action in ('start_ingestion', 'test_connection') then
        connection_id := nullif(normalized_payload ->> 'source_connection_id', '')::uuid;
        query_id := nullif(normalized_payload ->> 'source_query_id', '')::uuid;
        mapping_id := nullif(normalized_payload ->> 'mapping_version_id', '')::uuid;
        object_path := nullif(normalized_payload ->> 'input_object_path', '');

        if connection_id is null then
          raise exception using errcode = '22023', message = 'source_connection_id is required';
        end if;

        if object_path is not null
           and object_path not like p_workspace_id::text || '/' || auth.uid()::text || '/%' then
          raise exception using errcode = '42501', message = 'input object path must be scoped to workspace_id/user_id';
        end if;

        if normalized_action = 'test_connection' then
          requested_job_kind := 'connection_test';
        else
          requested_job_kind := coalesce(nullif(normalized_payload ->> 'job_kind', ''), 'import');
          if requested_job_kind not in ('query', 'import', 'enrich', 'refresh') then
            raise exception using errcode = '22023', message = 'unsupported ingestion job_kind';
          end if;
        end if;

        -- The GUI submits a complete query definition in input_params and does
        -- not need to create source_queries itself. Keep the query and its job
        -- in the same transaction so every provider call has a durable,
        -- reproducible description of what was requested.
        if normalized_action = 'start_ingestion'
           and requested_job_kind = 'query'
           and query_id is null then
          query_kind_value := nullif(
            btrim(normalized_payload #>> '{input_params,query_kind}'),
            ''
          );
          query_text_value := nullif(
            btrim(normalized_payload #>> '{input_params,query_text}'),
            ''
          );
          query_criteria := coalesce(
            normalized_payload #> '{input_params,criteria}',
            '{}'::jsonb
          );

          if query_kind_value is null then
            raise exception using errcode = '22023', message = 'query_kind is required for query ingestion';
          end if;
          if jsonb_typeof(query_criteria) <> 'object' then
            raise exception using errcode = '22023', message = 'query criteria must be a JSON object';
          end if;

          query_criteria_hash := encode(
            extensions.digest(query_criteria::text, 'sha256'),
            'hex'
          );
          query_idempotency_key := 'source-query:' || encode(
            extensions.digest(
              p_workspace_id::text || '|' || normalized_idempotency_key,
              'sha256'
            ),
            'hex'
          );

          insert into public.source_queries (
            workspace_id,
            source_connection_id,
            query_kind,
            query_text,
            criteria,
            criteria_hash,
            status,
            idempotency_key,
            requested_by
          ) values (
            p_workspace_id,
            connection_id,
            query_kind_value,
            query_text_value,
            query_criteria,
            query_criteria_hash,
            'running',
            query_idempotency_key,
            auth.uid()
          )
          on conflict (workspace_id, idempotency_key) do nothing
          returning id into query_id;

          if query_id is null then
            select sq.id
              into query_id
            from public.source_queries sq
            where sq.workspace_id = p_workspace_id
              and sq.idempotency_key = query_idempotency_key;
          end if;

          if query_id is null then
            raise exception using errcode = 'P0002', message = 'source query could not be created or reused';
          end if;
        end if;

        insert into public.ingestion_jobs (
          workspace_id,
          source_connection_id,
          source_query_id,
          mapping_version_id,
          job_kind,
          status,
          idempotency_key,
          input_object_path,
          input_params,
          requested_by
        ) values (
          p_workspace_id,
          connection_id,
          query_id,
          mapping_id,
          requested_job_kind,
          'queued',
          normalized_idempotency_key,
          object_path,
          coalesce(normalized_payload -> 'input_params', '{}'::jsonb),
          auth.uid()
        )
        on conflict (workspace_id, idempotency_key) do nothing
        returning id, ingestion_jobs.status into created_job_id, created_status;

        if created_job_id is null then
          select ij.id, ij.status
            into created_job_id, created_status
          from public.ingestion_jobs ij
          where ij.workspace_id = p_workspace_id
            and ij.idempotency_key = normalized_idempotency_key;
        end if;

        return query select created_job_id, created_status, 'ingestion_job'::text;
        return;
      end if;

      if normalized_action = 'run_rules' then
        version_id := nullif(normalized_payload ->> 'rule_version_id', '')::uuid;
        list_id := nullif(normalized_payload ->> 'company_list_id', '')::uuid;

        if version_id is null or list_id is null then
          raise exception using errcode = '22023', message = 'rule_version_id and company_list_id are required';
        end if;

        if nullif(normalized_payload ->> 'engine_version', '') is null then
          raise exception using errcode = '22023', message = 'engine_version is required';
        end if;

        computed_manifest_hash := private.calculate_company_list_manifest_hash(
          p_workspace_id,
          list_id
        );

        if computed_manifest_hash is null then
          raise exception using errcode = '22023', message = 'company list has no members';
        end if;

        insert into public.rule_runs (
          workspace_id,
          rule_version_id,
          company_list_id,
          run_mode,
          status,
          engine_version,
          input_manifest_hash,
          run_config,
          idempotency_key,
          requested_by
        ) values (
          p_workspace_id,
          version_id,
          list_id,
          coalesce(nullif(normalized_payload ->> 'run_mode', ''), 'full'),
          'queued',
          normalized_payload ->> 'engine_version',
          computed_manifest_hash,
          coalesce(normalized_payload -> 'run_config', '{}'::jsonb),
          normalized_idempotency_key,
          auth.uid()
        )
        on conflict (workspace_id, idempotency_key) do nothing
        returning id, rule_runs.status into created_job_id, created_status;

        if created_job_id is null then
          select rr.id, rr.status
            into created_job_id, created_status
          from public.rule_runs rr
          where rr.workspace_id = p_workspace_id
            and rr.idempotency_key = normalized_idempotency_key;
        end if;

        return query select created_job_id, created_status, 'rule_run'::text;
        return;
      end if;

      if normalized_action = 'create_export' then
        list_id := nullif(normalized_payload ->> 'company_list_id', '')::uuid;
        run_id := nullif(normalized_payload ->> 'rule_run_id', '')::uuid;

        if list_id is null and run_id is null then
          raise exception using errcode = '22023', message = 'company_list_id or rule_run_id is required';
        end if;

        if nullif(normalized_payload ->> 'export_format', '') is null then
          raise exception using errcode = '22023', message = 'export_format is required';
        end if;

        insert into public.exports (
          workspace_id,
          company_list_id,
          rule_run_id,
          export_format,
          status,
          selected_fields,
          filter_definition,
          idempotency_key,
          requested_by
        ) values (
          p_workspace_id,
          list_id,
          run_id,
          lower(normalized_payload ->> 'export_format'),
          'queued',
          coalesce(
            array(select jsonb_array_elements_text(normalized_payload -> 'selected_fields')),
            '{}'::text[]
          ),
          coalesce(normalized_payload -> 'filter_definition', '{}'::jsonb),
          normalized_idempotency_key,
          auth.uid()
        )
        on conflict (workspace_id, idempotency_key) do nothing
        returning id, exports.status into created_job_id, created_status;

        if created_job_id is null then
          select e.id, e.status
            into created_job_id, created_status
          from public.exports e
          where e.workspace_id = p_workspace_id
            and e.idempotency_key = normalized_idempotency_key;
        end if;

        return query select created_job_id, created_status, 'export'::text;
        return;
      end if;

      raise exception using errcode = '22023', message = 'unsupported workbench action';
    end;
    $$;

CREATE OR REPLACE FUNCTION "public"."claim_next_workbench_job"("p_worker_id" "text")
    RETURNS TABLE("job_type" "text", "job_id" "uuid", "workspace_id" "uuid", "payload" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    declare
      normalized_worker_id text := btrim(p_worker_id);
      ingestion_candidate_id uuid;
      ingestion_candidate_at timestamp with time zone;
      rule_candidate_id uuid;
      rule_candidate_at timestamp with time zone;
      export_candidate_id uuid;
      export_candidate_at timestamp with time zone;
      selected_type text;
      selected_id uuid;
      selected_workspace_id uuid;
      selected_payload jsonb;
    begin
      if normalized_worker_id is null
         or length(normalized_worker_id) not between 3 and 200 then
        raise exception using errcode = '22023', message = 'invalid worker id';
      end if;

      select ij.id, ij.requested_at
        into ingestion_candidate_id, ingestion_candidate_at
      from public.ingestion_jobs ij
      where ij.status = 'queued'
      order by ij.requested_at, ij.id
      for update skip locked
      limit 1;

      select rr.id, rr.requested_at
        into rule_candidate_id, rule_candidate_at
      from public.rule_runs rr
      where rr.status = 'queued'
      order by rr.requested_at, rr.id
      for update skip locked
      limit 1;

      select e.id, e.requested_at
        into export_candidate_id, export_candidate_at
      from public.exports e
      where e.status = 'queued'
      order by e.requested_at, e.id
      for update skip locked
      limit 1;

      select candidate_type, candidate_id
        into selected_type, selected_id
      from (
        values
          ('ingestion_job'::text, ingestion_candidate_id, ingestion_candidate_at, 1),
          ('rule_run'::text, rule_candidate_id, rule_candidate_at, 2),
          ('export'::text, export_candidate_id, export_candidate_at, 3)
      ) as candidates(candidate_type, candidate_id, requested_at, priority)
      where candidate_id is not null
      order by requested_at, priority
      limit 1;

      if selected_id is null then
        return;
      end if;

      if selected_type = 'ingestion_job' then
        update public.ingestion_jobs ij
        set status = 'running',
            worker_id = normalized_worker_id,
            claimed_at = now(),
            started_at = coalesce(ij.started_at, now()),
            attempt_count = ij.attempt_count + 1
        where ij.id = selected_id
          and ij.status = 'queued'
        returning
          ij.workspace_id,
          jsonb_build_object(
            'source_connection_id', ij.source_connection_id,
            'source_query_id', ij.source_query_id,
            'mapping_version_id', ij.mapping_version_id,
            'job_kind', ij.job_kind,
            'input_object_path', ij.input_object_path,
            'input_params', ij.input_params,
            'requested_by', ij.requested_by,
            'attempt_count', ij.attempt_count
          )
        into selected_workspace_id, selected_payload;
      elsif selected_type = 'rule_run' then
        update public.rule_runs rr
        set status = 'running',
            worker_id = normalized_worker_id,
            claimed_at = now(),
            started_at = coalesce(rr.started_at, now()),
            attempt_count = rr.attempt_count + 1
        where rr.id = selected_id
          and rr.status = 'queued'
        returning
          rr.workspace_id,
          jsonb_build_object(
            'rule_version_id', rr.rule_version_id,
            'company_list_id', rr.company_list_id,
            'run_mode', rr.run_mode,
            'engine_version', rr.engine_version,
            'input_manifest_hash', rr.input_manifest_hash,
            'run_config', rr.run_config,
            'requested_by', rr.requested_by,
            'attempt_count', rr.attempt_count
          )
        into selected_workspace_id, selected_payload;
      else
        update public.exports e
        set status = 'running',
            worker_id = normalized_worker_id,
            claimed_at = now(),
            attempt_count = e.attempt_count + 1
        where e.id = selected_id
          and e.status = 'queued'
        returning
          e.workspace_id,
          jsonb_build_object(
            'company_list_id', e.company_list_id,
            'rule_run_id', e.rule_run_id,
            'export_format', e.export_format,
            'selected_fields', e.selected_fields,
            'filter_definition', e.filter_definition,
            'requested_by', e.requested_by,
            'attempt_count', e.attempt_count
          )
        into selected_workspace_id, selected_payload;
      end if;

      if selected_workspace_id is null then
        return;
      end if;

      insert into public.audit_logs (
        workspace_id,
        actor_type,
        actor_label,
        action,
        entity_type,
        entity_id,
        metadata
      ) values (
        selected_workspace_id,
        'service',
        normalized_worker_id,
        'workbench.job.claimed',
        selected_type,
        selected_id::text,
        jsonb_build_object('worker_id', normalized_worker_id)
      );

      return query
      select selected_type, selected_id, selected_workspace_id, selected_payload;
    end;
    $$;

CREATE OR REPLACE FUNCTION "public"."complete_workbench_job"(
    "p_job_type" "text",
    "p_job_id" "uuid",
    "p_status" "text",
    "p_result" "jsonb",
    "p_error_code" "text",
    "p_error_message" "text"
) RETURNS TABLE("job_type" "text", "job_id" "uuid", "workspace_id" "uuid", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    declare
      normalized_job_type text := lower(btrim(p_job_type));
      normalized_status text := lower(btrim(p_status));
      normalized_result jsonb := coalesce(p_result, '{}'::jsonb);
      completed_workspace_id uuid;
      completed_status text;
      completed_worker_id text;
      completed_source_query_id uuid;
    begin
      if normalized_status = 'succeeded' then
        normalized_status := 'completed';
      end if;

      if jsonb_typeof(normalized_result) <> 'object' then
        raise exception using errcode = '22023', message = 'result must be a JSON object';
      end if;

      if normalized_job_type = 'ingestion_job' then
        if normalized_status not in ('completed', 'partial', 'failed', 'cancelled') then
          raise exception using errcode = '22023', message = 'invalid ingestion completion status';
        end if;

        update public.ingestion_jobs ij
        set status = normalized_status,
            result = normalized_result,
            error_code = p_error_code,
            error_message = p_error_message,
            completed_at = now(),
            received_count = case
              when normalized_result ->> 'received_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'received_count')::integer
              else ij.received_count
            end,
            accepted_count = case
              when normalized_result ->> 'accepted_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'accepted_count')::integer
              else ij.accepted_count
            end,
            rejected_count = case
              when normalized_result ->> 'rejected_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'rejected_count')::integer
              else ij.rejected_count
            end
        where ij.id = p_job_id
          and ij.status = 'running'
        returning ij.workspace_id, ij.status, ij.worker_id, ij.source_query_id
          into completed_workspace_id, completed_status, completed_worker_id, completed_source_query_id;
      elsif normalized_job_type = 'rule_run' then
        if normalized_status not in ('completed', 'partial', 'failed', 'cancelled') then
          raise exception using errcode = '22023', message = 'invalid rule completion status';
        end if;

        update public.rule_runs rr
        set status = normalized_status,
            result = normalized_result,
            error_code = p_error_code,
            error_message = p_error_message,
            completed_at = now(),
            total_count = case
              when normalized_result ->> 'total_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'total_count')::integer
              else rr.total_count
            end,
            included_count = case
              when normalized_result ->> 'included_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'included_count')::integer
              else rr.included_count
            end,
            excluded_count = case
              when normalized_result ->> 'excluded_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'excluded_count')::integer
              else rr.excluded_count
            end,
            review_count = case
              when normalized_result ->> 'review_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'review_count')::integer
              else rr.review_count
            end
        where rr.id = p_job_id
          and rr.status = 'running'
        returning rr.workspace_id, rr.status, rr.worker_id
          into completed_workspace_id, completed_status, completed_worker_id;
      elsif normalized_job_type = 'export' then
        if normalized_status not in ('completed', 'failed', 'cancelled') then
          raise exception using errcode = '22023', message = 'invalid export completion status';
        end if;

        update public.exports e
        set status = normalized_status,
            result = normalized_result,
            error_code = p_error_code,
            error_message = p_error_message,
            completed_at = now(),
            storage_bucket = coalesce(nullif(normalized_result ->> 'storage_bucket', ''), e.storage_bucket),
            storage_path = coalesce(nullif(normalized_result ->> 'storage_path', ''), e.storage_path),
            checksum_sha256 = coalesce(nullif(normalized_result ->> 'checksum_sha256', ''), e.checksum_sha256),
            file_size_bytes = case
              when normalized_result ->> 'file_size_bytes' ~ '^[0-9]+$'
                then (normalized_result ->> 'file_size_bytes')::bigint
              else e.file_size_bytes
            end,
            row_count = case
              when normalized_result ->> 'row_count' ~ '^[0-9]+$'
                then (normalized_result ->> 'row_count')::integer
              else e.row_count
            end
        where e.id = p_job_id
          and e.status = 'running'
        returning e.workspace_id, e.status, e.worker_id
          into completed_workspace_id, completed_status, completed_worker_id;
      else
        raise exception using errcode = '22023', message = 'unsupported job type';
      end if;

      if completed_workspace_id is null then
        raise exception using errcode = 'P0002', message = 'running job not found';
      end if;

      if normalized_job_type = 'ingestion_job'
         and completed_source_query_id is not null then
        update public.source_queries sq
        set status = case
          when normalized_status in ('completed', 'partial') then 'completed'
          when normalized_status = 'failed' then 'failed'
          else 'cancelled'
        end
        where sq.workspace_id = completed_workspace_id
          and sq.id = completed_source_query_id;
      end if;

      insert into public.audit_logs (
        workspace_id,
        actor_type,
        actor_label,
        action,
        entity_type,
        entity_id,
        after_data,
        metadata
      ) values (
        completed_workspace_id,
        'service',
        completed_worker_id,
        'workbench.job.completed',
        normalized_job_type,
        p_job_id::text,
        jsonb_build_object(
          'status', completed_status,
          'result', normalized_result,
          'error_code', p_error_code
        ),
        jsonb_build_object('worker_id', completed_worker_id)
      );

      return query
      select normalized_job_type, p_job_id, completed_workspace_id, completed_status;
    end;
    $$;

CREATE OR REPLACE FUNCTION "public"."get_company_list_manifest_hash"("p_workspace_id" "uuid", "p_company_list_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    declare
      manifest_hash text;
    begin
      manifest_hash := private.calculate_company_list_manifest_hash(
        p_workspace_id,
        p_company_list_id
      );
      if manifest_hash is null then
        raise exception using errcode = 'P0002', message = 'company list has no members';
      end if;
      return manifest_hash;
    end;
    $$;

CREATE OR REPLACE FUNCTION "public"."persist_workbench_ingestion_record"(
    "p_job_id" "uuid",
    "p_source_record_key" "text",
    "p_record_kind" "text",
    "p_raw_payload" "jsonb",
    "p_raw_hash" "text",
    "p_observed_at" timestamp with time zone,
    "p_normalized_payload" "jsonb",
    "p_normalized_hash" "text",
    "p_mapping_warnings" "jsonb"
) RETURNS TABLE("source_record_id" "uuid", "source_snapshot_id" "uuid", "company_id" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    declare
      job_record public.ingestion_jobs%rowtype;
      existing_source_record public.source_records%rowtype;
      persisted_source_record_id uuid;
      persisted_snapshot_id uuid;
      persisted_company_id bigint;
      persisted_evidence_id uuid;
      connection_provider text;
      company_name text;
      normalized_company_name text;
      credit_code text;
      registration_number_value text;
      source_url_value text;
      field_path_value text;
      field_value jsonb;
      fact_value_type text;
      fact_value_text text;
      fact_provider text;
      fact_idempotency_key text;
      provenance_item jsonb;
    begin
      if p_source_record_key is null or btrim(p_source_record_key) = '' then
        raise exception using errcode = '22023', message = 'source record key is required';
      end if;
      if p_record_kind is null or btrim(p_record_kind) = '' then
        raise exception using errcode = '22023', message = 'record kind is required';
      end if;
      if p_raw_hash is null or p_raw_hash !~ '^[A-Fa-f0-9]{64}$' then
        raise exception using errcode = '22023', message = 'raw hash must be SHA-256 hex';
      end if;
      if p_normalized_hash is null or p_normalized_hash !~ '^[A-Fa-f0-9]{64}$' then
        raise exception using errcode = '22023', message = 'normalized hash must be SHA-256 hex';
      end if;
      if jsonb_typeof(p_raw_payload) is distinct from 'object'
         or jsonb_typeof(p_normalized_payload) is distinct from 'object' then
        raise exception using errcode = '22023', message = 'raw and normalized payloads must be JSON objects';
      end if;
      if jsonb_typeof(coalesce(p_mapping_warnings, '[]'::jsonb)) is distinct from 'array' then
        raise exception using errcode = '22023', message = 'mapping warnings must be a JSON array';
      end if;
      if jsonb_typeof(p_normalized_payload -> 'provenance') is distinct from 'array' then
        raise exception using errcode = '22023', message = 'normalized payload requires field provenance';
      end if;
      if jsonb_array_length(p_normalized_payload -> 'provenance') = 0 then
        raise exception using errcode = '22023', message = 'normalized payload requires field provenance';
      end if;

      select ij.*
        into job_record
      from public.ingestion_jobs ij
      where ij.id = p_job_id
        and ij.status = 'running'
      for update;

      if not found then
        raise exception using errcode = 'P0002', message = 'running ingestion job not found';
      end if;

      select sc.provider
        into connection_provider
      from public.source_connections sc
      where sc.workspace_id = job_record.workspace_id
        and sc.id = job_record.source_connection_id;

      select sr.*
        into existing_source_record
      from public.source_records sr
      where sr.workspace_id = job_record.workspace_id
        and sr.ingestion_job_id = job_record.id
        and sr.source_record_key = p_source_record_key;

      if found then
        if lower(existing_source_record.content_hash) <> lower(p_raw_hash) then
          raise exception using
            errcode = '23505',
            message = 'source record key was already persisted with different content';
        end if;
        persisted_source_record_id := existing_source_record.id;

        select ss.id, ss.company_id
          into persisted_snapshot_id, persisted_company_id
        from public.source_snapshots ss
        where ss.workspace_id = job_record.workspace_id
          and ss.source_record_id = persisted_source_record_id
          and lower(ss.content_hash) = lower(p_normalized_hash)
        order by ss.created_at
        limit 1;

        if persisted_snapshot_id is not null and persisted_company_id is not null then
          return query
          select persisted_source_record_id, persisted_snapshot_id, persisted_company_id;
          return;
        end if;
      else
        insert into public.source_records (
          workspace_id,
          ingestion_job_id,
          source_connection_id,
          source_record_key,
          record_kind,
          raw_payload,
          content_hash,
          source_observed_at
        ) values (
          job_record.workspace_id,
          job_record.id,
          job_record.source_connection_id,
          btrim(p_source_record_key),
          btrim(p_record_kind),
          p_raw_payload,
          lower(p_raw_hash),
          p_observed_at
        )
        returning id into persisted_source_record_id;
      end if;

      company_name := nullif(btrim(p_normalized_payload ->> 'companyName'), '');
      if company_name is null then
        raise exception using errcode = '22023', message = 'normalized companyName is required';
      end if;

      normalized_company_name := lower(
        regexp_replace(company_name, '[[:space:]（）()·._-]+', '', 'g')
      );
      credit_code := upper(nullif(btrim(p_normalized_payload ->> 'creditCode'), ''));
      registration_number_value := nullif(btrim(p_normalized_payload ->> 'registrationNumber'), '');

      perform pg_advisory_xact_lock(
        hashtextextended(
          job_record.workspace_id::text || ':' || coalesce(credit_code, normalized_company_name),
          0
        )
      );

      if credit_code is not null then
        select c.id
          into persisted_company_id
        from public.companies c
        where c.workspace_id = job_record.workspace_id
          and c.unified_social_credit_code = credit_code
        limit 1;
      end if;

      if persisted_company_id is null then
        select c.id
          into persisted_company_id
        from public.companies c
        where c.workspace_id = job_record.workspace_id
          and c.normalized_name = normalized_company_name
          and c.profile_status <> 'merged'
        order by c.created_at
        limit 1;
      end if;

      if persisted_company_id is null then
        insert into public.companies (
          workspace_id,
          name,
          unified_social_credit_code,
          registration_number,
          legal_representative,
          operating_status,
          company_type,
          registered_capital_amount,
          paid_in_capital_amount,
          established_on,
          approved_on,
          registration_authority,
          business_scope,
          province,
          city,
          district,
          region_text,
          industry_name,
          sector,
          insured_employee_count,
          personnel_scale_text,
          address,
          primary_source,
          last_verified_at,
          profile_status
        ) values (
          job_record.workspace_id,
          company_name,
          credit_code,
          registration_number_value,
          nullif(p_normalized_payload ->> 'legalPerson', ''),
          nullif(p_normalized_payload #>> '{status,normalized}', ''),
          nullif(p_normalized_payload ->> 'companyType', ''),
          (nullif(p_normalized_payload #>> '{registeredCapital,valueWan}', '')::numeric * 10000),
          (nullif(p_normalized_payload #>> '{paidInCapital,valueWan}', '')::numeric * 10000),
          nullif(p_normalized_payload ->> 'establishedDate', '')::date,
          nullif(p_normalized_payload ->> 'approvedDate', '')::date,
          nullif(p_normalized_payload ->> 'registrationAuthority', ''),
          nullif(p_normalized_payload ->> 'businessScope', ''),
          nullif(p_normalized_payload #>> '{region,province}', ''),
          nullif(p_normalized_payload #>> '{region,city}', ''),
          nullif(p_normalized_payload #>> '{region,district}', ''),
          nullif(p_normalized_payload #>> '{region,raw}', ''),
          nullif(p_normalized_payload #>> '{industry,l2}', ''),
          nullif(p_normalized_payload #>> '{industry,l1}', ''),
          nullif(p_normalized_payload ->> 'insuredCount', '')::integer,
          nullif(p_normalized_payload #>> '{personnelScale,raw}', ''),
          nullif(p_normalized_payload ->> 'registeredAddress', ''),
          connection_provider,
          now(),
          'verified'
        )
        returning id into persisted_company_id;
      else
        update public.companies c
        set name = company_name,
            unified_social_credit_code = coalesce(credit_code, c.unified_social_credit_code::text),
            registration_number = coalesce(registration_number_value, c.registration_number),
            legal_representative = coalesce(nullif(p_normalized_payload ->> 'legalPerson', ''), c.legal_representative),
            operating_status = coalesce(nullif(nullif(p_normalized_payload #>> '{status,normalized}', 'unknown'), ''), c.operating_status),
            company_type = coalesce(nullif(p_normalized_payload ->> 'companyType', ''), c.company_type),
            registered_capital_amount = coalesce((nullif(p_normalized_payload #>> '{registeredCapital,valueWan}', '')::numeric * 10000), c.registered_capital_amount),
            paid_in_capital_amount = coalesce((nullif(p_normalized_payload #>> '{paidInCapital,valueWan}', '')::numeric * 10000), c.paid_in_capital_amount),
            established_on = coalesce(nullif(p_normalized_payload ->> 'establishedDate', '')::date, c.established_on),
            approved_on = coalesce(nullif(p_normalized_payload ->> 'approvedDate', '')::date, c.approved_on),
            registration_authority = coalesce(nullif(p_normalized_payload ->> 'registrationAuthority', ''), c.registration_authority),
            business_scope = coalesce(nullif(p_normalized_payload ->> 'businessScope', ''), c.business_scope),
            province = coalesce(nullif(p_normalized_payload #>> '{region,province}', ''), c.province),
            city = coalesce(nullif(p_normalized_payload #>> '{region,city}', ''), c.city),
            district = coalesce(nullif(p_normalized_payload #>> '{region,district}', ''), c.district),
            region_text = coalesce(nullif(p_normalized_payload #>> '{region,raw}', ''), c.region_text),
            industry_name = coalesce(nullif(p_normalized_payload #>> '{industry,l2}', ''), c.industry_name),
            sector = coalesce(nullif(p_normalized_payload #>> '{industry,l1}', ''), c.sector),
            insured_employee_count = coalesce(nullif(p_normalized_payload ->> 'insuredCount', '')::integer, c.insured_employee_count),
            personnel_scale_text = coalesce(nullif(p_normalized_payload #>> '{personnelScale,raw}', ''), c.personnel_scale_text),
            address = coalesce(nullif(p_normalized_payload ->> 'registeredAddress', ''), c.address),
            primary_source = connection_provider,
            last_verified_at = now(),
            profile_status = 'verified'
        where c.workspace_id = job_record.workspace_id
          and c.id = persisted_company_id;
      end if;

      if credit_code is not null then
        insert into public.company_identifiers (
          workspace_id,
          company_id,
          identifier_type,
          identifier_value,
          normalized_value,
          source_provider,
          source_record_id,
          is_primary
        ) values (
          job_record.workspace_id,
          persisted_company_id,
          'unified_social_credit_code',
          credit_code,
          credit_code,
          connection_provider,
          persisted_source_record_id,
          true
        )
        on conflict on constraint company_identifiers_company_value_key do update
        set last_seen_at = now(),
            source_provider = excluded.source_provider,
            source_record_id = excluded.source_record_id,
            is_primary = true;
      end if;

      insert into public.source_snapshots (
        workspace_id,
        source_record_id,
        mapping_version_id,
        company_id,
        normalized_payload,
        content_hash,
        match_status,
        mapping_warnings,
        captured_at
      ) values (
        job_record.workspace_id,
        persisted_source_record_id,
        job_record.mapping_version_id,
        persisted_company_id,
        p_normalized_payload,
        lower(p_normalized_hash),
        'matched',
        coalesce(p_mapping_warnings, '[]'::jsonb),
        now()
      )
      on conflict on constraint source_snapshots_source_hash_key do nothing
      returning id into persisted_snapshot_id;

      if persisted_snapshot_id is null then
        select ss.id
          into persisted_snapshot_id
        from public.source_snapshots ss
        where ss.workspace_id = job_record.workspace_id
          and ss.source_record_id = persisted_source_record_id
          and lower(ss.content_hash) = lower(p_normalized_hash)
        order by ss.created_at
        limit 1;
      end if;

      select provenance.value ->> 'sourceUrl'
        into source_url_value
      from jsonb_array_elements(p_normalized_payload -> 'provenance') provenance(value)
      where nullif(provenance.value ->> 'sourceUrl', '') is not null
      limit 1;

      insert into public.company_evidence (
        workspace_id,
        company_id,
        evidence_type,
        title,
        source_provider,
        source_record_id,
        source_snapshot_id,
        source_url,
        excerpt,
        evidence_fingerprint,
        evidence_status,
        observed_at,
        metadata
      ) values (
        job_record.workspace_id,
        persisted_company_id,
        'registration',
        company_name || ' 工商登记数据',
        connection_provider,
        persisted_source_record_id,
        persisted_snapshot_id,
        source_url_value,
        '供内部分析使用的结构化工商登记快照。',
        md5(
          'registration:' || persisted_source_record_id::text || ':' || lower(p_normalized_hash)
        ),
        'verified',
        p_observed_at,
        jsonb_build_object(
          'usage_scope', 'internal_analysis',
          'normalized_hash', lower(p_normalized_hash),
          'provider', connection_provider,
          'provenance', p_normalized_payload -> 'provenance'
        )
      )
      on conflict on constraint company_evidence_company_fingerprint_key do nothing
      returning id into persisted_evidence_id;

      if persisted_evidence_id is null then
        select ce.id
          into persisted_evidence_id
        from public.company_evidence ce
        where ce.workspace_id = job_record.workspace_id
          and ce.company_id = persisted_company_id
          and ce.evidence_fingerprint = md5(
            'registration:' || persisted_source_record_id::text || ':' || lower(p_normalized_hash)
          );
      end if;

      for provenance_item in
        select distinct on (
          provenance.value ->> 'fieldPath',
          coalesce(provenance.value ->> 'providerId', connection_provider)
        ) provenance.value
        from jsonb_array_elements(p_normalized_payload -> 'provenance') provenance(value)
        order by
          provenance.value ->> 'fieldPath',
          coalesce(provenance.value ->> 'providerId', connection_provider),
          provenance.value::text
      loop
        field_path_value := nullif(btrim(provenance_item ->> 'fieldPath'), '');
        if field_path_value is null or field_path_value like 'contact.%' then
          continue;
        end if;

        field_value := private.jsonb_get_dot_path(p_normalized_payload, field_path_value);
        fact_provider := coalesce(
          nullif(provenance_item ->> 'providerId', ''),
          connection_provider
        );
        fact_idempotency_key := md5(
          persisted_source_record_id::text || '|' || field_path_value || '|' || fact_provider
        );

        if field_value is null or jsonb_typeof(field_value) = 'null' then
          fact_value_text := null;
        elsif jsonb_typeof(field_value) = 'string' then
          fact_value_text := field_value #>> '{}';
        else
          fact_value_text := field_value::text;
        end if;

        fact_value_type := case
          when provenance_item ->> 'unit' in ('wan_cny', 'cny') then 'money'
          when provenance_item ->> 'unit' = 'date' then 'date'
          when jsonb_typeof(field_value) = 'number' then 'number'
          when jsonb_typeof(field_value) = 'boolean' then 'boolean'
          when jsonb_typeof(field_value) = 'array' then 'array'
          when jsonb_typeof(field_value) = 'object' then 'object'
          when field_value is null or jsonb_typeof(field_value) = 'null' then 'null'
          else 'string'
        end;

        update public.company_field_facts cff
        set is_current = false,
            valid_to = coalesce(p_observed_at, now())
        where cff.workspace_id = job_record.workspace_id
          and cff.company_id = persisted_company_id
          and cff.field_name = field_path_value
          and cff.source_provider = fact_provider
          and cff.is_current;

        insert into public.company_field_facts (
          workspace_id,
          company_id,
          field_name,
          value_json,
          value_text,
          value_type,
          source_provider,
          source_record_id,
          source_snapshot_id,
          evidence_id,
          confidence,
          observed_at,
          valid_from,
          is_current,
          idempotency_key
        ) values (
          job_record.workspace_id,
          persisted_company_id,
          field_path_value,
          jsonb_build_object(
            'value', coalesce(field_value, 'null'::jsonb),
            'providerName', provenance_item -> 'providerName',
            'channel', provenance_item -> 'channel',
            'evidenceClass', provenance_item -> 'evidenceClass',
            'sourceField', provenance_item -> 'sourceField',
            'unit', provenance_item -> 'unit',
            'nullMeaning', provenance_item -> 'nullMeaning',
            'usageScope', coalesce(provenance_item -> 'usageScope', '"internal_analysis"'::jsonb),
            'note', provenance_item -> 'note'
          ),
          fact_value_text,
          fact_value_type,
          fact_provider,
          persisted_source_record_id,
          persisted_snapshot_id,
          persisted_evidence_id,
          nullif(provenance_item ->> 'confidence', '')::numeric,
          coalesce(nullif(provenance_item ->> 'retrievedAt', '')::timestamp with time zone, p_observed_at, now()),
          coalesce(nullif(provenance_item ->> 'retrievedAt', '')::timestamp with time zone, p_observed_at, now()),
          true,
          fact_idempotency_key
        )
        on conflict on constraint company_field_facts_workspace_idempotency_key do nothing;
      end loop;

      return query
      select persisted_source_record_id, persisted_snapshot_id, persisted_company_id;
    end;
    $$;

CREATE OR REPLACE FUNCTION "public"."persist_workbench_web_evidence"(
    "p_job_id" "uuid",
    "p_company_id" bigint,
    "p_source_record_key" "text",
    "p_raw_payload" "jsonb",
    "p_raw_hash" "text",
    "p_observed_at" timestamp with time zone,
    "p_normalized_payload" "jsonb",
    "p_normalized_hash" "text",
    "p_evidence_items" "jsonb"
) RETURNS TABLE(
    "source_record_id" "uuid",
    "source_snapshot_id" "uuid",
    "evidence_count" integer
)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    declare
      job_record public.ingestion_jobs%rowtype;
      existing_source_record public.source_records%rowtype;
      persisted_source_record_id uuid;
      persisted_snapshot_id uuid;
      persisted_snapshot_company_id bigint;
      existing_record_company_id bigint;
      connection_provider text;
      evidence_item jsonb;
      evidence_url text;
      evidence_title text;
      evidence_excerpt text;
      evidence_claim_type text;
      evidence_confidence numeric;
      evidence_authority_level numeric;
      evidence_provider_score numeric;
      evidence_published_at text;
      evidence_retrieved_at_text text;
      evidence_retrieved_at timestamp with time zone;
      evidence_fingerprint text;
      evidence_metadata jsonb;
      seen_fingerprints text[] := '{}'::text[];
      persisted_evidence_count integer := 0;
    begin
      if p_source_record_key is null
         or btrim(p_source_record_key) = ''
         or length(btrim(p_source_record_key)) > 256
         or p_source_record_key ~ '[[:cntrl:]]' then
        raise exception using errcode = '22023', message = 'source record key is invalid';
      end if;
      if p_raw_hash is null or p_raw_hash !~ '^[A-Fa-f0-9]{64}$' then
        raise exception using errcode = '22023', message = 'raw hash must be SHA-256 hex';
      end if;
      if p_normalized_hash is null or p_normalized_hash !~ '^[A-Fa-f0-9]{64}$' then
        raise exception using errcode = '22023', message = 'normalized hash must be SHA-256 hex';
      end if;
      if jsonb_typeof(p_raw_payload) is distinct from 'object'
         or jsonb_typeof(p_normalized_payload) is distinct from 'object' then
        raise exception using errcode = '22023', message = 'raw and normalized payloads must be JSON objects';
      end if;
      if jsonb_typeof(p_evidence_items) is distinct from 'array' then
        raise exception using errcode = '22023', message = 'evidence items must be a JSON array';
      end if;
      if jsonb_array_length(p_evidence_items) > 10 then
        raise exception using errcode = '22023', message = 'at most 10 evidence items are allowed';
      end if;
      if octet_length(p_raw_payload::text) > 1048576
         or octet_length(p_normalized_payload::text) > 262144
         or octet_length(p_evidence_items::text) > 262144 then
        raise exception using errcode = '22023', message = 'web evidence JSON payload is too large';
      end if;
      if (p_raw_payload::text || p_normalized_payload::text || p_evidence_items::text)
           ~* '"(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret[_-]?reference|password|authorization|private[_-]?key|credential|cookie|token)"[[:space:]]*:' then
        raise exception using errcode = '22023', message = 'web evidence payload contains a forbidden secret-like key';
      end if;

      select ij.*
        into job_record
      from public.ingestion_jobs ij
      where ij.id = p_job_id
        and ij.status = 'running'
      for update;

      if not found then
        raise exception using errcode = 'P0002', message = 'running ingestion job not found';
      end if;

      select sc.provider
        into connection_provider
      from public.source_connections sc
      where sc.workspace_id = job_record.workspace_id
        and sc.id = job_record.source_connection_id;

      if connection_provider is distinct from 'web_search' then
        raise exception using errcode = '22023', message = 'ingestion job is not a web search job';
      end if;

      perform 1
      from public.companies c
      where c.workspace_id = job_record.workspace_id
        and c.id = p_company_id
      for key share;

      if not found then
        raise exception using errcode = '23503', message = 'company does not belong to the ingestion workspace';
      end if;

      select sr.*
        into existing_source_record
      from public.source_records sr
      where sr.workspace_id = job_record.workspace_id
        and sr.ingestion_job_id = job_record.id
        and sr.source_record_key = btrim(p_source_record_key);

      if found then
        if lower(existing_source_record.content_hash) <> lower(p_raw_hash) then
          raise exception using
            errcode = '23505',
            message = 'source record key was already persisted with different content';
        end if;
        persisted_source_record_id := existing_source_record.id;
      else
        insert into public.source_records (
          workspace_id,
          ingestion_job_id,
          source_connection_id,
          source_record_key,
          record_kind,
          raw_payload,
          content_hash,
          source_observed_at
        ) values (
          job_record.workspace_id,
          job_record.id,
          job_record.source_connection_id,
          btrim(p_source_record_key),
          'web_evidence',
          p_raw_payload,
          lower(p_raw_hash),
          p_observed_at
        )
        returning id into persisted_source_record_id;
      end if;

      select ss.company_id
        into existing_record_company_id
      from public.source_snapshots ss
      where ss.workspace_id = job_record.workspace_id
        and ss.source_record_id = persisted_source_record_id
        and ss.company_id is not null
      order by ss.created_at, ss.id
      limit 1;

      if existing_record_company_id is not null
         and existing_record_company_id <> p_company_id then
        raise exception using
          errcode = '23505',
          message = 'source record was already matched to another company';
      end if;

      insert into public.source_snapshots (
        workspace_id,
        source_record_id,
        mapping_version_id,
        company_id,
        normalized_payload,
        content_hash,
        match_status,
        mapping_warnings,
        captured_at
      ) values (
        job_record.workspace_id,
        persisted_source_record_id,
        job_record.mapping_version_id,
        p_company_id,
        p_normalized_payload,
        lower(p_normalized_hash),
        'matched',
        '[]'::jsonb,
        now()
      )
      on conflict on constraint source_snapshots_source_hash_key do nothing
      returning id, company_id
        into persisted_snapshot_id, persisted_snapshot_company_id;

      if persisted_snapshot_id is null then
        select ss.id, ss.company_id
          into persisted_snapshot_id, persisted_snapshot_company_id
        from public.source_snapshots ss
        where ss.workspace_id = job_record.workspace_id
          and ss.source_record_id = persisted_source_record_id
          and ss.canonical_schema_version = '1.0'
          and lower(ss.content_hash) = lower(p_normalized_hash)
        order by ss.created_at
        limit 1;
      end if;

      if persisted_snapshot_company_id is distinct from p_company_id then
        raise exception using
          errcode = '23505',
          message = 'source record snapshot was already matched to another company';
      end if;

      for evidence_item in
        select item.value
        from jsonb_array_elements(p_evidence_items) with ordinality item(value, ordinal)
        order by item.ordinal
      loop
        if jsonb_typeof(evidence_item) is distinct from 'object'
           or octet_length(evidence_item::text) > 32768 then
          raise exception using errcode = '22023', message = 'evidence item must be a bounded JSON object';
        end if;

        evidence_url := btrim(coalesce(
          evidence_item ->> 'url',
          evidence_item ->> 'sourceUrl',
          evidence_item ->> 'source_url',
          ''
        ));
        evidence_title := btrim(coalesce(evidence_item ->> 'title', ''));
        evidence_excerpt := nullif(btrim(coalesce(
          evidence_item ->> 'snippet',
          evidence_item ->> 'excerpt',
          ''
        )), '');
        evidence_claim_type := lower(btrim(coalesce(
          evidence_item ->> 'claimType',
          evidence_item ->> 'claim_type',
          ''
        )));
        evidence_published_at := nullif(btrim(coalesce(
          evidence_item ->> 'publishedAt',
          evidence_item ->> 'published_at',
          ''
        )), '');
        evidence_retrieved_at_text := nullif(btrim(coalesce(
          evidence_item ->> 'retrievedAt',
          evidence_item ->> 'retrieved_at',
          ''
        )), '');

        if evidence_url = ''
           or length(evidence_url) > 2048
           or evidence_url !~* '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then
          raise exception using errcode = '22023', message = 'evidence source URL must be an absolute HTTP(S) URL without credentials';
        end if;
        if evidence_title = ''
           or length(evidence_title) > 500
           or evidence_title ~ '[[:cntrl:]]' then
          raise exception using errcode = '22023', message = 'evidence title is invalid';
        end if;
        if evidence_excerpt is not null and length(evidence_excerpt) > 4000 then
          raise exception using errcode = '22023', message = 'evidence excerpt is too long';
        end if;
        if evidence_claim_type not in (
          'official_website', 'product', 'award', 'tender',
          'recruiting', 'news', 'other'
        ) then
          raise exception using errcode = '22023', message = 'evidence claim type is not allowed';
        end if;
        if evidence_item ->> 'usageScope' is distinct from 'link_only' then
          raise exception using errcode = '22023', message = 'web evidence usageScope must be link_only';
        end if;
        if jsonb_typeof(evidence_item -> 'confidence') is distinct from 'number' then
          raise exception using errcode = '22023', message = 'evidence confidence must be a number between 0 and 1';
        end if;
        evidence_confidence := (evidence_item ->> 'confidence')::numeric;
        if evidence_confidence < 0 or evidence_confidence > 1 then
          raise exception using errcode = '22023', message = 'evidence confidence must be a number between 0 and 1';
        end if;

        if evidence_item ? 'authorityLevel'
           and jsonb_typeof(evidence_item -> 'authorityLevel') <> 'null' then
          if jsonb_typeof(evidence_item -> 'authorityLevel') <> 'number' then
            raise exception using errcode = '22023', message = 'evidence authorityLevel must be a number between 0 and 5';
          end if;
          evidence_authority_level := (evidence_item ->> 'authorityLevel')::numeric;
          if evidence_authority_level < 0 or evidence_authority_level > 5 then
            raise exception using errcode = '22023', message = 'evidence authorityLevel must be a number between 0 and 5';
          end if;
        else
          evidence_authority_level := null;
        end if;

        if evidence_item ? 'providerScore'
           and jsonb_typeof(evidence_item -> 'providerScore') <> 'null' then
          if jsonb_typeof(evidence_item -> 'providerScore') <> 'number' then
            raise exception using errcode = '22023', message = 'evidence providerScore must be a number between 0 and 1';
          end if;
          evidence_provider_score := (evidence_item ->> 'providerScore')::numeric;
          if evidence_provider_score < 0 or evidence_provider_score > 1 then
            raise exception using errcode = '22023', message = 'evidence providerScore must be a number between 0 and 1';
          end if;
        else
          evidence_provider_score := null;
        end if;

        if evidence_retrieved_at_text is null
           or evidence_retrieved_at_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
          raise exception using errcode = '22023', message = 'evidence retrievedAt must be an ISO-8601 timestamp';
        end if;
        begin
          evidence_retrieved_at := evidence_retrieved_at_text::timestamp with time zone;
        exception when sqlstate '22007' or sqlstate '22008' then
          raise exception using errcode = '22023', message = 'evidence retrievedAt must be an ISO-8601 timestamp';
        end;

        if evidence_published_at is not null then
          if evidence_published_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
            raise exception using errcode = '22023', message = 'evidence publishedAt must be an ISO-8601 timestamp';
          end if;
          begin
            perform evidence_published_at::timestamp with time zone;
          exception when sqlstate '22007' or sqlstate '22008' then
            raise exception using errcode = '22023', message = 'evidence publishedAt must be an ISO-8601 timestamp';
          end;
        end if;

        if length(coalesce(evidence_item ->> 'sourceName', '')) > 200
           or length(coalesce(evidence_item ->> 'query', '')) > 400
           or length(coalesce(evidence_item ->> 'version', '')) > 80
           or length(coalesce(evidence_item ->> 'requestId', '')) > 200 then
          raise exception using errcode = '22023', message = 'evidence attribution metadata is too long';
        end if;

        evidence_fingerprint := encode(
          extensions.digest(
            p_company_id::text || '|' || lower(evidence_url) || '|' || evidence_claim_type,
            'sha256'
          ),
          'hex'
        );

        if evidence_fingerprint = any(seen_fingerprints) then
          continue;
        end if;
        seen_fingerprints := array_append(seen_fingerprints, evidence_fingerprint);

        evidence_metadata := jsonb_strip_nulls(jsonb_build_object(
          'claim_type', evidence_claim_type,
          'confidence', to_jsonb(evidence_confidence),
          'usage_scope', 'link_only',
          'link_only', true,
          'source_name', coalesce(evidence_item -> 'sourceName', evidence_item -> 'source_name'),
          'published_at', evidence_published_at,
          'authority_level', to_jsonb(evidence_authority_level),
          'provider_score', to_jsonb(evidence_provider_score),
          'query', evidence_item -> 'query',
          'version', evidence_item -> 'version',
          'request_id', coalesce(evidence_item -> 'requestId', evidence_item -> 'request_id')
        ));

        insert into public.company_evidence (
          workspace_id,
          company_id,
          evidence_type,
          title,
          source_provider,
          source_record_id,
          source_snapshot_id,
          source_url,
          excerpt,
          evidence_fingerprint,
          evidence_status,
          observed_at,
          metadata
        ) values (
          job_record.workspace_id,
          p_company_id,
          'web',
          evidence_title,
          'ego_lite',
          persisted_source_record_id,
          persisted_snapshot_id,
          evidence_url,
          evidence_excerpt,
          evidence_fingerprint,
          'unverified',
          evidence_retrieved_at,
          evidence_metadata
        )
        on conflict on constraint company_evidence_company_fingerprint_key do update
        set title = excluded.title,
            source_provider = excluded.source_provider,
            source_record_id = excluded.source_record_id,
            source_snapshot_id = excluded.source_snapshot_id,
            source_url = excluded.source_url,
            excerpt = excluded.excerpt,
            observed_at = excluded.observed_at,
            metadata = excluded.metadata;

        persisted_evidence_count := persisted_evidence_count + 1;
      end loop;

      -- evidence_count is the number of unique fingerprints represented by
      -- this call. It includes rows reused by an idempotent retry, not only
      -- newly inserted rows, so workers receive a stable acknowledgement.
      return query
      select
        persisted_source_record_id,
        persisted_snapshot_id,
        persisted_evidence_count;
    end;
    $$;

CREATE OR REPLACE FUNCTION "public"."set_company_list_origin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    declare
      origin jsonb;
      origin_provider text;
    begin
      if new.ingestion_job_id is null then
        return new;
      end if;

      select ij.input_params -> 'origin' into origin
      from public.ingestion_jobs ij
      where ij.workspace_id = new.workspace_id
        and ij.id = new.ingestion_job_id;

      if origin ->> 'channel' = 'agent' then
        origin_provider := lower(btrim(origin ->> 'provider'));
        new.created_via := case
          when origin_provider = 'workbuddy' then 'workbuddy'
          else 'agent'
        end;
        new.agent_provider := origin_provider;
        new.created_by_agent := nullif(btrim(origin ->> 'agentName'), '');
      end if;

      return new;
    end;
    $$;

CREATE TRIGGER "company_lists_set_origin"
    BEFORE INSERT ON "public"."company_lists"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_company_list_origin"();

CREATE OR REPLACE FUNCTION "public"."ensure_ingestion_company_list"("p_job_id" "uuid", "p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    declare
      job_record public.ingestion_jobs%rowtype;
      normalized_name text := btrim(p_name);
      list_id uuid;
    begin
      if normalized_name is null or normalized_name = '' then
        raise exception using errcode = '22023', message = 'company list name is required';
      end if;

      select ij.* into job_record
      from public.ingestion_jobs ij
      where ij.id = p_job_id
        and ij.status in ('running', 'completed', 'partial')
      for update;

      if not found then
        raise exception using errcode = 'P0002', message = 'ingestion job not found';
      end if;

      perform pg_advisory_xact_lock(
        hashtextextended(job_record.workspace_id::text || ':list:' || lower(normalized_name), 0)
      );

      select cl.id into list_id
      from public.company_lists cl
      where cl.workspace_id = job_record.workspace_id
        and lower(cl.name) = lower(normalized_name)
      limit 1;

      if list_id is null then
        insert into public.company_lists (
          workspace_id,
          name,
          source_query_id,
          ingestion_job_id,
          created_by
        ) values (
          job_record.workspace_id,
          normalized_name,
          job_record.source_query_id,
          job_record.id,
          job_record.requested_by
        )
        returning id into list_id;
      end if;

      return list_id;
    end;
    $$;

CREATE OR REPLACE FUNCTION "public"."add_ingestion_list_member"(
    "p_job_id" "uuid",
    "p_company_list_id" "uuid",
    "p_company_id" bigint,
    "p_source_record_id" "uuid"
) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    declare
      job_record public.ingestion_jobs%rowtype;
      member_id uuid;
    begin
      select ij.* into job_record
      from public.ingestion_jobs ij
      where ij.id = p_job_id
        and ij.status in ('running', 'completed', 'partial');

      if not found then
        raise exception using errcode = 'P0002', message = 'ingestion job not found';
      end if;

      insert into public.company_list_members (
        workspace_id,
        company_list_id,
        company_id,
        source_record_id,
        membership_status,
        added_by
      ) values (
        job_record.workspace_id,
        p_company_list_id,
        p_company_id,
        p_source_record_id,
        'included',
        job_record.requested_by
      )
      on conflict on constraint company_list_members_list_company_key do update
      set source_record_id = coalesce(excluded.source_record_id, company_list_members.source_record_id),
          membership_status = 'included',
          updated_at = now()
      returning id into member_id;

      return member_id;
    end;
    $$;

CREATE OR REPLACE FUNCTION "public"."get_first_admin_bootstrap_state"()
RETURNS TABLE("is_initialized" boolean, "claim_in_progress" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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

CREATE OR REPLACE FUNCTION "public"."claim_first_admin_bootstrap"("p_claim_id" uuid)
RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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

CREATE OR REPLACE FUNCTION "public"."complete_first_admin_bootstrap"(
  "p_claim_id" uuid,
  "p_admin_user_id" uuid
)
RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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

CREATE OR REPLACE FUNCTION "public"."release_first_admin_bootstrap"("p_claim_id" uuid)
RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
