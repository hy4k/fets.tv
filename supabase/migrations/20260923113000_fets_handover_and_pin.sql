-- Handing a post over, and signing for it.
--
-- A rotation is not a button press; it is one person telling another what is
-- happening in the room and the other agreeing to carry it. Two things were
-- missing. The outgoing person had nowhere to say what they were handing over,
-- and nothing recorded that the incoming person had actually turned up and
-- taken it -- so a rota could show a post covered by somebody who was still in
-- the car park.
--
-- The note goes on the block that is ending, because that is whose account it
-- is. The acceptance goes on the block that is starting, because that is who is
-- answering for it. A four to six digit PIN, which the incoming person types on
-- the outgoing person's screen, is what makes it their signature rather than
-- somebody else's claim about them.

alter table public.duty_blocks
  add column if not exists handover_note text
    check (handover_note is null or length(handover_note) <= 2000);

alter table public.duty_blocks
  add column if not exists accepted_at timestamptz;

-- Whether a PIN was actually typed. An admin can still put somebody on a post
-- without one -- somebody has to be able to fix a rota at eight in the morning
-- -- but the record says which of the two happened.
alter table public.duty_blocks
  add column if not exists accepted_with_pin boolean not null default false;

alter table public.duty_blocks
  drop constraint if exists duty_blocks_accepted_together;
alter table public.duty_blocks
  add constraint duty_blocks_accepted_together
  check (accepted_with_pin = false or accepted_at is not null);

-- The PIN itself is never stored, only a bcrypt hash of it -- and not on
-- profiles, which every signed-in member of the centre can read. A four digit
-- PIN behind bcrypt falls in milliseconds to anybody who can read the hash, so
-- the hash lives in a table with row level security on, no policy and no grant:
-- nothing reaches it except the security-definer functions below.
create table if not exists public.staff_pins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  center_id uuid not null references public.centers(id) on delete cascade,
  pin_hash text not null,
  set_at timestamptz not null default now(),
  set_by uuid references auth.users(id)
);

alter table public.staff_pins enable row level security;
revoke all on public.staff_pins from public, anon, authenticated;

-- Whether somebody has a PIN is not a secret, and the console has to show it.
alter table public.profiles add column if not exists pin_set_at timestamptz;

/**
 * Sets somebody's PIN.
 *
 * Your own, or anybody's if you are an admin -- a PIN that cannot be reset by
 * the person running the centre is a PIN that locks a post on the day it is
 * forgotten. Four to six digits: long enough not to be guessed over a shoulder
 * in one go, short enough to be typed at a desk with a queue behind it.
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

  -- The obvious ones are the ones that get shoulder-surfed first.
  if p_pin in ('0000', '1111', '1234', '000000', '111111', '123456', '123123') then
    raise exception 'choose a PIN that is not that one' using errcode = 'P0001';
  end if;

  insert into public.staff_pins (profile_id, center_id, pin_hash, set_by)
  values (p_profile, pf.center_id, extensions.crypt(p_pin, extensions.gen_salt('bf')), auth.uid())
  on conflict (profile_id) do update
     set pin_hash = excluded.pin_hash,
         set_at = now(),
         set_by = auth.uid();

  update public.profiles set pin_set_at = now() where id = p_profile;
end;
$fn$;

/** Removes a PIN, so the person has to be given a new one before they sign. */
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

/**
 * Hands a post over: the outgoing person's account, and the incoming person's
 * signature for it.
 *
 * The PIN is typed by the person coming on, on the screen of the person going
 * off. That is the whole point -- the caller is whoever happens to be logged
 * in, and the PIN is what makes the acceptance the incoming person's own rather
 * than a claim made on their behalf.
 */
create or replace function public.fets_accept_handover(
  p_post uuid,
  p_profile uuid,
  p_pin text,
  p_handover_note text default null,
  p_minutes integer default null
)
returns public.duty_blocks
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  dp public.duty_posts;
  pf public.profiles;
  v_open public.duty_blocks;
  db public.duty_blocks;
  v_hash text;
  v_at timestamptz := now();
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

  select pin_hash into v_hash from public.staff_pins where profile_id = p_profile;

  if v_hash is null then
    raise exception '% has no PIN yet; an admin can set one in Setup', pf.display_name
      using errcode = 'P0001';
  end if;

  if extensions.crypt(coalesce(p_pin, ''), v_hash) <> v_hash then
    raise exception 'that PIN is not right' using errcode = '42501';
  end if;

  -- The outgoing person's account of what they are handing over goes on their
  -- own block, which fets_start_duty is about to close.
  select * into v_open from public.duty_blocks
   where post_id = p_post and ended_at is null
   for update;

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

  return db;
end;
$fn$;

revoke all on function
  public.fets_set_pin(uuid, text),
  public.fets_clear_pin(uuid),
  public.fets_accept_handover(uuid, uuid, text, text, integer)
  from public, anon, authenticated;

grant execute on function
  public.fets_set_pin(uuid, text),
  public.fets_clear_pin(uuid),
  public.fets_accept_handover(uuid, uuid, text, text, integer)
  to authenticated;
