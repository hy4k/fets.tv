-- An override that moves somebody to completed or signed out now says when.
--
-- It used to change only the status, so the record lost the moment the
-- candidate was moved on — and anything reading the day's end from those
-- stamps (the floor-walk and DVR log does) saw the day finish earlier than it
-- did. The time is stamped only if it is not already there: an override never
-- rewrites a time that really happened.
do $$
declare
  d text;
  was text := 'update public.candidates set status = p_status, called_at = null where id = p_candidate returning * into c;';
begin
  d := pg_get_functiondef('public.fets_admin_override(uuid,candidate_stage,text)'::regprocedure);
  if position(was in d) = 0 then
    raise exception 'fets_admin_override no longer updates the way this migration expects';
  end if;
  execute replace(d, was,
    'update public.candidates
      set status = p_status,
          called_at = null,
          completed_at = case when p_status = ''completed'' and completed_at is null then now() else completed_at end,
          signed_out_at = case when p_status = ''signed_out'' and signed_out_at is null then now() else signed_out_at end
    where id = p_candidate returning * into c;');
end
$$;
