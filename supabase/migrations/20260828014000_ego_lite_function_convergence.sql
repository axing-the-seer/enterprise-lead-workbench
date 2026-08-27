begin;

-- Re-declare the complete post-Ego-Lite function bodies. Earlier historical
-- migrations used guarded text replacements; this convergence migration makes
-- both fresh installs and upgraded databases independent of function formatting.
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

revoke all on function public.initialize_workbench_workspace(text, text) from public, anon;
grant execute on function public.initialize_workbench_workspace(text, text) to authenticated;
grant execute on function public.initialize_workbench_workspace(text, text) to service_role;

revoke all on function public.configure_source_connection(uuid, uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.configure_source_connection(uuid, uuid, text, text, text, jsonb) to authenticated;
revoke all on function public.configure_source_connection(uuid, uuid, text, text, text, jsonb) from service_role;

revoke all on function public.persist_workbench_web_evidence(uuid, bigint, text, jsonb, text, timestamp with time zone, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.persist_workbench_web_evidence(uuid, bigint, text, jsonb, text, timestamp with time zone, jsonb, text, jsonb) to service_role;

commit;

