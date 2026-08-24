alter table public.company_lists
  add column if not exists created_via text not null default 'web_ui',
  add column if not exists created_by_agent text,
  add column if not exists agent_provider text;

alter table public.company_lists
  drop constraint if exists company_lists_created_via_check,
  add constraint company_lists_created_via_check
    check (created_via in ('web_ui', 'workbuddy', 'agent', 'file_upload', 'api')),
  drop constraint if exists company_lists_created_by_agent_not_blank,
  add constraint company_lists_created_by_agent_not_blank
    check (created_by_agent is null or btrim(created_by_agent) <> ''),
  drop constraint if exists company_lists_agent_provider_not_blank,
  add constraint company_lists_agent_provider_not_blank
    check (agent_provider is null or btrim(agent_provider) <> '');

create or replace function public.set_company_list_origin() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

drop trigger if exists company_lists_set_origin on public.company_lists;
create trigger company_lists_set_origin
before insert on public.company_lists
for each row execute function public.set_company_list_origin();

revoke all on function public.set_company_list_origin() from public, anon, authenticated;
grant execute on function public.set_company_list_origin() to service_role;
