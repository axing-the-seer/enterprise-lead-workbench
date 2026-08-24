-- Persist Tencent WSA responses, their normalized snapshot and bounded link
-- evidence atomically. The worker is the only caller; browser clients cannot
-- forge raw payloads, evidence provenance or company matches.

create or replace function public.persist_workbench_web_evidence(
    p_job_id uuid,
    p_company_id bigint,
    p_source_record_key text,
    p_raw_payload jsonb,
    p_raw_hash text,
    p_observed_at timestamp with time zone,
    p_normalized_payload jsonb,
    p_normalized_hash text,
    p_evidence_items jsonb
) returns table(
    source_record_id uuid,
    source_snapshot_id uuid,
    evidence_count integer
)
    language plpgsql security definer
    set search_path to ''
    as $$
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
          'tencent_wsa',
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

revoke all on function public.persist_workbench_web_evidence(
  uuid, bigint, text, jsonb, text, timestamp with time zone, jsonb, text, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_workbench_web_evidence(
  uuid, bigint, text, jsonb, text, timestamp with time zone, jsonb, text, jsonb
) to service_role;
