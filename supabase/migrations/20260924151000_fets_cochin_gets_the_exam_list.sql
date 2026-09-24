-- Cochin starts with the same exam list as Calicut.
--
-- It had none, so no roster could be imported there. The two centres deliver
-- the same programmes; copying the list (and any parts already defined) gives
-- Cochin a working start, and its staff can change lengths in Setup. Only
-- programmes Cochin does not already have are added.
insert into public.exam_programmes (center_id, code, name, default_duration_minutes, active)
select coc.id, e.code, e.name, e.default_duration_minutes, e.active
  from public.exam_programmes e
  join public.centers cal on cal.id = e.center_id and cal.name = 'Calicut'
  cross join public.centers coc
 where coc.name = 'Cochin'
   and not exists (
     select 1 from public.exam_programmes x where x.center_id = coc.id and x.code = e.code);

insert into public.programme_sections (programme_id, position, name, minutes, kind)
select dst.id, s.position, s.name, s.minutes, s.kind
  from public.programme_sections s
  join public.exam_programmes src on src.id = s.programme_id
  join public.centers cal on cal.id = src.center_id and cal.name = 'Calicut'
  join public.centers coc on coc.name = 'Cochin'
  join public.exam_programmes dst on dst.center_id = coc.id and dst.code = src.code
 where not exists (
   select 1 from public.programme_sections y where y.programme_id = dst.id and y.position = s.position);
