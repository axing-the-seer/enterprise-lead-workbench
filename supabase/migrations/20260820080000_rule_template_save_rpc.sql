-- Atomic RuleTemplate v1 publication for GUI, REST and MCP callers.

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

drop policy if exists "Editors can insert rule sets" on public.rule_sets;
drop policy if exists "Editors can update rule sets" on public.rule_sets;
drop policy if exists "Editors can insert rule set versions" on public.rule_set_versions;
drop policy if exists "Editors can update rule set versions" on public.rule_set_versions;

revoke insert, update on table public.rule_sets from authenticated;
revoke insert, update on table public.rule_set_versions from authenticated;

revoke all on function public.save_rule_template(
  uuid, uuid, text, text, text, jsonb, jsonb, text
) from public, anon;
grant execute on function public.save_rule_template(
  uuid, uuid, text, text, text, jsonb, jsonb, text
) to authenticated;

comment on function public.save_rule_template(
  uuid, uuid, text, text, text, jsonb, jsonb, text
) is
  'Atomically creates or appends an immutable published RuleTemplate v1 version. '
  'The workspace rule-set row is locked while allocating version_number; exact '
  'full-input retries reuse the latest published version.';
