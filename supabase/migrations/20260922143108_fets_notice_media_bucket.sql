-- Files that go on the TV. Private: the display route holds the service key and
-- signs a short-lived link for whatever is currently up, so nothing here is
-- reachable by guessing a URL, and a file stops being reachable when the
-- message comes down.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'notice-media',
  'notice-media',
  false,
  26214400, -- 25 MB: a photo or a short clip, not a film
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
    'video/mp4', 'video/webm',
    'application/pdf'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Staff work inside their own centre's folder and nowhere else. The first path
-- segment is the centre id, which is what fets_post_custom_notice also checks.
drop policy if exists notice_media_read on storage.objects;
create policy notice_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'notice-media'
    and (storage.foldername(name))[1] = (select center_id::text from public.profiles where id = auth.uid())
  );

drop policy if exists notice_media_write on storage.objects;
create policy notice_media_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'notice-media'
    and (storage.foldername(name))[1] = (select center_id::text from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'tca')
  );

drop policy if exists notice_media_delete on storage.objects;
create policy notice_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'notice-media'
    and (storage.foldername(name))[1] = (select center_id::text from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'tca')
  );