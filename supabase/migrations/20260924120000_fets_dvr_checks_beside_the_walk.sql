-- The DVR is watched on the same clock as the floor is walked.
--
-- The centre runs two checks in parallel from the moment the first candidate
-- sits down: somebody walks the floor every ten minutes, and somebody checks
-- the DVR every ten minutes, each for a ninety-minute shift before handing on.
-- Both belong in the same log, told apart by kind, so the end-of-day export is
-- one list by time and shift.

alter table public.walkthroughs
  add column if not exists kind text not null default 'floor';

alter table public.walkthroughs drop constraint if exists walkthroughs_kind_check;
alter table public.walkthroughs
  add constraint walkthroughs_kind_check check (kind in ('floor', 'dvr'));

drop function if exists public.fets_record_walkthrough(uuid, text);

/**
 * Records a floor walk or a DVR check.
 *
 * As before, anybody may record one — an unrecorded check because the console
 * was fussy about the rota is the worst answer. The post it is filed against
 * prefers the one the check belongs to: the floor post for a walk, the CCTV
 * post for the DVR.
 */
create or replace function public.fets_record_walkthrough(
  p_center uuid,
  p_note text default null,
  p_kind text default 'floor'
)
returns public.walkthroughs
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  w public.walkthroughs;
  pf public.profiles;
  db public.duty_blocks;
  v_session uuid;
  v_kind text := coalesce(p_kind, 'floor');
begin
  perform public.fets_guard(
    p_center, array['admin', 'tca', 'front_office', 'lab_staff']::public.user_role[]);

  if v_kind not in ('floor', 'dvr') then
    raise exception 'a check is a floor walk or a DVR check' using errcode = 'P0001';
  end if;

  select * into pf from public.profiles where id = auth.uid();

  select b.* into db
    from public.duty_blocks b
    join public.duty_posts p on p.id = b.post_id
   where b.center_id = p_center
     and b.profile_id = auth.uid()
     and b.ended_at is null
   order by case
              when v_kind = 'floor' and p.kind = 'lab' then 0
              when v_kind = 'dvr' and p.kind = 'cctv' then 0
              else 1
            end,
            b.started_at desc
   limit 1;

  select id into v_session from public.exam_sessions
   where center_id = p_center and status in ('draft', 'ready', 'live')
   order by created_at desc limit 1;

  insert into public.walkthroughs
    (center_id, exam_session_id, duty_block_id, post_id, walked_by, walked_by_name, note, kind)
  values (
    p_center, v_session, db.id, db.post_id, auth.uid(),
    coalesce(pf.display_name, 'Unknown'),
    nullif(btrim(coalesce(p_note, '')), ''),
    v_kind)
  returning * into w;

  return w;
end;
$fn$;

revoke all on function public.fets_record_walkthrough(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.fets_record_walkthrough(uuid, text, text) to authenticated;

-- The problem report's walk figures are about the floor. Without this, DVR
-- checks would halve the apparent gaps between walks.
do $$
declare
  d text;
  was text := 'from public.walkthroughs
     where exam_session_id = p_session';
begin
  d := pg_get_functiondef('public.fets_problem_report(uuid)'::regprocedure);
  if position(was in d) = 0 then
    raise exception 'fets_problem_report no longer reads walks the way this migration expects';
  end if;
  execute replace(d, was, was || E'\n       and kind = ''floor''');
end
$$;
