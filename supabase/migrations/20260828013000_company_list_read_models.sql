create or replace view public.company_lists_overview
with (security_invoker = on)
as
select
  cl.*,
  count(clm.id) filter (where clm.membership_status <> 'excluded')::bigint as company_count
from public.company_lists cl
left join public.company_list_members clm
  on clm.workspace_id = cl.workspace_id
 and clm.company_list_id = cl.id
group by cl.id;

create or replace view public.company_list_entries
with (security_invoker = on)
as
select
  clm.id,
  clm.id as member_id,
  clm.workspace_id,
  clm.company_list_id,
  clm.company_id,
  clm.source_record_id,
  clm.membership_status,
  clm.added_at,
  clm.updated_at as membership_updated_at,
  c.name,
  c.normalized_name,
  c.unified_social_credit_code,
  c.registration_number,
  c.operating_status,
  c.legal_representative,
  c.registered_capital_amount,
  c.registered_capital_currency,
  c.established_on,
  c.province,
  c.city,
  c.district,
  c.industry_code,
  c.industry_name,
  c.employee_count,
  c.insured_employee_count,
  c.website,
  c.phone_number,
  c.address,
  c.profile_status,
  c.completeness_score,
  c.primary_source,
  c.last_verified_at,
  latest_snapshot.normalized_payload as latest_normalized_payload,
  latest_report.id as current_report_id,
  latest_report.evidence_job_id as current_report_job_id,
  latest_report.submitted_at as current_report_submitted_at
from public.company_list_members clm
join public.companies c
  on c.workspace_id = clm.workspace_id
 and c.id = clm.company_id
left join lateral (
  select ss.normalized_payload
  from public.source_snapshots ss
  where ss.workspace_id = clm.workspace_id
    and ss.company_id = clm.company_id
  order by ss.captured_at desc, ss.id desc
  limit 1
) latest_snapshot on true
left join lateral (
  select cr.id, cr.evidence_job_id, cr.submitted_at
  from public.company_reports cr
  where cr.workspace_id = clm.workspace_id
    and cr.company_id = clm.company_id
    and cr.is_current = true
  order by cr.submitted_at desc, cr.id desc
  limit 1
) latest_report on true;

revoke all on table public.company_lists_overview from anon, authenticated;
grant select on table public.company_lists_overview to authenticated;
grant all on table public.company_lists_overview to service_role;

revoke all on table public.company_list_entries from anon, authenticated;
grant select on table public.company_list_entries to authenticated;
grant all on table public.company_list_entries to service_role;
