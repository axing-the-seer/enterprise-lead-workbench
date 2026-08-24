begin;

create extension if not exists pgtap with schema extensions;

select plan(43);

select has_function(
  'public',
  'save_rule_template',
  array['uuid', 'uuid', 'text', 'text', 'text', 'jsonb', 'jsonb', 'text'],
  'atomic RuleTemplate v1 save RPC exists'
);

select ok(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'save_rule_template'
      and pg_get_function_identity_arguments(p.oid) =
        'p_workspace_id uuid, p_rule_set_id uuid, p_name text, p_description text, p_business_objective text, p_rule_definition jsonb, p_scoring_definition jsonb, p_change_note text'
  ),
  'rule-template save RPC is security definer'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.save_rule_template(uuid,uuid,text,text,text,jsonb,jsonb,text)',
    'EXECUTE'
  ),
  'anonymous callers cannot save rule templates'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.save_rule_template(uuid,uuid,text,text,text,jsonb,jsonb,text)',
    'EXECUTE'
  ),
  'authenticated users can reach the role-checked save RPC'
);

select ok(
  not has_table_privilege('authenticated', 'public.rule_sets', 'INSERT'),
  'authenticated clients cannot insert rule sets directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.rule_sets', 'UPDATE'),
  'authenticated clients cannot update rule sets directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.rule_set_versions', 'INSERT'),
  'authenticated clients cannot insert rule versions directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.rule_set_versions', 'UPDATE'),
  'authenticated clients cannot update rule versions directly'
);

create function pg_temp.valid_rule_template(p_weight numeric default 20)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', 'client-placeholder',
    'name', '客户端占位名称',
    'eligibility', jsonb_build_object(
      'root', jsonb_build_object(
        'id', 'eligibility-root',
        'combinator', 'and',
        'rules', jsonb_build_array(
          jsonb_build_object(
            'id', 'registered-capital-gate',
            'label', '注册资本门槛',
            'field', 'registration.capital.valueWan',
            'operator', 'gte',
            'value', 500,
            'missingPolicy', 'review',
            'enabled', true
          )
        )
      ),
      'onNoMatch', 'exclude',
      'onUnknown', 'review'
    ),
    'rules', jsonb_build_array(
      jsonb_build_object(
        'id', 'capital-score',
        'label', '注册资本加分',
        'kind', 'priority',
        'field', 'registration.capital.valueWan',
        'operator', 'gte',
        'value', 1000,
        'weight', p_weight,
        'onMatch', 'score',
        'missingPolicy', 'review',
        'enabled', true
      )
    ),
    'thresholds', jsonb_build_object(
      'p1', 75,
      'p2', 50,
      'minimumCompleteness', 60
    )
  );
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000051',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'rule-owner@example.test', '', now(),
    '{"workbench_provisioning":"administrator"}'::jsonb,
    '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000052',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'rule-editor@example.test', '', now(),
    '{"workbench_provisioning":"administrator"}'::jsonb,
    '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000053',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'rule-viewer@example.test', '', now(),
    '{"workbench_provisioning":"administrator"}'::jsonb,
    '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000054',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'rule-outsider@example.test', '', now(),
    '{"workbench_provisioning":"administrator"}'::jsonb,
    '{}'::jsonb, now(), now()
  );

insert into public.workspaces (id, name, slug, owner_user_id) values
  (
    '13000000-0000-0000-0000-000000000001',
    'Rule Workspace A',
    'rule-workspace-a',
    '00000000-0000-0000-0000-000000000051'
  ),
  (
    '13000000-0000-0000-0000-000000000002',
    'Rule Workspace B',
    'rule-workspace-b',
    '00000000-0000-0000-0000-000000000054'
  );

insert into public.workspace_members (
  workspace_id, user_id, role, status, invited_by
) values
  (
    '13000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000052',
    'editor', 'active', '00000000-0000-0000-0000-000000000051'
  ),
  (
    '13000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000053',
    'viewer', 'active', '00000000-0000-0000-0000-000000000051'
  ),
  (
    '13000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000052',
    'editor', 'active', '00000000-0000-0000-0000-000000000054'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000053', true);

select throws_ok(
  $$
    select * from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001', null,
      '工业客户规则', '初版规则', '筛选重点客户',
      pg_temp.valid_rule_template(),
      '{"engineVersion":"lead-rules-v1"}'::jsonb,
      '初始发布'
    )
  $$,
  '42501',
  'workspace editor role is required to save rule templates',
  'viewer cannot save a rule template'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000054', true);

select throws_ok(
  $$
    select * from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001', null,
      '工业客户规则', '初版规则', '筛选重点客户',
      pg_temp.valid_rule_template(),
      '{"engineVersion":"lead-rules-v1"}'::jsonb,
      '初始发布'
    )
  $$,
  '42501',
  'workspace editor role is required to save rule templates',
  'non-member cannot save into another workspace'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000052', true);

select is(
  (
    select version_number
    from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001', null,
      '工业客户规则', '初版规则', '筛选重点客户',
      pg_temp.valid_rule_template(),
      '{"engineVersion":"lead-rules-v1"}'::jsonb,
      '初始发布'
    )
  ),
  1,
  'editor atomically creates the first published version'
);

select is(
  (
    select status || '|' || current_version_number::text || '|' ||
      description || '|' || business_objective
    from public.rule_sets
    where name = '工业客户规则'
  ),
  'active|1|初版规则|筛选重点客户',
  'rule set points to the newly published version with its business metadata'
);

select is(
  (
    select status || '|' || canonical_schema_version || '|' ||
      change_note || '|' || (published_at is not null)::text
    from public.rule_set_versions
    where rule_set_id = (
      select id from public.rule_sets where name = '工业客户规则'
    )
  ),
  'published|1.0|初始发布|true',
  'version is published as immutable RuleTemplate v1'
);

select is(
  (
    select (rsv.rule_definition ->> 'id') || '|' ||
      (rsv.rule_definition ->> 'name')
    from public.rule_set_versions rsv
    join public.rule_sets rs on rs.id = rsv.rule_set_id
    where rs.name = '工业客户规则'
  ),
  (
    select id::text || '|工业客户规则'
    from public.rule_sets
    where name = '工业客户规则'
  ),
  'database replaces client placeholders with the stable rule-set identity and name'
);

select is(
  (
    select rule_definition #>> '{eligibility,onUnknown}'
    from public.rule_set_versions
    where rule_set_id = (
      select id from public.rule_sets where name = '工业客户规则'
    )
  ),
  'review',
  'RuleTemplate v1 eligibility tree is stored intact'
);

select is(
  (
    select rule_version_id
    from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户规则'),
      '工业客户规则', '初版规则', '筛选重点客户',
      pg_temp.valid_rule_template(),
      '{"engineVersion":"lead-rules-v1"}'::jsonb,
      '初始发布'
    )
  ),
  (
    select id
    from public.rule_set_versions
    where rule_set_id = (
      select id from public.rule_sets where name = '工业客户规则'
    )
      and version_number = 1
  ),
  'an exact full-input retry returns the existing published version'
);

select is(
  (
    select count(*)::integer
    from public.rule_set_versions
    where rule_set_id = (
      select id from public.rule_sets where name = '工业客户规则'
    )
  ),
  1,
  'exact retry does not create another version'
);

select is(
  (
    select version_number
    from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户规则'),
      '工业客户规则', '初版规则', '筛选战略客户',
      pg_temp.valid_rule_template(),
      '{"engineVersion":"lead-rules-v1"}'::jsonb,
      '初始发布'
    )
  ),
  2,
  'business-objective change publishes a new version'
);

select is(
  (
    select version_number
    from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户规则'),
      '工业客户规则', '第二版规则', '筛选战略客户',
      pg_temp.valid_rule_template(),
      '{"engineVersion":"lead-rules-v1"}'::jsonb,
      '初始发布'
    )
  ),
  3,
  'description change publishes a new version'
);

select is(
  (
    select version_number
    from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户规则'),
      '工业客户规则', '第二版规则', '筛选战略客户',
      pg_temp.valid_rule_template(),
      '{"engineVersion":"lead-rules-v1"}'::jsonb,
      '调整说明'
    )
  ),
  4,
  'change-note change publishes a new version'
);

select is(
  (
    select version_number
    from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户规则'),
      '工业客户规则', '第二版规则', '筛选战略客户',
      pg_temp.valid_rule_template(),
      '{"engineVersion":"lead-rules-v2"}'::jsonb,
      '调整说明'
    )
  ),
  5,
  'scoring-definition change publishes a new version'
);

select is(
  (
    select version_number
    from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户规则'),
      '工业客户规则', '第二版规则', '筛选战略客户',
      pg_temp.valid_rule_template(25),
      '{"engineVersion":"lead-rules-v2"}'::jsonb,
      '调整说明'
    )
  ),
  6,
  'rule-definition change publishes a new version'
);

select is(
  (
    select version_number
    from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户规则'),
      '工业客户优选规则', '第二版规则', '筛选战略客户',
      pg_temp.valid_rule_template(25),
      '{"engineVersion":"lead-rules-v2"}'::jsonb,
      '调整说明'
    )
  ),
  7,
  'name change publishes a new version'
);

select is(
  (
    select status || '|' || current_version_number::text || '|' || name
    from public.rule_sets
    where name = '工业客户优选规则'
  ),
  'active|7|工业客户优选规则',
  'current version advances only after every published insert succeeds'
);

select is(
  (
    select rule_set_id::text || '|' || version_number::text
    from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001', null,
      '工业客户优选规则', '第二版规则', '筛选战略客户',
      pg_temp.valid_rule_template(25),
      '{"engineVersion":"lead-rules-v2"}'::jsonb,
      '调整说明'
    )
  ),
  (
    select id::text || '|7'
    from public.rule_sets
    where name = '工业客户优选规则'
  ),
  'same-name create retry locks and reuses the existing rule set and version'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where workspace_id = '13000000-0000-0000-0000-000000000001'
      and action = 'rule_template.published'
  ),
  7,
  'each new published version has one audit event and retries add none'
);

select throws_ok(
  $$
    update public.rule_set_versions
    set change_note = '篡改已发布版本'
    where workspace_id = '13000000-0000-0000-0000-000000000001'
      and version_number = 7
  $$,
  '42501',
  'published versions are immutable; create a new draft version',
  'published versions remain immutable even for direct privileged updates'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000052', true);

select throws_ok(
  $$
    select * from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户优选规则'),
      '工业客户优选规则', '第二版规则', '筛选战略客户',
      '[]'::jsonb, '{}'::jsonb, '无效定义'
    )
  $$,
  '22023',
  'rule definition must be a JSON object',
  'non-object rule definition is rejected'
);

select throws_ok(
  $$
    select * from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户优选规则'),
      '工业客户优选规则', '第二版规则', '筛选战略客户',
      pg_temp.valid_rule_template(), '[]'::jsonb, '无效评分'
    )
  $$,
  '22023',
  'scoring definition must be a JSON object',
  'non-object scoring definition is rejected'
);

select throws_ok(
  $$
    select * from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户优选规则'),
      '工业客户优选规则', '第二版规则', '筛选战略客户',
      pg_temp.valid_rule_template() - 'rules', '{}'::jsonb, '缺少规则'
    )
  $$,
  '22023',
  'RuleTemplate v1 rules must be an array with at most 200 entries',
  'RuleTemplate without a rules array is rejected'
);

select throws_ok(
  $$
    select * from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户优选规则'),
      '工业客户优选规则', '第二版规则', '筛选战略客户',
      jsonb_set(pg_temp.valid_rule_template(), '{thresholds,p1}', '40'::jsonb),
      '{}'::jsonb, '无效阈值'
    )
  $$,
  '22023',
  'RuleTemplate v1 thresholds are invalid',
  'P1 lower than P2 is rejected'
);

select throws_ok(
  $$
    select * from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户优选规则'),
      '工业客户优选规则', '第二版规则', '筛选战略客户',
      jsonb_set(pg_temp.valid_rule_template(), '{rules,0,operator}', '"unknown"'::jsonb),
      '{}'::jsonb, '无效操作符'
    )
  $$,
  '22023',
  'RuleTemplate v1 contains an invalid lead rule',
  'unknown lead-rule operator is rejected'
);

select throws_ok(
  $$
    select * from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户优选规则'),
      '工业客户优选规则', '第二版规则', '筛选战略客户',
      jsonb_set(pg_temp.valid_rule_template(), '{eligibility,onUnknown}', '"maybe"'::jsonb),
      '{}'::jsonb, '无效未知策略'
    )
  $$,
  '22023',
  'RuleTemplate v1 eligibility root is invalid',
  'unknown eligibility policy is rejected'
);

select throws_ok(
  $$
    select * from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户优选规则'),
      '工业客户优选规则', '第二版规则', '筛选战略客户',
      jsonb_set(
        pg_temp.valid_rule_template(),
        '{eligibility,root,rules,0,id}',
        '"eligibility-root"'::jsonb
      ),
      '{}'::jsonb, '重复条件 ID'
    )
  $$,
  '22023',
  'RuleTemplate v1 eligibility node IDs must be unique',
  'duplicate eligibility IDs are rejected'
);

select is(
  (
    select version_number
    from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户优选规则'),
      '工业客户优选规则', '第二版规则', '筛选战略客户',
      jsonb_set(
        pg_temp.valid_rule_template(25),
        '{eligibility}',
        '{
          "root":{
            "id":"g1","combinator":"and","rules":[
              {"id":"g2","combinator":"and","rules":[
                {"id":"g3","combinator":"and","rules":[
                  {"id":"g4","combinator":"and","rules":[
                    {"id":"g5","combinator":"and","rules":[
                      {"id":"c1","label":"条件","field":"name","operator":"present","missingPolicy":"review","enabled":true}
                    ]}
                  ]}
                ]}
              ]}
            ]
          },
          "onNoMatch":"exclude",
          "onUnknown":"review"
        }'::jsonb
      ),
      '{"engineVersion":"lead-rules-v2"}'::jsonb,
      '五层条件组边界'
    )
  ),
  8,
  'five eligibility group levels are accepted like the domain schema'
);

select throws_ok(
  $$
    select * from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户优选规则'),
      '工业客户优选规则', '第二版规则', '筛选战略客户',
      jsonb_set(
        pg_temp.valid_rule_template(),
        '{eligibility}',
        '{
          "root":{
            "id":"g1","combinator":"and","rules":[
              {"id":"g2","combinator":"and","rules":[
                {"id":"g3","combinator":"and","rules":[
                  {"id":"g4","combinator":"and","rules":[
                    {"id":"g5","combinator":"and","rules":[
                      {"id":"g6","combinator":"and","rules":[
                        {"id":"c1","label":"条件","field":"name","operator":"present","missingPolicy":"review","enabled":true}
                      ]}
                    ]}
                  ]}
                ]}
              ]}
            ]
          },
          "onNoMatch":"exclude",
          "onUnknown":"review"
        }'::jsonb
      ),
      '{}'::jsonb, '条件树过深'
    )
  $$,
  '22023',
  'RuleTemplate v1 eligibility exceeds 5 levels',
  'eligibility deeper than five levels is rejected'
);

select throws_ok(
  $$
    select * from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户优选规则'),
      '工业客户优选规则', '第二版规则', '筛选战略客户',
      pg_temp.valid_rule_template() || jsonb_build_object('padding', repeat('x', 263000)),
      '{}'::jsonb, '超大规则'
    )
  $$,
  '22023',
  'rule template JSON is too large',
  'oversized rule JSON is rejected before persistence'
);

select throws_ok(
  $$
    select * from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户优选规则'),
      '工业客户优选规则', '第二版规则', '筛选战略客户',
      pg_temp.valid_rule_template() || jsonb_build_object('token', 'do-not-store'),
      '{}'::jsonb, '包含密钥'
    )
  $$,
  '22023',
  'rule template contains a forbidden secret-like key',
  'secret-like keys are rejected from rule configuration'
);

select is(
  (
    select count(*)::integer
    from public.rule_set_versions
    where workspace_id = '13000000-0000-0000-0000-000000000001'
  ),
  8,
  'invalid calls leave no partial rule versions'
);

select throws_ok(
  $$
    select * from public.save_rule_template(
      '13000000-0000-0000-0000-000000000002',
      (select id from public.rule_sets where name = '工业客户优选规则'),
      '跨空间规则', '错误空间', '不应保存',
      pg_temp.valid_rule_template(), '{}'::jsonb, '跨空间'
    )
  $$,
  'P0002',
  'rule set not found in workspace',
  'same editor cannot rebind a rule set to another workspace'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000053', true);

select is(
  (
    select count(*)::integer
    from public.rule_sets
    where workspace_id = '13000000-0000-0000-0000-000000000001'
  ),
  1,
  'viewer can read rule-set metadata through RLS'
);

reset role;

update public.rule_sets
set status = 'archived'
where workspace_id = '13000000-0000-0000-0000-000000000001'
  and name = '工业客户优选规则';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000052', true);

select throws_ok(
  $$
    select * from public.save_rule_template(
      '13000000-0000-0000-0000-000000000001',
      (select id from public.rule_sets where name = '工业客户优选规则'),
      '工业客户优选规则', '第二版规则', '筛选战略客户',
      pg_temp.valid_rule_template(25),
      '{"engineVersion":"lead-rules-v2"}'::jsonb,
      '归档后修改'
    )
  $$,
  '55000',
  'archived rule set cannot receive new versions',
  'archived rule set cannot receive another version'
);

select is(
  (
    select count(*)::integer
    from public.rule_set_versions
    where workspace_id = '13000000-0000-0000-0000-000000000001'
  ),
  8,
  'archived rejection leaves version history unchanged'
);

select * from finish();
rollback;
