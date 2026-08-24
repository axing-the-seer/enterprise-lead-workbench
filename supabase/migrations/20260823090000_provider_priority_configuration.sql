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

REVOKE ALL ON FUNCTION public.configure_provider_priorities(uuid, jsonb)
FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.configure_provider_priorities(uuid, jsonb)
TO authenticated;
