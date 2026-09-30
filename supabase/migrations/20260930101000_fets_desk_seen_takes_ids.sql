-- The desk-chat "seen" mark takes the messages the panel showed, so a message
-- that was never on screen (an older day, past the panel's cap) never gets a
-- receipt. Replaces the two-argument form, which marked everything unseen.
drop function if exists public.fets_desk_seen(uuid, text);

create or replace function public.fets_desk_seen(p_center uuid, p_desk text, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  n integer;
begin
  perform public.fets_guard(
    p_center, array['admin', 'tca', 'front_office', 'lab_staff']::public.user_role[]);

  update public.desk_messages
     set seen_at = now(), seen_by = auth.uid()
   where center_id = p_center
     and id = any (coalesce(p_ids, '{}'))
     and seen_at is null
     and from_desk <> p_desk
     and (to_desk = p_desk or to_desk = 'all');
  get diagnostics n = row_count;
  return n;
end;
$fn$;

revoke all on function public.fets_desk_seen(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.fets_desk_seen(uuid, text, uuid[]) to authenticated;
