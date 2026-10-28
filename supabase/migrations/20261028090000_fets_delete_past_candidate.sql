-- A candidate on a finished day can be taken off it.
--
-- Past days were read only: the only way to remove anything was to delete the
-- whole day. Now any member of staff can delete one candidate from a closed
-- day, with a reason. What is deleted is kept as a snapshot — the candidate
-- row, who deleted it, when and why — so the office can always say what was
-- there. A day that is still open is never touched from here.
--
-- Run once in the fets.online Supabase project (ueufcqmdqtwvhjjyudeu).

begin;

create table if not exists public.deleted_candidates (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  exam_session_id uuid,
  candidate_id uuid not null,
  -- The whole candidate row as it was.
  snapshot jsonb not null,
  reason text not null,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_by_name text not null default '',
  deleted_at timestamptz not null default now()
);

create index if not exists deleted_candidates_session_idx on public.deleted_candidates (exam_session_id);

alter table public.deleted_candidates enable row level security;

drop policy if exists staff_read_deleted_candidates on public.deleted_candidates;
create policy staff_read_deleted_candidates on public.deleted_candidates
  for select to authenticated using (public.current_center_id() = center_id);

create or replace function public.fets_delete_past_candidate(p_candidate uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  c public.candidates;
  s public.exam_sessions;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into c from public.candidates where id = p_candidate for update;
  if not found then
    raise exception 'that candidate is already gone' using errcode = 'P0002';
  end if;

  perform public.fets_guard(c.center_id, array['admin', 'tca', 'front_office', 'lab_staff']::public.user_role[]);

  select * into s from public.exam_sessions where id = c.exam_session_id;
  if s.id is not null and s.status in ('draft', 'ready', 'live') then
    raise exception 'this day is still open; only a finished day''s candidates can be deleted here' using errcode = 'P0001';
  end if;
  if v_reason = '' then
    raise exception 'say why this candidate is being deleted' using errcode = 'P0001';
  end if;
  if length(v_reason) > 300 then
    raise exception 'keep the reason under 300 characters' using errcode = 'P0001';
  end if;

  insert into public.deleted_candidates (center_id, exam_session_id, candidate_id, snapshot, reason, deleted_by, deleted_by_name)
  values (
    c.center_id, c.exam_session_id, c.id, to_jsonb(c), v_reason, auth.uid(),
    coalesce((select display_name from public.profiles where id = auth.uid()), '')
  );

  -- A seat or a call still pointing at them would hold the delete.
  update public.workstations set status = 'free', current_candidate_id = null where current_candidate_id = c.id;
  update public.public_display_calls set active = false, candidate_id = null where candidate_id = c.id;

  -- Events, breaks, materials and sections go with the candidate; incidents
  -- and desk messages keep their own record and only lose the link.
  delete from public.candidates where id = c.id;
end;
$fn$;

revoke all on function public.fets_delete_past_candidate(uuid, text) from public, anon;
grant execute on function public.fets_delete_past_candidate(uuid, text) to authenticated;

commit;
