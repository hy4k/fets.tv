create or replace function public.current_center_id() returns uuid language sql stable security definer set search_path=public as $$ select center_id from public.profiles where id=auth.uid() $$;
revoke all on function public.current_center_id() from public;
grant execute on function public.current_center_id() to authenticated;
alter table public.centers enable row level security;
create policy staff_read_centers on public.centers for select to authenticated using (id=public.current_center_id());
