-- Tandem — content uploads in Supabase Storage.
--
-- Creators' draft files (video, images, PDFs) go to the PRIVATE bucket
-- `submissions`, stored as  <collaboration id>/<random id>-<file name>.
--   upload: only the creator in that collaboration, while it is active
--   view:   that creator, the brand's team incl. client reviewers, admins
-- Files are only ever served through short-lived signed URLs.
--
-- Existing projects: run this file once in SQL Editor (after setup.sql).

begin;

alter table public.files add column if not exists storage_path text
  check (storage_path is null or storage_path ~ '^[A-Za-z0-9_-]{1,80}/[A-Za-z0-9._ ()-]{1,200}$');
create unique index if not exists files_storage_path on public.files (storage_path) where storage_path is not null;

-- Who may upload to / read a path in the bucket (the first folder is the collaboration id).
create or replace function public.can_upload_submission_object(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from collaborations k
    where k.id = split_part(object_name, '/', 1) and k.status = 'active'
      and k.creator_id = public.my_creator_id());
$$;

create or replace function public.can_read_submission_object(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from collaborations k
    where k.id = split_part(object_name, '/', 1)
      and (k.creator_id = public.my_creator_id() or public.has_perm(k.org_id, 'campaign.view') or public.is_admin()));
$$;

-- A file record that points into storage must point at the uploader's own collaboration.
drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated with check (
  owner_user_id = public.me()
  and (org_id is null or public.has_perm(org_id, 'org.view') or org_id in (select public.creator_thread_orgs()))
  and (storage_path is null or public.can_upload_submission_object(storage_path)));

-- Private bucket, 50 MB per file (the most a Free Supabase project allows; raise on Pro).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tandem submissions upload" on storage.objects;
create policy "tandem submissions upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and public.can_upload_submission_object(name));

drop policy if exists "tandem submissions read" on storage.objects;
create policy "tandem submissions read" on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and public.can_read_submission_object(name));

-- No update or delete policies: submitted drafts can't be swapped or removed after the fact.

update public.platform_settings set max_upload_mb = 50 where max_upload_mb > 50;

commit;
