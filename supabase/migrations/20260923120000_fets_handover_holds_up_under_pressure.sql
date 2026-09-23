-- Five things the handover got wrong, found in review.
--
-- Two of them matter. A four digit PIN with no lockout is not a signature: at
-- pgcrypto's default bcrypt cost the whole space falls in under a minute of
-- scripted calls, so any of the three staff could forge a colleague's
-- acceptance. And the acceptance was bound to the post rather than to the
-- block the screen was showing, so a dialog left open while somebody else
-- reassigned the post would pin the old holder's note on the new holder and
-- close the block they had only just started.

-- ---------------------------------------------------------------- throttle --

alter table public.staff_pins
  add column if not exists failed_attempts integer not null default 0;

alter table public.staff_pins
  add column if not exists locked_until timestamptz;

/**
 * Wrong guesses before the PIN stops answering, and for how long.
 *
 * Five is generous for somebody typing their own four digits at a desk and
 * ruinous for a script: ten thousand combinations at five tries a quarter of
 * an hour is over a year. The lockout is per person, not per caller, because
 * the caller is whoever's screen it is and that is not the thing being
 * protected.
 */
create or replace function public.fets_pin_tries()
returns integer language sql immutable as $fn$ select 5 $fn$;

create or replace function public.fets_pin_lockout()
returns interval language sql immutable as $fn$ select interval '15 minutes' $fn$;

-- ------------------------------------------------------------- setting one --

/**
 * Sets somebody's PIN, and clears whatever lockout was on the old one.
 *
 * The cost goes up with it. pgcrypto's default for bcrypt is 6, which is
 * roughly a millisecond a guess -- fine in 1999, not now. Ten is about a
 * tenth of a second: unnoticeable behind a single deliberate keypress, and
 * three orders of magnitude of grief for anybody trying the space.
 */
create or replace function public.fets_set_pin(
  p_profile uuid,
  p_pin text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  pf public.profiles;
  me public.profiles;
begin
  select * into pf from public.profiles where id = p_profile;
  if not found then raise exception 'no such person' using errcode = 'P0002'; end if;

  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.center_id <> pf.center_id then
    raise exception 'that person is not at your centre' using errcode = 'P0002';
  end if;

  if me.id <> pf.id and me.role <> 'admin' then
    raise exception 'only an admin sets somebody else''s PIN' using errcode = '42501';
  end if;

  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'a PIN is four to six digits' using errcode = 'P0001';
  end if;

  if p_pin in ('0000', '1111', '1234', '000000', '111111', '123456', '123123') then
    raise exception 'choose a PIN that is not that one' using errcode = 'P0001';
  end if;

  insert into public.staff_pins (profile_id, center_id, pin_hash, set_by)
  values (p_profile, pf.center_id,
          extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), auth.uid())
  on conflict (profile_id) do update
     set pin_hash = excluded.pin_hash,
         set_at = now(),
         set_by = auth.uid(),
         failed_attempts = 0,
         locked_until = null;

  update public.profiles set pin_set_at = now() where id = p_profile;
end;
$fn$;

-- --------------------------------------------------------------- accepting --

-- The return type changes from a row to a verdict, so the old signature goes.
drop function if exists public.fets_accept_handover(uuid, uuid, text, text, integer);

/**
 * Hands a post over: the outgoing person's account, and the incoming person's
 * signature for it.
 *
 * It returns a verdict rather than raising on a bad PIN, and that is not a
 * style choice. A raise rolls the transaction back, and the failed attempt
 * would roll back with it -- a counter that cannot survive the thing it is
 * counting is not a counter. So the PIN outcomes come back as data and
 * everything else still raises.
 *
 * `p_expected_block` is the block the screen was showing. Somebody else may
 * have reassigned the post while the dialog sat open; without this the note
 * would land on whoever is there now, and their fresh block would be closed
 * on the spot. Pass null to mean "the screen showed nobody on it".
 *
 *   {"ok": true,  "block": {...}}
 *   {"ok": false, "reason": "no_pin" | "wrong_pin" | "locked", ...}
 */
create or replace function public.fets_accept_handover(
  p_post uuid,
  p_profile uuid,
  p_pin text,
  p_handover_note text default null,
  p_minutes integer default null,
  p_expected_block uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  dp public.duty_posts;
  pf public.profiles;
  sp public.staff_pins;
  v_open public.duty_blocks;
  db public.duty_blocks;
  v_at timestamptz := now();
  v_left integer;
begin
  select * into dp from public.duty_posts where id = p_post;
  if not found then raise exception 'no such post' using errcode = 'P0002'; end if;

  -- The same check fets_start_duty makes, stated here rather than left to fail
  -- halfway through: a wider guard on the outside only buys a confusing error.
  perform public.fets_guard(dp.center_id, array['admin', 'tca']::public.user_role[]);

  select * into pf from public.profiles where id = p_profile;
  if not found or pf.center_id <> dp.center_id then
    raise exception 'that person does not work at this centre' using errcode = 'P0002';
  end if;

  -- Take the post first, so two screens accepting at once queue rather than
  -- both deciding the coast is clear.
  select * into v_open from public.duty_blocks
   where post_id = p_post and ended_at is null
   for update;

  if coalesce(v_open.id::text, '') <> coalesce(p_expected_block::text, '') then
    raise exception 'somebody else has changed % since this screen opened', dp.name
      using errcode = 'P0001';
  end if;

  select * into sp from public.staff_pins where profile_id = p_profile for update;

  if sp.pin_hash is null then
    return jsonb_build_object('ok', false, 'reason', 'no_pin', 'name', pf.display_name);
  end if;

  if sp.locked_until is not null and sp.locked_until > v_at then
    return jsonb_build_object(
      'ok', false, 'reason', 'locked', 'name', pf.display_name,
      'locked_until', sp.locked_until);
  end if;

  if extensions.crypt(coalesce(p_pin, ''), sp.pin_hash) <> sp.pin_hash then
    -- A lockout that has run out starts the count again rather than leaving
    -- somebody one wrong keystroke from being shut out for the rest of the day.
    v_left := case when sp.locked_until is not null then 1 else sp.failed_attempts + 1 end;

    update public.staff_pins
       set failed_attempts = v_left,
           locked_until = case when v_left >= public.fets_pin_tries()
                               then v_at + public.fets_pin_lockout() end
     where profile_id = p_profile;

    return jsonb_build_object(
      'ok', false,
      'reason', case when v_left >= public.fets_pin_tries() then 'locked' else 'wrong_pin' end,
      'name', pf.display_name,
      'tries_left', greatest(public.fets_pin_tries() - v_left, 0),
      'locked_until', case when v_left >= public.fets_pin_tries()
                           then v_at + public.fets_pin_lockout() end);
  end if;

  update public.staff_pins
     set failed_attempts = 0, locked_until = null
   where profile_id = p_profile;

  -- The outgoing person's account of what they are handing over goes on their
  -- own block, which fets_start_duty is about to close.
  if v_open.id is not null and nullif(btrim(coalesce(p_handover_note, '')), '') is not null then
    update public.duty_blocks
       set handover_note = btrim(p_handover_note)
     where id = v_open.id;
  end if;

  db := public.fets_start_duty(p_post, p_profile, p_minutes, v_at);

  update public.duty_blocks
     set accepted_at = v_at,
         accepted_with_pin = true
   where id = db.id
  returning * into db;

  return jsonb_build_object('ok', true, 'block', to_jsonb(db));
end;
$fn$;

/** Removes a PIN, and the lockout with it, so a new one starts clean. */
create or replace function public.fets_clear_pin(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pf public.profiles;
begin
  select * into pf from public.profiles where id = p_profile;
  if not found then raise exception 'no such person' using errcode = 'P0002'; end if;

  perform public.fets_guard(pf.center_id, array['admin']::public.user_role[]);

  delete from public.staff_pins where profile_id = p_profile;
  update public.profiles set pin_set_at = null where id = p_profile;
end;
$fn$;

revoke all on function
  public.fets_accept_handover(uuid, uuid, text, text, integer, uuid),
  public.fets_pin_tries(),
  public.fets_pin_lockout()
  from public, anon, authenticated;

grant execute on function
  public.fets_accept_handover(uuid, uuid, text, text, integer, uuid),
  public.fets_pin_tries(),
  public.fets_pin_lockout()
  to authenticated;

-- ------------------------------------------------------- telling the others --

-- Setting a PIN on one console left every other console still showing the
-- person as unable to sign, because profiles was never published.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public'
                      and tablename = 'profiles') then
      alter publication supabase_realtime add table public.profiles;
    end if;
  end if;
end
$$;
