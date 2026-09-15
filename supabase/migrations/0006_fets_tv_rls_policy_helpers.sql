grant execute on function public.current_role() to authenticated;
grant execute on function public.current_center_id() to authenticated;

drop policy if exists staff_read_candidates on public.candidates;
create policy staff_read_candidates on public.candidates for select to authenticated using (public.current_center_id() = (select center_id from public.exam_sessions where id = exam_session_id));

drop policy if exists staff_read_events on public.candidate_events;
create policy staff_read_events on public.candidate_events for select to authenticated using (public.current_center_id() = (select e.center_id from public.candidates c join public.exam_sessions e on e.id = c.exam_session_id where c.id = candidate_id));

drop policy if exists staff_read_workstations on public.workstations;
create policy staff_read_workstations on public.workstations for select to authenticated using (public.current_center_id() = center_id);

drop policy if exists staff_read_sessions on public.exam_sessions;
create policy staff_read_sessions on public.exam_sessions for select to authenticated using (public.current_center_id() = center_id);

drop policy if exists staff_read_rules on public.schedule_rules;
create policy staff_read_rules on public.schedule_rules for select to authenticated using (public.current_center_id() = center_id);

drop policy if exists staff_insert_display_calls on public.public_display_calls;
create policy staff_insert_display_calls on public.public_display_calls for insert to authenticated with check (public.current_center_id() = center_id and public.current_role() in ('admin','front_office','lab_staff'));

drop policy if exists staff_insert_candidates on public.candidates;
create policy staff_insert_candidates on public.candidates for insert to authenticated with check (public.current_center_id() = (select center_id from public.exam_sessions where id = exam_session_id) and public.current_role() in ('admin','front_office'));

drop policy if exists staff_update_candidates on public.candidates;
create policy staff_update_candidates on public.candidates for update to authenticated using (public.current_center_id() = (select center_id from public.exam_sessions where id = exam_session_id) and public.current_role() in ('admin','front_office')) with check (public.current_center_id() = (select center_id from public.exam_sessions where id = exam_session_id) and public.current_role() in ('admin','front_office'));

drop policy if exists staff_insert_rules on public.schedule_rules;
create policy staff_insert_rules on public.schedule_rules for insert to authenticated with check (public.current_center_id() = center_id and public.current_role() = 'admin');

drop policy if exists staff_update_rules on public.schedule_rules;
create policy staff_update_rules on public.schedule_rules for update to authenticated using (public.current_center_id() = center_id and public.current_role() = 'admin') with check (public.current_center_id() = center_id and public.current_role() = 'admin');
