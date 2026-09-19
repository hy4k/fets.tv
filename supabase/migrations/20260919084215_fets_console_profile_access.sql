-- 0003 revoked profiles outright, which left RLS enabled with no policy and no
-- grant: the console could not read the signed-in operator's own profile.
create policy profiles_read_own_center on public.profiles
  for select to authenticated
  using (center_id = public.current_center_id() or id = auth.uid());

grant select on public.profiles to authenticated;

-- public_displays picked up Supabase's default anon grants when it was created.
revoke all on public.public_displays from anon;

-- Pin the search path on the one function the linter flagged as mutable.
create or replace function public.fets_next_status(
  p_status public.candidate_stage,
  p_frisking boolean,
  p_biometrics boolean
)
returns public.candidate_stage
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_status
    when 'scheduled' then 'arrived'
    when 'arrived' then 'id_checked'
    when 'id_checked' then 'waiting'
    when 'waiting' then case when p_frisking then 'frisking' when p_biometrics then 'biometrics' else 'assigned' end
    when 'frisking' then case when p_biometrics then 'biometrics' else 'assigned' end
    when 'biometrics' then 'assigned'
    when 'assigned' then 'lab_entry'
    when 'lab_entry' then 'testing'
    when 'testing' then 'completed'
    when 'completed' then 'signed_out'
  end::public.candidate_stage;
$$;

revoke all on function public.fets_next_status(public.candidate_stage, boolean, boolean) from public, anon;
grant execute on function public.fets_next_status(public.candidate_stage, boolean, boolean) to authenticated;
