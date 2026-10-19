-- TV Channel, part two: how often each slide was on screen and how many
-- phones scanned its QR code.
--
-- Each slide gets a short code. The QR code on the TV points at this console's
-- own /go/<code> link, which adds one to the slide's scans for the day and
-- sends the phone straight on to the slide's link (fets.in/testdrive). The TV
-- counts each time a slide comes on and reports the count every couple of
-- minutes. Both land in one row per slide per day, read in the console as
-- "shown 340 · scanned 27".
--
-- Run once in the fets.online Supabase project (ueufcqmdqtwvhjjyudeu), after
-- the TV Channel SQL. Until it is run the QR codes point straight at the link,
-- as before, and nothing is counted.

begin;

alter table public.display_slides add column if not exists code text;
update public.display_slides
   set code = substr(replace(id::text, '-', ''), 1, 10)
 where code is null;
alter table public.display_slides
  alter column code set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  alter column code set not null;
create unique index if not exists display_slides_code_key on public.display_slides (code);

create table if not exists public.display_slide_stats (
  slide_id uuid not null references public.display_slides(id) on delete cascade,
  -- The day at the centre that made the slide.
  day date not null,
  shown integer not null default 0,
  scans integer not null default 0,
  primary key (slide_id, day)
);

alter table public.display_slide_stats enable row level security;

drop policy if exists staff_read_display_slide_stats on public.display_slide_stats;
create policy staff_read_display_slide_stats on public.display_slide_stats
  for select to authenticated using (
    exists (
      select 1 from public.display_slides s
       where s.id = slide_id and (s.center_id = public.current_center_id() or s.everywhere)
    )
  );

-- A TV reports how many times each slide came on since it last reported.
-- Only slides that TV may play are counted, and no more than a TV could show.
create or replace function public.fets_count_shown(p_center uuid, p_counts jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_rows integer := 0;
begin
  if jsonb_typeof(p_counts) is distinct from 'object' then
    return 0;
  end if;
  insert into public.display_slide_stats as st (slide_id, day, shown)
  select s.id, (now() at time zone coalesce(c.timezone, 'Asia/Kolkata'))::date, least(greatest(x.n, 0), 1000)
    from jsonb_each_text(p_counts) as e(key, value)
    cross join lateral (
      select case when e.key ~ '^[0-9a-f-]{36}$' then e.key::uuid end as id,
             case when e.value ~ '^[0-9]{1,6}$' then e.value::integer else 0 end as n
    ) x
    join public.display_slides s on s.id = x.id and (s.center_id = p_center or s.everywhere)
    join public.centers c on c.id = s.center_id
   where x.n > 0
  on conflict (slide_id, day) do update set shown = st.shown + excluded.shown;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;

-- A phone scanned a slide's QR code: count it and say where to send the phone.
create or replace function public.fets_count_scan(p_code text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  s public.display_slides;
  v_tz text;
begin
  select * into s from public.display_slides where code = lower(p_code);
  if not found or s.link is null then
    return null;
  end if;
  select timezone into v_tz from public.centers where id = s.center_id;
  insert into public.display_slide_stats as st (slide_id, day, scans)
  values (s.id, (now() at time zone coalesce(v_tz, 'Asia/Kolkata'))::date, 1)
  on conflict (slide_id, day) do update set scans = st.scans + 1;
  return s.link;
end;
$fn$;

-- Only the server, holding the service key, counts.
revoke all on function public.fets_count_shown(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fets_count_scan(text) from public, anon, authenticated;
grant execute on function public.fets_count_shown(uuid, jsonb) to service_role;
grant execute on function public.fets_count_scan(text) to service_role;

commit;
