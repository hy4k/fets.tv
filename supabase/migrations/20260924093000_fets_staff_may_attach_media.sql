-- The last two places a role was still named.
--
-- Notice attachments go straight to storage from the browser rather than
-- through a function, so the guard never sees them and these policies decide.
-- They named admin and tca, which is the same miss as the Setup tables: the
-- rule moved and the copies of it did not.
--
-- Nobody at FETS holds front_office or lab_staff today, so this changes nothing
-- for the three people using it -- which is exactly why it would have sat here
-- until the first new hire sent an image to the hall screen and got a storage
-- error nobody could explain.

drop policy if exists notice_media_write on storage.objects;
create policy notice_media_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'notice-media'
    and (storage.foldername(name))[1] = (select center_id::text from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) <> 'viewer'
  );

drop policy if exists notice_media_delete on storage.objects;
create policy notice_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'notice-media'
    and (storage.foldername(name))[1] = (select center_id::text from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) <> 'viewer'
  );
