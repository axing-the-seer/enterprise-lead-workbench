--
-- Storage
-- This file declares storage bucket policies.
--

-- The upstream Atomic CRM attachments bucket is not part of the workbench.
-- Remove its tenant-blind policies on both a fresh load and an existing
-- project so hidden legacy routes cannot read or overwrite another user's
-- files. service_role continues to bypass RLS for controlled cleanup.
drop policy if exists "Attachments 1mt4rzk_0" on storage.objects;
drop policy if exists "Attachments 1mt4rzk_1" on storage.objects;
drop policy if exists "Attachments 1mt4rzk_3" on storage.objects;

-- Preserve legacy objects for backup/export and a future separately reviewed
-- import procedure, but close unauthenticated CDN delivery immediately.
update storage.buckets
set public = false
where id = 'attachments';

-- Private import staging. Authenticated uploads use the path
--   <workspace_id>/<user_id>/<opaque filename>
-- Trusted workers may use <workspace_id>/... through service_role, which
-- bypasses storage RLS. The application also validates the 20 MiB limit before
-- upload; the bucket limit is the authoritative backstop.
insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
) values (
    'workbench-imports',
    'workbench-imports',
    false,
    20971520,
    array[
      'text/csv',
      'text/plain',
      'application/json',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]::text[]
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Workspace members can read workbench imports"
    on storage.objects for select to authenticated
    using (
      bucket_id = 'workbench-imports'
      and exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id::text = (storage.foldername(name))[1]
          and wm.user_id = auth.uid()
          and wm.status = 'active'
      )
    );

create policy "Workspace members can upload own workbench imports"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'workbench-imports'
      and (storage.foldername(name))[2] = auth.uid()::text
      and exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id::text = (storage.foldername(name))[1]
          and wm.user_id = auth.uid()
          and wm.status = 'active'
          and wm.role in ('owner', 'admin', 'editor')
      )
    );

create policy "Workspace admins can delete workbench imports"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'workbench-imports'
      and exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id::text = (storage.foldername(name))[1]
          and wm.user_id = auth.uid()
          and wm.status = 'active'
          and wm.role in ('owner', 'admin')
      )
    );

-- Private generated exports. Only trusted workers (service_role, which
-- bypasses RLS) write or clean up objects. Workspace members may read their
-- own workspace prefix; authenticated clients cannot upload or overwrite
-- generated deliverables.
insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
) values (
    'workbench-exports',
    'workbench-exports',
    false,
    52428800,
    array[
      'text/csv',
      'text/html',
      'application/json',
      'application/zip',
      'application/octet-stream',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]::text[]
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Workspace members can read workbench exports"
    on storage.objects for select to authenticated
    using (
      bucket_id = 'workbench-exports'
      and exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id::text = (storage.foldername(name))[1]
          and wm.user_id = auth.uid()
          and wm.status = 'active'
      )
    );
