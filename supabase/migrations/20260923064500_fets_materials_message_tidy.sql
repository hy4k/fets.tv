-- One stray space in the sign-out refusal, and an em dash where the code
-- comment style had leaked into something a person reads.

create or replace function public.fets_sign_out(
  p_candidate uuid,
  p_note text default null
)
returns public.candidates
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c public.candidates;
  v_from public.candidate_stage;
  v_missing text;
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then raise exception 'candidate not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(
    c.center_id, array['admin', 'tca', 'front_office']::public.user_role[]);

  if c.status = 'signed_out' then
    raise exception 'they have already signed out' using errcode = 'P0001';
  end if;

  if c.status <> 'completed' then
    raise exception 'they have not finished the exam yet' using errcode = 'P0001';
  end if;

  select string_agg(
           format('%s × %s',
                  m.issued_count - m.returned_count - m.written_off_count,
                  lower(coalesce(nullif(m.label, ''), k.label))),
           ', ' order by k.sort_order)
    into v_missing
    from public.candidate_materials m
    join public.material_kinds k on k.code = m.kind
   where m.candidate_id = c.id
     and k.returnable
     and m.issued_count > m.returned_count + m.written_off_count;

  if v_missing is not null then
    raise exception 'still holding % — take it back, or write it off with a reason', v_missing
      using errcode = 'P0001';
  end if;

  v_from := c.status;

  update public.candidates
     set status = 'signed_out',
         signed_out_at = now()
   where id = p_candidate
  returning * into c;

  perform public.fets_log_event(c.id, c.center_id, 'candidate.signed_out', v_from, c.status, p_note);

  return c;
end;
$fn$;
