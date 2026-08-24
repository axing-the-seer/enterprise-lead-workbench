-- Browser clients read a non-secret projection and configure only the three
-- initialized provider records through a validated owner/admin RPC.

drop policy if exists "Admins can insert source connections" on public.source_connections;
drop policy if exists "Admins can update source connections" on public.source_connections;

revoke insert, update on table public.source_connections from authenticated;

create or replace view public.source_connections_safe with (security_invoker = on) as
select
    sc.id,
    sc.workspace_id,
    sc.provider,
    sc.name,
    sc.connection_kind,
    sc.status,
    sc.has_secret_reference,
    sc.connection_config,
    sc.capabilities,
    sc.default_mapping_version_id,
    sc.external_connection_id,
    sc.last_verified_at,
    sc.last_error_code,
    sc.created_by,
    sc.updated_by,
    sc.created_at,
    sc.updated_at
from public.source_connections sc;

revoke all on table public.source_connections_safe from public, anon, authenticated;
grant select on table public.source_connections_safe to authenticated;
grant all on table public.source_connections_safe to service_role;

create or replace function public.configure_source_connection(
    p_workspace_id uuid,
    p_connection_id uuid,
    p_provider text,
    p_name text,
    p_secret_reference text,
    p_connection_config jsonb
) returns uuid
    language plpgsql security definer
    set search_path to ''
    as $$
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

          if p_secret_reference is not null
             and p_secret_reference <> 'env://TENCENTCLOUD_WSA_APIKEY' then
            raise exception using errcode = '22023', message = 'web search credential reference must be env://TENCENTCLOUD_WSA_APIKEY';
          end if;
          if requested_config <> '{}'::jsonb
             and requested_config <> jsonb_build_object(
               'endpoint', 'https://api.wsa.cloud.tencent.com/SearchPro'
             ) then
            raise exception using errcode = '22023', message = 'web search endpoint is deployment-controlled';
          end if;
          normalized_secret_reference := p_secret_reference;
          normalized_config := jsonb_build_object(
            'endpoint', 'https://api.wsa.cloud.tencent.com/SearchPro'
          );

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

revoke all on function public.configure_source_connection(uuid, uuid, text, text, text, jsonb)
  from public, anon;
grant execute on function public.configure_source_connection(uuid, uuid, text, text, text, jsonb)
  to authenticated;
