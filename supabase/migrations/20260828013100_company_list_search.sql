create or replace function public.search_company_list_ids(
  p_workspace_id uuid,
  p_query text,
  p_limit integer default 5000
)
returns table(company_list_id uuid)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_query text := lower(btrim(p_query));
begin
  if p_workspace_id is null then
    raise exception using errcode = '22023', message = 'workspace id is required';
  end if;
  if normalized_query is null or length(normalized_query) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'search query must contain 1 to 200 characters';
  end if;
  if p_limit not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'search result limit must be between 1 and 5000';
  end if;

  return query
  select distinct clm.company_list_id
  from public.company_list_members clm
  join public.companies c
    on c.workspace_id = clm.workspace_id
   and c.id = clm.company_id
  where clm.workspace_id = p_workspace_id
    and clm.membership_status <> 'excluded'
    and (
      position(normalized_query in lower(c.name)) > 0
      or position(normalized_query in lower(coalesce(c.unified_social_credit_code, ''))) > 0
      or position(normalized_query in lower(coalesce(c.legal_representative, ''))) > 0
    )
  order by clm.company_list_id
  limit p_limit;
end;
$$;

revoke all on function public.search_company_list_ids(uuid, text, integer) from public, anon;
grant execute on function public.search_company_list_ids(uuid, text, integer) to authenticated, service_role;
