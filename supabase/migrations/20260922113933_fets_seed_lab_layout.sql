-- The two centres' real lab layouts. Calicut runs 30 and 10, Cochin 22 and 8.
-- Applied here rather than through fets_configure_labs because that function
-- requires an admin of the centre in question, and Cochin currently has none.
do $seed$
declare
  v_center uuid;
  v_code text;
  v_lab_id uuid;
  v_name text;
  v_capacity integer;
  v_position integer;
  i integer;
begin
  for v_center, v_code in select id, site_code from public.centers order by site_code loop
    v_position := 0;

    for v_name, v_capacity in
      select * from (values
        ('Lab 1', case when v_code = '4960' then 30 else 22 end),
        ('Lab 2', case when v_code = '4960' then 10 else 8 end)
      ) as t(name, capacity)
    loop
      v_position := v_position + 1;

      insert into public.labs (center_id, name, position, capacity)
      values (v_center, v_name, v_position, v_capacity)
      on conflict (center_id, name)
        do update set position = excluded.position, capacity = excluded.capacity
      returning id into v_lab_id;

      for i in 1..v_capacity loop
        insert into public.workstations (center_id, lab_id, lab_name, seat_code)
        values (v_center, v_lab_id, v_name, v_name || '-' || lpad(i::text, 2, '0'))
        on conflict (center_id, seat_code)
          do update set lab_id = excluded.lab_id, lab_name = excluded.lab_name;
      end loop;
    end loop;
  end loop;
end $seed$;

-- Seats from the old equal-sized LAB A/B/C layout, wherever nothing depends on
-- them. Anything occupied keeps its row, so the candidate sitting at it still
-- has a seat to point to.
delete from public.workstations w
 where w.lab_id is null
   and w.status = 'free'
   and w.current_candidate_id is null
   and not exists (select 1 from public.candidates c where c.workstation_id = w.id);
