-- The override's stamp is the latest move into the stage, not the first.
--
-- Stamping only when empty kept a retracted time: completed by mistake,
-- moved back, completed properly later — and the record said the first. So
-- the time is stamped whenever the candidate newly enters completed or
-- signed out, and left alone when they were already there.
do $$
declare
  d text;
begin
  d := pg_get_functiondef('public.fets_admin_override(uuid,candidate_stage,text)'::regprocedure);
  if position('p_status = ''completed'' and completed_at is null' in d) = 0
     or position('p_status = ''signed_out'' and signed_out_at is null' in d) = 0 then
    raise exception 'fets_admin_override does not stamp the way this migration expects';
  end if;
  d := replace(d, 'p_status = ''completed'' and completed_at is null',
                  'p_status = ''completed'' and v_from is distinct from ''completed''');
  d := replace(d, 'p_status = ''signed_out'' and signed_out_at is null',
                  'p_status = ''signed_out'' and v_from is distinct from ''signed_out''');
  execute d;
end
$$;
