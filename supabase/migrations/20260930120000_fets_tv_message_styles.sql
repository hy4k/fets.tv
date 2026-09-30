-- TV messages get a look, and the good ones are kept.
--
-- A custom message can now carry a style — font, size, colour, background,
-- shape, alignment, bold — chosen from a short list that reads from the back
-- of a hall. The list is enforced here as well as in the app: anything this
-- function does not know is dropped, so a stored style can never smuggle CSS
-- onto the television.
--
-- And a message worth saying again ("Mobile phones must be switched off",
-- "Lunch break 13:00–13:30") can be saved with its style and put back on the
-- TV in one press, instead of being retyped every morning.

alter table public.display_notices add column if not exists style jsonb not null default '{}'::jsonb;

create or replace function public.fets_notice_style(p jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select case when p is not null and jsonb_typeof(p) = 'object' then jsonb_strip_nulls(jsonb_build_object(
    'font', case when p->>'font' in ('serif', 'display', 'sans', 'mono') then p->>'font' end,
    'size', case when p->>'size' in ('m', 'l', 'xl') then p->>'size' end,
    'color', case when p->>'color' ~ '^#[0-9a-fA-F]{6}$' then lower(p->>'color') end,
    'background', case when p->>'background' in ('midnight', 'gold', 'aurora', 'sunrise', 'forest', 'stripes', 'dots', 'paper') then p->>'background' end,
    'shape', case when p->>'shape' in ('rounded', 'square', 'soft') then p->>'shape' end,
    'align', case when p->>'align' in ('center', 'left') then p->>'align' end,
    'bold', case when jsonb_typeof(p->'bold') = 'boolean' and (p->>'bold')::boolean then true end
  )) else '{}'::jsonb end;
$fn$;

drop function if exists public.fets_post_custom_notice(uuid, text, text, text, text, integer);

create or replace function public.fets_post_custom_notice(
  p_center uuid,
  p_body text,
  p_tone text default 'info',
  p_media_path text default null,
  p_media_kind text default null,
  p_expires_minutes integer default null,
  p_style jsonb default '{}'::jsonb
)
returns public.display_notices
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  n public.display_notices;
  v_body text := btrim(coalesce(p_body, ''));
  v_path text := nullif(btrim(coalesce(p_media_path, '')), '');
begin
  perform public.fets_guard(p_center, array['admin', 'tca']::public.user_role[]);

  if v_body = '' and v_path is null then
    raise exception 'a message needs words, a file, or both' using errcode = 'P0001';
  end if;

  if length(v_body) > 280 then
    raise exception 'a message must be 280 characters or fewer' using errcode = 'P0001';
  end if;

  if p_tone not in ('info', 'warning', 'urgent') then
    raise exception 'unknown tone %', p_tone using errcode = 'P0001';
  end if;

  if p_expires_minutes is not null and (p_expires_minutes < 1 or p_expires_minutes > 720) then
    raise exception 'an expiry must be between 1 and 720 minutes' using errcode = 'P0001';
  end if;

  if v_path is not null then
    if p_media_kind is null or p_media_kind not in ('image', 'video', 'file') then
      raise exception 'say whether the file is an image, a video or a file' using errcode = 'P0001';
    end if;
    if v_path !~ ('^' || p_center::text || '/[A-Za-z0-9._-]{1,120}$') then
      raise exception 'that file does not belong to this center' using errcode = 'P0001';
    end if;
  end if;

  update public.display_notices set active = false, cleared_at = now(), cleared_by = auth.uid()
   where center_id = p_center and active;

  insert into public.display_notices
    (center_id, template_id, template_key, template_label, values, body, body_override, tone,
     media_path, media_kind, active, expires_at, created_by, style)
  values (
    p_center, null, 'custom', 'Custom message', '{}'::jsonb, v_body, v_body, p_tone,
    v_path,
    case when v_path is null then null else p_media_kind end,
    true,
    case when p_expires_minutes is null then null else now() + make_interval(mins => p_expires_minutes) end,
    auth.uid(),
    public.fets_notice_style(p_style)
  )
  returning * into n;

  return n;
end;
$fn$;

revoke all on function public.fets_post_custom_notice(uuid, text, text, text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.fets_post_custom_notice(uuid, text, text, text, text, integer, jsonb) to authenticated;

-- Saved messages.
create table if not exists public.notice_presets (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  label text not null check (btrim(label) <> '' and length(label) <= 60),
  body text not null check (btrim(body) <> '' and length(body) <= 280),
  tone text not null default 'info' check (tone in ('info', 'warning', 'urgent')),
  style jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists notice_presets_label_idx on public.notice_presets (center_id, lower(label));

alter table public.notice_presets enable row level security;
drop policy if exists staff_read_notice_presets on public.notice_presets;
create policy staff_read_notice_presets on public.notice_presets
  for select to authenticated using (center_id = public.current_center_id());
grant select on public.notice_presets to authenticated;

/** Saves a message and its look under a name; the same name replaces it. */
create or replace function public.fets_save_notice_preset(
  p_center uuid, p_label text, p_body text, p_tone text default 'info', p_style jsonb default '{}'::jsonb
)
returns public.notice_presets
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r public.notice_presets;
  v_label text := btrim(coalesce(p_label, ''));
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform public.fets_guard(p_center, array['admin', 'tca']::public.user_role[]);
  if v_label = '' then raise exception 'give the message a name' using errcode = 'P0001'; end if;
  if v_body = '' then raise exception 'write the message first' using errcode = 'P0001'; end if;
  if length(v_body) > 280 then raise exception 'a message must be 280 characters or fewer' using errcode = 'P0001'; end if;
  if coalesce(p_tone, 'info') not in ('info', 'warning', 'urgent') then
    raise exception 'unknown tone %', p_tone using errcode = 'P0001';
  end if;

  insert into public.notice_presets (center_id, label, body, tone, style, created_by)
  values (p_center, left(v_label, 60), v_body, coalesce(p_tone, 'info'), public.fets_notice_style(p_style), auth.uid())
  on conflict (center_id, lower(label)) do update
     set body = excluded.body, tone = excluded.tone, style = excluded.style
  returning * into r;
  return r;
end;
$fn$;

create or replace function public.fets_delete_notice_preset(p_preset uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_center uuid;
begin
  select center_id into v_center from public.notice_presets where id = p_preset;
  if not found then raise exception 'that saved message does not exist' using errcode = 'P0002'; end if;
  perform public.fets_guard(v_center, array['admin', 'tca']::public.user_role[]);
  delete from public.notice_presets where id = p_preset;
end;
$fn$;

revoke all on function public.fets_save_notice_preset(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.fets_save_notice_preset(uuid, text, text, text, jsonb) to authenticated;
revoke all on function public.fets_delete_notice_preset(uuid) from public, anon, authenticated;
grant execute on function public.fets_delete_notice_preset(uuid) to authenticated;

-- The TV is told the look along with the words.
do $$
declare
  v_def text := pg_get_functiondef('public.fets_display_state(text)'::regprocedure);
begin
  if position('''style'', nt.style' in v_def) = 0 then
    if position('''posted_at'', nt.created_at' in v_def) = 0 then
      raise exception 'fets_display_state has changed shape; not patching it';
    end if;
    execute replace(v_def, '''posted_at'', nt.created_at', '''posted_at'', nt.created_at,
      ''style'', nt.style');
  end if;
end
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notice_presets') then
      alter publication supabase_realtime add table public.notice_presets;
    end if;
  end if;
end
$$;
