--
-- Workspace tenancy foundation
--
-- This file intentionally loads before the Atomic CRM tables. New production
-- domain tables use workspace_id as a mandatory tenant boundary and composite
-- foreign keys to make cross-workspace references impossible at the database
-- layer, even for trusted application code.
--

create extension if not exists "citext" with schema "extensions";
create extension if not exists "pgcrypto" with schema "extensions";

create table public.workspaces (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug extensions.citext not null,
    owner_user_id uuid not null,
    status text not null default 'active',
    settings jsonb not null default '{}'::jsonb,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    constraint workspaces_name_not_blank check (btrim(name) <> ''),
    constraint workspaces_slug_format check (slug::text ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
    constraint workspaces_status_check check (status in ('active', 'suspended', 'archived')),
    constraint workspaces_settings_object check (jsonb_typeof(settings) = 'object'),
    constraint workspaces_slug_key unique (slug),
    constraint workspaces_owner_user_id_fkey foreign key (owner_user_id) references auth.users(id) on delete restrict
);

create table public.workspace_members (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    user_id uuid not null,
    role text not null,
    status text not null default 'active',
    invited_by uuid,
    joined_at timestamp with time zone,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    constraint workspace_members_role_check check (role in ('owner', 'admin', 'editor', 'viewer')),
    constraint workspace_members_status_check check (status in ('invited', 'active', 'suspended')),
    constraint workspace_members_owner_active check (role <> 'owner' or status = 'active'),
    constraint workspace_members_workspace_user_key unique (workspace_id, user_id),
    constraint workspace_members_workspace_id_id_key unique (workspace_id, id),
    constraint workspace_members_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete restrict,
    constraint workspace_members_user_id_fkey foreign key (user_id) references auth.users(id) on delete restrict,
    constraint workspace_members_invited_by_fkey foreign key (invited_by) references auth.users(id) on delete set null
);

create unique index workspace_members_one_owner_idx
    on public.workspace_members (workspace_id)
    where role = 'owner' and status = 'active';

create index workspace_members_user_active_idx
    on public.workspace_members (user_id, workspace_id)
    where status = 'active';
