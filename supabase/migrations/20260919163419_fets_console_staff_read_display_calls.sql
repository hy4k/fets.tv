-- The cutover dropped display_public_read, which was the only SELECT policy on
-- this table and was serving staff as well as anon. Staff need it back, scoped
-- to their own center; anon stays out because it has no grant and no policy.
create policy staff_read_display_calls on public.public_display_calls
  for select to authenticated
  using (center_id = public.current_center_id());
