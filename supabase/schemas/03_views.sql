--
-- Views
-- This file declares all views in the public schema.
--

create or replace view public.activity_log with (security_invoker = on) as
select
    ('company.' || c.id || '.created') as id,
    'company.created' as type,
    c.created_at as date,
    c.id as company_id,
    c.sales_id,
    to_json(c.*) as company,
    null::json as contact,
    null::json as deal,
    null::json as contact_note,
    null::json as deal_note
from public.companies c
union all
select
    ('contact.' || co.id || '.created') as id,
    'contact.created' as type,
    co.first_seen as date,
    co.company_id,
    co.sales_id,
    null::json as company,
    to_json(co.*) as contact,
    null::json as deal,
    null::json as contact_note,
    null::json as deal_note
from public.contacts co
union all
select
    ('contactNote.' || cn.id || '.created') as id,
    'contactNote.created' as type,
    cn.date,
    co.company_id,
    cn.sales_id,
    null::json as company,
    null::json as contact,
    null::json as deal,
    to_json(cn.*) as contact_note,
    null::json as deal_note
from public.contact_notes cn
    left join public.contacts co on co.id = cn.contact_id
union all
select
    ('deal.' || d.id || '.created') as id,
    'deal.created' as type,
    d.created_at as date,
    d.company_id,
    d.sales_id,
    null::json as company,
    null::json as contact,
    to_json(d.*) as deal,
    null::json as contact_note,
    null::json as deal_note
from public.deals d
union all
select
    ('dealNote.' || dn.id || '.created') as id,
    'dealNote.created' as type,
    dn.date,
    d.company_id,
    dn.sales_id,
    null::json as company,
    null::json as contact,
    null::json as deal,
    null::json as contact_note,
    to_json(dn.*) as deal_note
from public.deal_notes dn
    left join public.deals d on d.id = dn.deal_id;

create or replace view public.companies_summary with (security_invoker = on) as
select
    c.id,
    c.workspace_id,
    c.created_at,
    c.updated_at,
    c.name,
    c.normalized_name,
    c.deduplication_key,
    c.unified_social_credit_code,
    c.registration_number,
    c.organization_code,
    c.legal_representative,
    c.operating_status,
    c.company_type,
    c.registered_capital_amount,
    c.paid_in_capital_amount,
    c.registered_capital_currency,
    c.established_on,
    c.approved_on,
    c.registration_authority,
    c.business_scope,
    c.province,
    c.district,
    c.industry_code,
    c.industry_name,
    c.employee_count,
    c.insured_employee_count,
    c.personnel_scale_text,
    c.region_text,
    c.primary_source,
    c.last_verified_at,
    c.profile_status,
    c.completeness_score,
    c.merged_into_company_id,
    c.sector,
    c.size,
    c.linkedin_url,
    c.website,
    c.phone_number,
    c.address,
    c.zipcode,
    c.city,
    c.state_abbr,
    c.sales_id,
    c.context_links,
    c.country,
    c.description,
    c.revenue,
    c.tax_identifier,
    c.logo,
    0::bigint as nb_deals,
    0::bigint as nb_contacts
from public.companies c;

create or replace view public.source_connections_safe with (security_invoker = on) as
select
    sc.id,
    sc.workspace_id,
    sc.provider,
    sc.name,
    sc.connection_kind,
    sc.status,
    sc.has_secret_reference,
    sc.connection_config,
    sc.capabilities,
    sc.default_mapping_version_id,
    sc.external_connection_id,
    sc.last_verified_at,
    sc.last_error_code,
    sc.created_by,
    sc.updated_by,
    sc.created_at,
    sc.updated_at
from public.source_connections sc;

create or replace view public.contacts_summary with (security_invoker = on) as
select
    co.id,
    co.first_name,
    co.last_name,
    co.gender,
    co.title,
    co.background,
    co.avatar,
    co.first_seen,
    co.last_seen,
    co.has_newsletter,
    co.status,
    co.tags,
    co.company_id,
    co.sales_id,
    co.linkedin_url,
    co.email_jsonb,
    co.phone_jsonb,
    (jsonb_path_query_array(co.email_jsonb, '$[*]."email"'))::text as email_fts,
    (jsonb_path_query_array(co.phone_jsonb, '$[*]."number"'))::text as phone_fts,
    c.name as company_name,
    count(distinct t.id) filter (where t.done_date is null) as nb_tasks
from public.contacts co
    left join public.tasks t on co.id = t.contact_id
    left join public.companies c on co.company_id = c.id
group by co.id, c.name;

create or replace view public.init_state with (security_invoker = off) as
select count(sub.id) as is_initialized
from (
    select sales.id from public.sales limit 1
) sub;
