-- Each lab drawn as it stands, and Calicut's room split into its two test
-- stations.
--
-- 1. labs.plan holds the drawing: a grid of cells, each seat's cell and the way
--    it faces, and the room's signs, pillars and doors (lib/floor-plan.ts reads
--    it). Seats are keyed by workstation id, so renumbering a desk never moves
--    it. fets_save_lab_plan stores one from the Settings editor.
--
-- 2. Calicut's 40 seats were one lab, "Lab 1", numbered 1 to 40. On the floor
--    they are two test stations that each number from 1: ten seats at the top
--    of the room and thirty below. The seats keep their ids, so every incident
--    and history row still points at the same desk; only their lab, code and
--    number change, and both stations get the floor plan from the drawing.
--
-- Run once in the fets.online Supabase project (ueufcqmdqtwvhjjyudeu).

begin;

alter table public.labs add column if not exists plan jsonb;

create or replace function public.fets_save_lab_plan(p_lab uuid, p_plan jsonb)
returns public.labs
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  l public.labs;
  v_w integer;
  v_h integer;
  v_stray text;
begin
  select * into l from public.labs where id = p_lab for update;
  if not found then raise exception 'lab not found' using errcode = 'P0002'; end if;

  perform public.fets_guard(l.center_id, array['admin']::public.user_role[]);

  if p_plan is null then
    -- Back to the automatic layout.
    update public.labs set plan = null where id = p_lab returning * into l;
    return l;
  end if;

  if jsonb_typeof(p_plan) <> 'object' or jsonb_typeof(p_plan -> 'seats') <> 'object'
     or jsonb_typeof(coalesce(p_plan -> 'items', '[]'::jsonb)) <> 'array' then
    raise exception 'that is not a floor plan' using errcode = 'P0001';
  end if;
  v_w := (p_plan ->> 'w')::integer;
  v_h := (p_plan ->> 'h')::integer;
  if v_w is null or v_h is null or v_w not between 1 and 60 or v_h not between 1 and 60 then
    raise exception 'a floor plan is 1 to 60 cells each way' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p_plan -> 'items', '[]'::jsonb)) > 200 or length(p_plan::text) > 100000 then
    raise exception 'that floor plan is too large' using errcode = 'P0001';
  end if;

  -- Every seat on the plan must be one of this lab's, and inside the grid.
  select k into v_stray
    from jsonb_each(p_plan -> 'seats') as s(k, v)
   where k !~ '^[0-9a-f-]{36}$'
      or not exists (select 1 from public.workstations w where w.id::text = k and w.lab_id = p_lab)
      or coalesce((v ->> 'x')::integer, -1) not between 0 and v_w - 1
      or coalesce((v ->> 'y')::integer, -1) not between 0 and v_h - 1
   limit 1;
  if v_stray is not null then
    raise exception 'a seat on the plan is not in this lab or is off the grid' using errcode = 'P0001';
  end if;

  update public.labs set plan = p_plan where id = p_lab returning * into l;
  return l;
end;
$fn$;

revoke all on function public.fets_save_lab_plan(uuid, jsonb) from public, anon;
grant execute on function public.fets_save_lab_plan(uuid, jsonb) to authenticated;

-- Calicut: Lab 1 (seats 1-40) becomes Test Station 1 (10) and Test Station 2 (30).
do $$
declare
  v_center uuid;
  v_old uuid;
  v_one uuid;
  v_seated integer;
begin
  select id into v_center from public.centers where name = 'Calicut';
  select id into v_old from public.labs where center_id = v_center and name = 'Lab 1';
  if v_old is null then
    raise notice 'Calicut has no "Lab 1" any more; the split was already made or the labs were changed. Skipped.';
    return;
  end if;
  if (select count(*) from public.workstations where lab_id = v_old) <> 40
     or exists (select 1 from public.labs where center_id = v_center and id <> v_old) then
    raise exception 'Calicut''s labs are not the 40-seat Lab 1 this split expects; nothing was changed';
  end if;
  select count(*) into v_seated from public.workstations
   where lab_id = v_old and (current_candidate_id is not null or status in ('assigned', 'active'));
  if v_seated > 0 then
    raise exception '% Calicut seats are in use; run this when the hall is empty', v_seated;
  end if;

  -- (center, position) is unique: move Lab 1 out of the way first.
  update public.labs set name = 'Test Station 2', capacity = 30, position = 2 where id = v_old;
  insert into public.labs (center_id, name, position, capacity)
  values (v_center, 'Test Station 1', 1, 10)
  returning id into v_one;

  -- Seats 1-10 go to Test Station 1; 11-40 become Test Station 2's 1-30. The
  -- standard number comes from the code, so the old hand-set numbers are cleared.
  update public.workstations w
     set lab_id = case when n <= 10 then v_one else v_old end,
         lab_name = case when n <= 10 then 'Test Station 1' else 'Test Station 2' end,
         seat_code = case when n <= 10 then 'Test Station 1-' || lpad(n::text, 2, '0')
                          else 'Test Station 2-' || lpad((n - 10)::text, 2, '0') end,
         seat_label = null
    from (select id, substring(seat_code from '-([0-9]+)$')::integer as n
            from public.workstations where lab_id = v_old) s
   where w.id = s.id;

  -- The drawing. Columns: 0 the left wall, 1 the aisle, 2 and 3 the island.
  -- Wall seats face the wall; the island's two sides face each other.
  update public.labs l set plan = jsonb_build_object(
      'w', 4, 'h', 6,
      'seats', (select jsonb_object_agg(w.id::text, jsonb_build_object('x', p.x, 'y', p.y, 'f', p.f))
                  from public.workstations w
                  join (values (5,0,1,'left'),(4,0,2,'left'),(3,0,3,'left'),(2,0,4,'left'),(1,0,5,'left'),
                               (8,2,2,'right'),(7,2,3,'right'),(6,2,4,'right'),
                               (10,3,3,'left'),(9,3,4,'left')) as p(n, x, y, f)
                    on w.seat_code = 'Test Station 1-' || lpad(p.n::text, 2, '0')
                 where w.lab_id = v_one),
      'items', jsonb_build_array(
        jsonb_build_object('k', 'door', 'x', 0, 'y', 0, 'w', 1, 'h', 1),
        jsonb_build_object('k', 'label', 'x', 2, 'y', 0, 'w', 2, 'h', 1, 't', 'Test Station')))
   where l.id = v_one;

  update public.labs l set plan = jsonb_build_object(
      'w', 4, 'h', 13,
      'seats', (select jsonb_object_agg(w.id::text, jsonb_build_object('x', p.x, 'y', p.y, 'f', p.f))
                  from public.workstations w
                  join (values (10,0,1,'left'),(9,0,2,'left'),(8,0,3,'left'),(7,0,4,'left'),(6,0,5,'left'),
                               (5,0,7,'left'),(4,0,8,'left'),(3,0,9,'left'),(2,0,10,'left'),(1,0,11,'left'),
                               (21,2,0,'right'),(20,2,1,'right'),(19,2,2,'right'),(18,2,3,'right'),(17,2,4,'right'),
                               (16,2,5,'right'),(15,2,6,'right'),(14,2,7,'right'),(13,2,8,'right'),(12,2,9,'right'),
                               (11,2,10,'right'),
                               (30,3,0,'left'),(29,3,1,'left'),(28,3,2,'left'),(27,3,3,'left'),(26,3,4,'left'),
                               (25,3,5,'left'),(24,3,6,'left'),(23,3,7,'left'),(22,3,8,'left')) as p(n, x, y, f)
                    on w.seat_code = 'Test Station 2-' || lpad(p.n::text, 2, '0')
                 where w.lab_id = v_old),
      'items', jsonb_build_array(
        jsonb_build_object('k', 'pillar', 'x', 0, 'y', 0, 'w', 1, 'h', 1),
        jsonb_build_object('k', 'pillar', 'x', 0, 'y', 6, 'w', 1, 'h', 1),
        jsonb_build_object('k', 'label', 'x', 2, 'y', 12, 'w', 2, 'h', 1, 't', 'Test Station')))
   where l.id = v_old;
end $$;

commit;
