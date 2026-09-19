-- Re-call and Clear have never once succeeded: candidate_events.to_status is
-- NOT NULL and both passed null, so every press raised 23502 and rolled the
-- whole action back. Twelve calls are logged in production and zero re-calls.
--
-- Neither is a stage change, so they log the candidate's current status on both
-- sides, exactly as fets_call_candidate already does for 'display.call_updated'.

create or replace function public.fets_clear_call(p_center uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidate uuid;
  v_status public.candidate_stage;
begin
  perform public.fets_guard(p_center, array['admin', 'tca']::public.user_role[]);

  select candidate_id into v_candidate from public.public_display_calls
   where center_id = p_center and active order by created_at desc limit 1;

  update public.candidates set called_at = null where center_id = p_center and called_at is not null;
  update public.public_display_calls set active = false where center_id = p_center and active;

  if v_candidate is not null then
    select status into v_status from public.candidates where id = v_candidate;
    perform public.fets_log_event(v_candidate, p_center, 'display.call_cleared', v_status, v_status);
  end if;
end;
$$;

create or replace function public.fets_recall(p_center uuid)
returns public.public_display_calls
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.public_display_calls;
  v_status public.candidate_stage;
begin
  perform public.fets_guard(p_center, array['admin', 'tca']::public.user_role[]);

  select * into d from public.public_display_calls
   where center_id = p_center and active and candidate_id is not null
   order by created_at desc limit 1;

  if not found then
    raise exception 'nothing is on the display to re-call' using errcode = 'P0001';
  end if;

  update public.public_display_calls set active = false where center_id = p_center and active;

  insert into public.public_display_calls
    (center_id, candidate_id, token, candidate_name, room_label, instruction, hall, call_nonce, active, created_by)
  values (d.center_id, d.candidate_id, d.token, d.candidate_name, d.room_label, d.instruction, d.hall,
          d.call_nonce + 1, true, auth.uid())
  returning * into d;

  select status into v_status from public.candidates where id = d.candidate_id;

  perform public.fets_log_event(d.candidate_id, p_center, 'display.recalled', v_status, v_status, null,
    jsonb_build_object('nonce', d.call_nonce));
  return d;
end;
$$;
