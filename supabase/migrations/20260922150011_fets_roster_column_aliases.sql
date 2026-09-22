-- The importer knows the column names the boards' own exports use. A centre
-- that receives a fourth layout should not have to wait for a release to import
-- it, so it can teach the importer a column name of its own.

create table if not exists public.roster_column_aliases (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  field text not null check (field in (
    'roster_number', 'full_name', 'first_name', 'last_name',
    'part', 'phone', 'place', 'roster_flag', 'exam_name'
  )),
  -- Stored lower-cased and trimmed, which is how the importer compares headers.
  alias text not null check (btrim(alias) <> '' and length(alias) <= 60),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (center_id, field, alias)
);

alter table public.roster_column_aliases enable row level security;

drop policy if exists roster_column_aliases_read on public.roster_column_aliases;
create policy roster_column_aliases_read on public.roster_column_aliases
  for select to authenticated
  using (center_id = (select center_id from public.profiles where id = auth.uid()));

revoke all on public.roster_column_aliases from public, anon, authenticated;
grant select on public.roster_column_aliases to authenticated;

create or replace function public.fets_add_column_alias(p_center uuid, p_field text, p_alias text)
returns public.roster_column_aliases
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  a public.roster_column_aliases;
  v_alias text := lower(btrim(coalesce(p_alias, '')));
begin
  perform public.fets_guard(p_center, array['admin']::public.user_role[]);

  if v_alias = '' then
    raise exception 'type the column heading exactly as it appears in the file' using errcode = 'P0001';
  end if;

  insert into public.roster_column_aliases (center_id, field, alias, created_by)
  values (p_center, p_field, v_alias, auth.uid())
  on conflict (center_id, field, alias) do update set alias = excluded.alias
  returning * into a;

  return a;
end;
$fn$;

create or replace function public.fets_remove_column_alias(p_alias uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_center uuid;
begin
  select center_id into v_center from public.roster_column_aliases where id = p_alias;
  if v_center is null then return; end if;

  perform public.fets_guard(v_center, array['admin']::public.user_role[]);
  delete from public.roster_column_aliases where id = p_alias;
end;
$fn$;

revoke all on function
  public.fets_add_column_alias(uuid, text, text),
  public.fets_remove_column_alias(uuid)
  from public, anon, authenticated;

grant execute on function
  public.fets_add_column_alias(uuid, text, text),
  public.fets_remove_column_alias(uuid)
  to authenticated;
