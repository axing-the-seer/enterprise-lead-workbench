-- Align the historical migration chain with the declarative grants. These two
-- legacy ACLs otherwise remain broader on a fresh migration-based deployment.

revoke all on table public.configuration from anon, authenticated;
grant select, insert, update on table public.configuration to authenticated;

revoke all on function public.configure_source_connection(uuid, uuid, text, text, text, jsonb)
  from service_role;
