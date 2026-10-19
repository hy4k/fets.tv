-- Cochin is one exam hall of 31 desks, drawn as it stands.
--
-- The console had it as two labs, "Lab 1" (22 seats) and "Lab 2" (8): thirty
-- seats where the hall has thirty-one. They become one lab, "Exam Hall", with
-- seats 1 to 31 in the order a person walks the room:
--
--   left wall, top to bottom              1 - 8   (facing the wall)
--   island, left side, top to bottom      9 - 15  (facing the island)
--   island, right side, top to bottom    16 - 21  (facing the island)
--   right wall, top to bottom            22 - 31  (facing the wall)
--
-- Lab 1's seats become 1-22 and Lab 2's become 23-30, keeping their ids, so
-- every incident and history row still points at the same desk; seat 31 is
-- new. Numbers can be changed desk by desk in Settings -> Floor plan.
--
-- Run once in the fets.online Supabase project (ueufcqmdqtwvhjjyudeu), when
-- nobody is seated at Cochin. It refuses otherwise, and does nothing if Cochin
-- is no longer the 22 + 8 it expects.

begin;

-- Also added by the floor-plan migration; here too so the order does not matter.
alter table public.labs add column if not exists plan jsonb;

do $$
declare
  v_center uuid;
  v_one uuid;
  v_two uuid;
  v_busy integer;
begin
  select id into v_center from public.centers where name = 'Cochin';
  select id into v_one from public.labs where center_id = v_center and name = 'Lab 1';
  select id into v_two from public.labs where center_id = v_center and name = 'Lab 2';
  if v_one is null or v_two is null then
    raise notice 'Cochin is no longer Lab 1 + Lab 2; it was already merged or changed. Skipped.';
    return;
  end if;
  if (select count(*) from public.workstations where lab_id = v_one) <> 22
     or (select count(*) from public.workstations where lab_id = v_two) <> 8
     or exists (select 1 from public.labs where center_id = v_center and id not in (v_one, v_two)) then
    raise exception 'Cochin''s labs are not the 22 + 8 this merge expects; nothing was changed';
  end if;
  select count(*) into v_busy from public.workstations
   where lab_id in (v_one, v_two) and (current_candidate_id is not null or status in ('assigned', 'active'));
  if v_busy > 0 then
    raise exception '% Cochin seats are in use; run this when the hall is empty', v_busy;
  end if;

  update public.labs set name = 'Exam Hall', capacity = 31, position = 1 where id = v_one;

  -- Lab 1-NN keeps its number; Lab 2-NN follows on from 22.
  update public.workstations w
     set lab_id = v_one,
         lab_name = 'Exam Hall',
         seat_code = 'Exam Hall-' || lpad(s.n::text, 2, '0'),
         seat_label = null
    from (select id,
                 substring(seat_code from '-([0-9]+)$')::integer
                   + case when lab_id = v_two then 22 else 0 end as n
            from public.workstations where lab_id in (v_one, v_two)) s
   where w.id = s.id;

  insert into public.workstations (center_id, lab_id, lab_name, seat_code)
  values (v_center, v_one, 'Exam Hall', 'Exam Hall-31');

  delete from public.labs where id = v_two;

  -- The drawing, 6 columns by 10 rows: 0 the left wall, 2 and 3 the island,
  -- 5 the right wall; the administration room sits under the island.
  update public.labs l set plan = jsonb_build_object(
      'w', 6, 'h', 10,
      'seats', (select jsonb_object_agg(w.id::text, jsonb_build_object('x', p.x, 'y', p.y, 'f', p.f))
                  from public.workstations w
                  join (select n, 0 as x, n - 1 as y, 'left' as f from generate_series(1, 8) n
                        union all select n, 2, n - 9, 'right' from generate_series(9, 15) n
                        union all select n, 3, n - 16, 'left' from generate_series(16, 21) n
                        union all select n, 5, n - 22, 'right' from generate_series(22, 31) n) p
                    on w.seat_code = 'Exam Hall-' || lpad(p.n::text, 2, '0')
                 where w.lab_id = v_one),
      'items', jsonb_build_array(
        jsonb_build_object('k', 'label', 'x', 1, 'y', 8, 'w', 3, 'h', 2, 't', 'Administration'),
        jsonb_build_object('k', 'label', 'x', 4, 'y', 7, 'w', 1, 'h', 1, 't', 'Exam Hall')))
   where l.id = v_one;
end $$;

commit;
