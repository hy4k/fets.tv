-- Each candidate gets their own exam, not the day's.
--
-- fets.live names exams its own way ("INSTITUTE OF CERTIFIED MANAGEMENT
-- ACCOUNTANTS", "Claude Certified Developer - Foundations"), and the sync only
-- matched a Setup exam whose name was identical, or fell back to one exam for
-- the whole day. Then every clock ran for that exam's length: a 2-hour exam
-- showed 4 hours on the Lab page.
--
-- fets_match_programme finds the Setup exam for a fets.live name: the same
-- name, the code or the first word of the name as a whole word, or a known
-- alias. No match is null — better an honest "exam not set" than a wrong
-- length. A trigger applies it whenever a candidate's fets.live exam is set or
-- changes, until their clock has started.

create or replace function public.fets_match_programme(p_center uuid, p_exam text, p_part text default null)
returns uuid
language sql
stable
set search_path to 'public', 'pg_temp'
as $fn$
  with e as (
    select upper(btrim(coalesce(p_exam, '') || ' ' || coalesce(p_part, ''))) as t
  ),
  p as (
    select id, name, code,
           regexp_replace(upper(split_part(btrim(name), ' ', 1)), '([^A-Z0-9])', '\\\1', 'g') as head,
           regexp_replace(upper(btrim(code)), '([^A-Z0-9 ])', '\\\1', 'g') as c
      from public.exam_programmes
     where center_id = p_center and active
  )
  select p.id
    from p, e
   where e.t <> ''
     and (
       upper(btrim(p.name)) = upper(btrim(p_exam))
       or (p.c <> '' and e.t ~ ('\m' || p.c || '\M'))
       or (length(p.head) >= 3 and e.t ~ ('\m' || p.head || '\M'))
       or (p.c like 'CMA%' and e.t like '%CERTIFIED MANAGEMENT ACCOUNTANT%')
       or (p.c = 'AWS' and e.t like '%AMAZON WEB SERVICES%')
       or (p.c = 'MSFT' and e.t ~ '\m(AZ|AI|DP|PL|SC|MS|MD)-[0-9]{3}\M')
     )
   order by (upper(btrim(p.name)) = upper(btrim(p_exam))) desc, length(p.name) desc
   limit 1;
$fn$;

create or replace function public.fets_candidate_programme()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if new.live_exam_name is not null and new.exam_started_at is null
     and (tg_op = 'INSERT' or new.live_exam_name is distinct from old.live_exam_name
          or new.part is distinct from old.part) then
    new.programme_id := public.fets_match_programme(new.center_id, new.live_exam_name, new.part);
  end if;
  return new;
end;
$fn$;

drop trigger if exists fets_candidate_programme on public.candidates;
create trigger fets_candidate_programme
  before insert or update of live_exam_name, part on public.candidates
  for each row execute function public.fets_candidate_programme();

-- Today's lists, for those not yet started.
update public.candidates c
   set programme_id = public.fets_match_programme(c.center_id, c.live_exam_name, c.part)
  from public.exam_sessions s
 where s.id = c.exam_session_id
   and s.status in ('draft', 'ready', 'live')
   and c.live_exam_name is not null
   and c.exam_started_at is null;
