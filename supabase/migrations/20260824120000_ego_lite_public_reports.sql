begin;

-- Existing workspaces move from the retired Tencent WSA configuration to the
-- deployment-managed local Ego Lite runtime. No browser credential is stored.
update public.source_connections
set name = 'Ego Lite 公开信息报告（系统）',
    connection_config = jsonb_build_object('engine', 'ego_lite'),
    secret_reference = null,
    capabilities = array['web_evidence', 'public_report', 'html_report']::text[],
    status = 'draft',
    last_verified_at = null,
    last_error_code = null,
    updated_at = now()
where provider = 'web_search';

-- Keep workspace initialization correct for workspaces created after this
-- migration without duplicating the large, security-reviewed function body.
do $migration$
declare
  function_sql text;
begin
  select pg_get_functiondef(
    'public.initialize_workbench_workspace(text,text)'::regprocedure
  ) into function_sql;

  if position('腾讯云联网搜索（系统）' in function_sql) = 0 then
    raise exception 'initialize_workbench_workspace did not contain the expected legacy web source';
  end if;

  function_sql := replace(
    function_sql,
    '腾讯云联网搜索（系统）',
    'Ego Lite 公开信息报告（系统）'
  );
  function_sql := replace(
    function_sql,
    $old$jsonb_build_object(
          'endpoint', 'https://api.wsa.cloud.tencent.com/SearchPro'
        )$old$,
    $new$jsonb_build_object('engine', 'ego_lite')$new$
  );
  function_sql := replace(
    function_sql,
    $old$array['web_evidence']::text[]$old$,
    $new$array['web_evidence', 'public_report', 'html_report']::text[]$new$
  );

  execute function_sql;
end;
$migration$;

-- The safe configuration RPC must also stop accepting the retired cloud
-- credential and always normalize this provider to the local engine.
do $migration$
declare
  function_sql text;
begin
  select pg_get_functiondef(
    'public.configure_source_connection(uuid,uuid,text,text,text,jsonb)'::regprocedure
  ) into function_sql;

  if position('env://TENCENTCLOUD_WSA_APIKEY' in function_sql) = 0 then
    raise exception 'configure_source_connection did not contain the expected legacy web source';
  end if;

  function_sql := replace(
    function_sql,
    $old$          if p_secret_reference is not null
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
          );$old$,
    $new$          if p_secret_reference is not null then
            raise exception using errcode = '22023', message = 'Ego Lite does not accept browser credentials';
          end if;
          if requested_config <> '{}'::jsonb
             and requested_config <> jsonb_build_object('engine', 'ego_lite') then
            raise exception using errcode = '22023', message = 'Ego Lite connection_config only accepts the managed engine identifier';
          end if;
          normalized_secret_reference := null;
          normalized_config := jsonb_build_object('engine', 'ego_lite');$new$
  );

  if position('env://TENCENTCLOUD_WSA_APIKEY' in function_sql) > 0 then
    raise exception 'configure_source_connection legacy web source replacement failed';
  end if;

  execute function_sql;
end;
$migration$;

commit;
