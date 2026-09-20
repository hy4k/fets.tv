-- Custom messages on the hall TV, but only ever in the centre's own words.
-- Staff pick a template and fill its one blank; the wording itself is fixed
-- and the text is rendered in the database, so no client can put arbitrary
-- copy on a screen that candidates read as official instruction.

create table if not exists public.notice_templates (
  id uuid primary key default gen_random_uuid(),
  center_id uuid references public.centers(id) on delete cascade,
  key text not null,
  label text not null,
  body_template text not null,
  tone text not null default 'info' check (tone in ('info', 'warning', 'urgent')),
  slots jsonb not null default '[]'::jsonb,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (center_id, key)
);

-- center_id null means the template is shared by every centre.
create unique index if not exists notice_templates_global_key_idx
  on public.notice_templates (key) where center_id is null;

create table if not exists public.display_notices (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  template_id uuid references public.notice_templates(id) on delete set null,
  template_key text not null,
  template_label text not null,
  values jsonb not null default '{}'::jsonb,
  body text not null,
  tone text not null check (tone in ('info', 'warning', 'urgent')),
  active boolean not null default true,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by uuid references auth.users(id) on delete set null
);

create index if not exists display_notices_live_idx
  on public.display_notices (center_id, created_at desc) where active;

alter table public.notice_templates enable row level security;
alter table public.display_notices enable row level security;

drop policy if exists staff_read_templates on public.notice_templates;
create policy staff_read_templates on public.notice_templates
  for select to authenticated
  using (active and (center_id is null or center_id = public.current_center_id()));

drop policy if exists staff_read_notices on public.display_notices;
create policy staff_read_notices on public.display_notices
  for select to authenticated using (center_id = public.current_center_id());

grant select on public.notice_templates to authenticated;
grant select on public.display_notices to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'display_notices') then
      alter publication supabase_realtime add table public.display_notices;
    end if;
  end if;
end
$$;

insert into public.notice_templates (center_id, key, label, body_template, tone, slots, sort_order)
values
  (null, 'wait_for_call', 'Wait to be called', 'Please wait. You will be called by your token number.', 'info', '[]'::jsonb, 10),
  (null, 'exam_starts', 'Exam begins at…', 'The examination begins at {time}.', 'info',
     '[{"key":"time","label":"Start time","type":"time"}]'::jsonb, 20),
  (null, 'registration_closes', 'Registration closing', 'Registration closes at {time}. Please complete your check-in.', 'warning',
     '[{"key":"time","label":"Closing time","type":"time"}]'::jsonb, 30),
  (null, 'start_delayed', 'Start delayed', 'The start is delayed. The new start time is {time}. Thank you for your patience.', 'warning',
     '[{"key":"time","label":"New start time","type":"time"}]'::jsonb, 40),
  (null, 'break_until', 'Break in progress', 'Break in progress. Please return to the hall by {time}.', 'info',
     '[{"key":"time","label":"Return by","type":"time"}]'::jsonb, 50),
  (null, 'phones_off', 'Phones off', 'Please switch off all mobile phones and electronic devices.', 'info', '[]'::jsonb, 60),
  (null, 'silence', 'Silence please', 'Examination in progress. Please maintain silence.', 'info', '[]'::jsonb, 70),
  (null, 'technical_issue', 'Technical issue', 'A technical issue is being resolved. Please stay seated and wait for staff.', 'warning', '[]'::jsonb, 80),
  (null, 'remain_seated', 'Remain seated', 'Please remain seated until a member of staff instructs you.', 'urgent', '[]'::jsonb, 90),
  (null, 'centre_closing', 'Centre closing', 'The centre closes at {time}. Please collect your belongings.', 'info',
     '[{"key":"time","label":"Closing time","type":"time"}]'::jsonb, 100)
on conflict do nothing;
