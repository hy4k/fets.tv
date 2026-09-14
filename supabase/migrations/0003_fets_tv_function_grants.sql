revoke all on function public.current_role() from public;
revoke all on function public.transition_candidate(uuid, public.candidate_stage, text, text, uuid) from public;
revoke execute on function public.transition_candidate(uuid, public.candidate_stage, text, text, uuid) from anon;
grant execute on function public.transition_candidate(uuid, public.candidate_stage, text, text, uuid) to authenticated;
revoke all on table public.profiles from anon, authenticated;
