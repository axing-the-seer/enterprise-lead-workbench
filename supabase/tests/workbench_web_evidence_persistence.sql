begin;

create extension if not exists pgtap with schema extensions;

select plan(36);

select has_function(
  'public',
  'persist_workbench_web_evidence',
  array[
    'uuid', 'bigint', 'text', 'jsonb', 'text',
    'timestamp with time zone', 'jsonb', 'text', 'jsonb'
  ],
  'atomic web-evidence persistence RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.persist_workbench_web_evidence(uuid,bigint,text,jsonb,text,timestamp with time zone,jsonb,text,jsonb)',
    'EXECUTE'
  ),
  'anonymous callers cannot persist web evidence'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.persist_workbench_web_evidence(uuid,bigint,text,jsonb,text,timestamp with time zone,jsonb,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot forge web evidence'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.persist_workbench_web_evidence(uuid,bigint,text,jsonb,text,timestamp with time zone,jsonb,text,jsonb)',
    'EXECUTE'
  ),
  'service worker can persist web evidence atomically'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000031',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'web-owner-a@example.test', '', now(),
    '{"workbench_provisioning":"administrator"}'::jsonb,
    '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000032',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'web-owner-b@example.test', '', now(),
    '{"workbench_provisioning":"administrator"}'::jsonb,
    '{}'::jsonb, now(), now()
  );

insert into public.workspaces (id, name, slug, owner_user_id) values
  ('12000000-0000-0000-0000-000000000001', 'Web Workspace A', 'web-workspace-a', '00000000-0000-0000-0000-000000000031'),
  ('12000000-0000-0000-0000-000000000002', 'Web Workspace B', 'web-workspace-b', '00000000-0000-0000-0000-000000000032');

insert into public.companies (
  id, workspace_id, name, unified_social_credit_code
) values
  (301, '12000000-0000-0000-0000-000000000001', '联网证据企业 A', '91110000000000301A'),
  (303, '12000000-0000-0000-0000-000000000001', '联网证据企业 A2', '91110000000000303A'),
  (302, '12000000-0000-0000-0000-000000000002', '联网证据企业 B', '91110000000000302B');

insert into public.source_connections (
  id, workspace_id, provider, name, connection_kind, status,
  connection_config, capabilities, created_by, updated_by
) values
  (
    '22000000-0000-0000-0000-000000000001',
    '12000000-0000-0000-0000-000000000001',
    'web_search', '腾讯云联网搜索', 'web_search', 'draft',
    '{"endpoint":"https://api.wsa.cloud.tencent.com/SearchPro"}'::jsonb,
    array['web_evidence']::text[],
    '00000000-0000-0000-0000-000000000031',
    '00000000-0000-0000-0000-000000000031'
  ),
  (
    '22000000-0000-0000-0000-000000000002',
    '12000000-0000-0000-0000-000000000001',
    'qcc', '企查查', 'cli', 'draft', '{}'::jsonb,
    array['company_registration']::text[],
    '00000000-0000-0000-0000-000000000031',
    '00000000-0000-0000-0000-000000000031'
  );

insert into public.ingestion_jobs (
  id, workspace_id, source_connection_id, job_kind, status,
  idempotency_key, input_params, requested_by, started_at, worker_id
) values
  (
    '32000000-0000-0000-0000-000000000001',
    '12000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'enrich', 'running', 'web-evidence-job-0001', '{}'::jsonb,
    '00000000-0000-0000-0000-000000000031', now(), 'web-worker-test'
  ),
  (
    '32000000-0000-0000-0000-000000000002',
    '12000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000002',
    'enrich', 'running', 'qcc-evidence-job-0002', '{}'::jsonb,
    '00000000-0000-0000-0000-000000000031', now(), 'web-worker-test'
  ),
  (
    '32000000-0000-0000-0000-000000000003',
    '12000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'enrich', 'queued', 'web-queued-job-0003', '{}'::jsonb,
    '00000000-0000-0000-0000-000000000031', null, null
  );

set local role service_role;

select is(
  (
    select evidence_count
    from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001',
      301,
      'wsa:company-a:request-1',
      '{"requestId":"req-1","pages":[{"rank":1}]}'::jsonb,
      repeat('a', 64),
      '2026-08-20 04:00:00+00'::timestamp with time zone,
      '{"provider":"ego_lite","query":"联网证据企业 A"}'::jsonb,
      repeat('b', 64),
      '[
        {
          "url":"https://example.com/company-a",
          "title":"企业 A 官方信息",
          "snippet":"官方页面披露的企业信息。",
          "claimType":"official_website",
          "confidence":0.95,
          "usageScope":"link_only",
          "sourceName":"示例官网",
          "publishedAt":"2026-08-19T08:00:00Z",
          "retrievedAt":"2026-08-20T04:00:00Z",
          "authorityLevel":3,
          "providerScore":0.92,
          "query":"联网证据企业 A",
          "version":"wsa-v1",
          "requestId":"req-1"
        },
        {
          "url":"https://example.com/company-a",
          "title":"企业 A 风险提示",
          "snippet":"同一页面中的另一类主张。",
          "claimType":"news",
          "confidence":0.72,
          "usageScope":"link_only",
          "retrievedAt":"2026-08-20T04:00:00Z"
        },
        {
          "url":"https://example.com/company-a",
          "title":"重复主张不应重复落库",
          "claimType":"official_website",
          "confidence":0.95,
          "usageScope":"link_only",
          "retrievedAt":"2026-08-20T04:00:00Z"
        }
      ]'::jsonb
    )
  ),
  2,
  'evidence_count reports unique input fingerprints, including deduplication within the call'
);

select is(
  (select count(*)::integer from public.source_records),
  1,
  'web persistence writes one raw source record'
);

select is(
  (
    select record_kind || '|' || content_hash
    from public.source_records
  ),
  'web_evidence|' || repeat('a', 64),
  'raw source record is typed and hash-addressed'
);

select is(
  (select count(*)::integer from public.source_snapshots),
  1,
  'web persistence writes one normalized snapshot'
);

select is(
  (
    select company_id::text || '|' || match_status || '|' || content_hash
    from public.source_snapshots
  ),
  '301|matched|' || repeat('b', 64),
  'normalized snapshot is matched to the requested same-workspace company'
);

select is(
  (select count(*)::integer from public.company_evidence),
  2,
  'two unique company, URL and claim-type fingerprints are persisted'
);

select is(
  (
    select count(*)::integer
    from public.company_evidence
    where evidence_type = 'web'
      and evidence_status = 'unverified'
      and source_provider = 'ego_lite'
      and observed_at = '2026-08-20 04:00:00+00'::timestamp with time zone
  ),
  2,
  'web evidence has the required provider, status and observation time'
);

select is(
  (
    select count(distinct evidence_fingerprint)::integer
    from public.company_evidence
    where length(evidence_fingerprint) = 64
  ),
  2,
  'fingerprints are stable SHA-256 values over company, URL and claim type'
);

select is(
  (
    select (metadata ->> 'claim_type') || '|' ||
      (metadata ->> 'confidence') || '|' ||
      (metadata ->> 'usage_scope') || '|' ||
      (metadata ->> 'link_only') || '|' ||
      (metadata ->> 'source_name') || '|' ||
      (metadata ->> 'published_at') || '|' ||
      (metadata ->> 'authority_level') || '|' ||
      (metadata ->> 'provider_score') || '|' ||
      (metadata ->> 'query') || '|' ||
      (metadata ->> 'version') || '|' ||
      (metadata ->> 'request_id')
    from public.company_evidence
    where metadata ->> 'claim_type' = 'official_website'
  ),
  'official_website|0.95|link_only|true|示例官网|2026-08-19T08:00:00Z|3|0.92|联网证据企业 A|wsa-v1|req-1',
  'required WSA metadata remains attributable without becoming company facts'
);

select is(
  (select count(*)::integer from public.company_field_facts),
  0,
  'web evidence does not create canonical company field facts'
);

select is(
  (select count(*)::integer from public.company_list_members),
  0,
  'web evidence persistence does not create list membership'
);

select is(
  (
    select profile_status || '|' || (last_verified_at is null)::text
    from public.companies
    where id = 301
  ),
  'unverified|true',
  'web evidence does not promote or update the canonical company'
);

select is(
  (
    select source_record_id::text || '|' || source_snapshot_id::text || '|' || evidence_count::text
    from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001',
      301,
      'wsa:company-a:request-1',
      '{"requestId":"req-1","pages":[{"rank":1}]}'::jsonb,
      repeat('a', 64),
      '2026-08-20 04:00:00+00'::timestamp with time zone,
      '{"provider":"ego_lite","query":"联网证据企业 A"}'::jsonb,
      repeat('b', 64),
      '[
        {"url":"https://example.com/company-a","title":"企业 A 官方信息","snippet":"","claimType":"official_website","confidence":0.95,"usageScope":"link_only","retrievedAt":"2026-08-20T04:00:00Z"},
        {"url":"https://example.com/company-a","title":"企业 A 风险提示","snippet":"","claimType":"news","confidence":0.72,"usageScope":"link_only","retrievedAt":"2026-08-20T04:00:00Z"}
      ]'::jsonb
    )
  ),
  (
    select sr.id::text || '|' || ss.id::text || '|2'
    from public.source_records sr
    join public.source_snapshots ss on ss.source_record_id = sr.id
  ),
  'idempotent retry returns the existing record and snapshot with a stable evidence_count'
);

select is(
  (
    select
      (select count(*) from public.source_records)::text || '|' ||
      (select count(*) from public.source_snapshots)::text || '|' ||
      (select count(*) from public.company_evidence)::text
  ),
  '1|1|2',
  'idempotent retry does not duplicate raw, snapshot or evidence rows'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 301,
      'wsa:company-a:request-1', '{}'::jsonb, repeat('c', 64), now(),
      '{}'::jsonb, repeat('b', 64), '[]'::jsonb
    )
  $$,
  '23505',
  'source record key was already persisted with different content',
  'same job and source key cannot be rebound to different raw content'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 303,
      'wsa:company-a:request-1',
      '{"requestId":"req-1","pages":[{"rank":1}]}'::jsonb,
      repeat('a', 64), now(), '{}'::jsonb, repeat('e', 64), '[]'::jsonb
    )
  $$,
  '23505',
  'source record was already matched to another company',
  'an existing source record cannot be rebound within the same workspace'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000002', 301,
      'qcc-not-web', '{}'::jsonb, repeat('c', 64), now(),
      '{}'::jsonb, repeat('d', 64), '[]'::jsonb
    )
  $$,
  '22023',
  'ingestion job is not a web search job',
  'non-web provider jobs cannot persist web evidence'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000003', 301,
      'queued-web-job', '{}'::jsonb, repeat('c', 64), now(),
      '{}'::jsonb, repeat('d', 64), '[]'::jsonb
    )
  $$,
  'P0002',
  'running ingestion job not found',
  'queued jobs cannot persist execution results'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 302,
      'cross-workspace-company', '{}'::jsonb, repeat('c', 64), now(),
      '{}'::jsonb, repeat('d', 64), '[]'::jsonb
    )
  $$,
  '23503',
  'company does not belong to the ingestion workspace',
  'company match cannot cross workspace boundaries'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 301,
      'invalid-usage-scope', '{}'::jsonb, repeat('c', 64), now(),
      '{}'::jsonb, repeat('d', 64),
      '[{"url":"https://example.com/check","title":"check","snippet":"","claimType":"news","confidence":0.5,"usageScope":"internal_analysis","retrievedAt":"2026-08-20T04:00:00Z"}]'::jsonb
    )
  $$,
  '22023',
  'web evidence usageScope must be link_only',
  'usage scope cannot be widened beyond link-only evidence'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 301,
      'invalid-claim-type', '{}'::jsonb, repeat('c', 64), now(),
      '{}'::jsonb, repeat('d', 64),
      '[{"url":"https://example.com/check","title":"check","snippet":"","claimType":"registration","confidence":0.5,"usageScope":"link_only","retrievedAt":"2026-08-20T04:00:00Z"}]'::jsonb
    )
  $$,
  '22023',
  'evidence claim type is not allowed',
  'claim type is restricted to the published seven-value DSL enum'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 301,
      'invalid-confidence', '{}'::jsonb, repeat('c', 64), now(),
      '{}'::jsonb, repeat('d', 64),
      '[{"url":"https://example.com/check","title":"check","snippet":"","claimType":"news","confidence":1.01,"usageScope":"link_only","retrievedAt":"2026-08-20T04:00:00Z"}]'::jsonb
    )
  $$,
  '22023',
  'evidence confidence must be a number between 0 and 1',
  'confidence is bounded to a numeric zero-to-one score'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 301,
      'invalid-provider-score', '{}'::jsonb, repeat('c', 64), now(),
      '{}'::jsonb, repeat('d', 64),
      '[{"url":"https://example.com/check","title":"check","snippet":"","claimType":"news","confidence":0.5,"usageScope":"link_only","retrievedAt":"2026-08-20T04:00:00Z","providerScore":2}]'::jsonb
    )
  $$,
  '22023',
  'evidence providerScore must be a number between 0 and 1',
  'provider score is bounded to a numeric zero-to-one score'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 301,
      'invalid-authority', '{}'::jsonb, repeat('c', 64), now(),
      '{}'::jsonb, repeat('d', 64),
      '[{"url":"https://example.com/check","title":"check","snippet":"","claimType":"news","confidence":0.5,"usageScope":"link_only","retrievedAt":"2026-08-20T04:00:00Z","authorityLevel":6}]'::jsonb
    )
  $$,
  '22023',
  'evidence authorityLevel must be a number between 0 and 5',
  'authority level is bounded to a numeric zero-to-five score'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 301,
      'invalid-retrieved-time', '{}'::jsonb, repeat('c', 64), now(),
      '{}'::jsonb, repeat('d', 64),
      '[{"url":"https://example.com/check","title":"check","snippet":"","claimType":"news","confidence":0.5,"usageScope":"link_only","retrievedAt":"not-a-time"}]'::jsonb
    )
  $$,
  '22023',
  'evidence retrievedAt must be an ISO-8601 timestamp',
  'retrieved timestamp must be valid ISO-8601'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 301,
      'invalid-published-time', '{}'::jsonb, repeat('c', 64), now(),
      '{}'::jsonb, repeat('d', 64),
      '[{"url":"https://example.com/check","title":"check","snippet":"","claimType":"news","confidence":0.5,"usageScope":"link_only","retrievedAt":"2026-08-20T04:00:00Z","publishedAt":"2026-99-99T00:00:00Z"}]'::jsonb
    )
  $$,
  '22023',
  'evidence publishedAt must be an ISO-8601 timestamp',
  'published timestamp must be a real ISO-8601 time'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 301,
      'invalid-url', '{}'::jsonb, repeat('c', 64), now(),
      '{}'::jsonb, repeat('d', 64),
      '[{"sourceUrl":"file:///etc/passwd","title":"bad"}]'::jsonb
    )
  $$,
  '22023',
  'evidence source URL must be an absolute HTTP(S) URL without credentials',
  'non-HTTP evidence URLs are rejected'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 301,
      'too-many-items', '{}'::jsonb, repeat('c', 64), now(),
      '{}'::jsonb, repeat('d', 64),
      (select jsonb_agg(jsonb_build_object(
        'sourceUrl', 'https://example.com/' || n,
        'title', 'item ' || n
      )) from generate_series(1, 11) n)
    )
  $$,
  '22023',
  'at most 10 evidence items are allowed',
  'web response cannot create more than ten evidence rows per record'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 301,
      'oversized-raw', jsonb_build_object('body', repeat('x', 1048577)),
      repeat('c', 64), now(), '{}'::jsonb, repeat('d', 64), '[]'::jsonb
    )
  $$,
  '22023',
  'web evidence JSON payload is too large',
  'raw and normalized JSON sizes are bounded before storage'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 301,
      'secret-payload', '{"authorization":"Bearer leaked"}'::jsonb,
      repeat('c', 64), now(), '{}'::jsonb, repeat('d', 64), '[]'::jsonb
    )
  $$,
  '22023',
  'web evidence payload contains a forbidden secret-like key',
  'secret-like keys are rejected before raw storage'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 301,
      'long-excerpt', '{}'::jsonb, repeat('c', 64), now(),
      '{}'::jsonb, repeat('d', 64),
      jsonb_build_array(jsonb_build_object(
        'sourceUrl', 'https://example.com/long',
        'title', 'long excerpt',
        'excerpt', repeat('x', 4001)
      ))
    )
  $$,
  '22023',
  'evidence excerpt is too long',
  'individual evidence excerpt length is bounded'
);

select throws_ok(
  $$
    select * from public.persist_workbench_web_evidence(
      '32000000-0000-0000-0000-000000000001', 301,
      'null-raw', null, repeat('c', 64), now(),
      '{}'::jsonb, repeat('d', 64), '[]'::jsonb
    )
  $$,
  '22023',
  'raw and normalized payloads must be JSON objects',
  'null raw payload is rejected explicitly'
);

select * from finish();

rollback;
