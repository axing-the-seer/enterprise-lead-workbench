begin;

-- A source that cannot normalize its status must not downgrade an existing
-- known company status to the internal `unknown` sentinel.
do $migration$
declare
  function_sql text;
  old_fragment text := $old$operating_status = coalesce(nullif(p_normalized_payload #>> '{status,normalized}', ''), c.operating_status)$old$;
  new_fragment text := $new$operating_status = coalesce(nullif(nullif(p_normalized_payload #>> '{status,normalized}', 'unknown'), ''), c.operating_status)$new$;
begin
  select pg_get_functiondef(
    'public.persist_workbench_ingestion_record(uuid,text,text,jsonb,text,timestamp with time zone,jsonb,text,jsonb)'::regprocedure
  ) into function_sql;

  if position(old_fragment in function_sql) = 0 then
    raise exception 'persist_workbench_ingestion_record did not contain the expected status update';
  end if;

  function_sql := replace(function_sql, old_fragment, new_fragment);
  execute function_sql;
end;
$migration$;

-- Repair only rows that were downgraded to unknown while a retained source
-- snapshot already contains a known normalized status.
with latest_known as (
  select distinct on (ss.workspace_id, ss.company_id)
    ss.workspace_id,
    ss.company_id,
    ss.normalized_payload #>> '{status,normalized}' as known_status
  from public.source_snapshots ss
  where ss.company_id is not null
    and ss.normalized_payload #>> '{status,normalized}' in (
      'active', 'cancelled', 'revoked', 'suspended', 'liquidating', 'relocated', 'inactive'
    )
  order by ss.workspace_id, ss.company_id, ss.captured_at desc
)
update public.companies c
set operating_status = latest_known.known_status,
    updated_at = now()
from latest_known
where c.workspace_id = latest_known.workspace_id
  and c.id = latest_known.company_id
  and c.operating_status = 'unknown';

commit;
