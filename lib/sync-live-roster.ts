import { readTable, type CalendarRow, type LiveCandidate } from './fets-live';
import { reconcileRoster } from './roster-reconcile';
import { supabaseService } from './supabase/service';
import { todayInZone } from './format';

/**
 * Pull one day from fets.live into this centre's list. Today becomes (or tops
 * up) the live list; a later day is prepared as a draft and today is left
 * alone. Only staff start this — nothing pulls on its own unless the host's
 * morning timer is switched on with FETS_ROSTER_AUTO=on.
 */
export async function syncLiveRoster(center: { id: string; name: string }, day?: string) {
  const today = todayInZone('Asia/Kolkata');
  const date = day ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw Error('Pick a valid date');
  if (date < today) throw Error('A past day cannot be pulled');
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const [candidates, calendar] = await Promise.all([
    readTable<LiveCandidate>('candidates', center.name, {
      select: 'full_name,phone,roster_number,exam_part,exam_start_time,client_name,exam_name,exam_date,branch_location,status',
      and: `(exam_date.gte.${date}T00:00:00+05:30,exam_date.lt.${next}T00:00:00+05:30)`,
      order: 'id.asc',
    }),
    readTable<CalendarRow>('calendar_sessions', center.name, {
      select: 'client_name,exam_name,candidate_count,start_time,end_time',
      date: `eq.${date}`, order: 'id.asc',
    }),
  ]);
  if ('reason' in candidates) throw Error(candidates.reason);
  if ('reason' in calendar) throw Error(calendar.reason);
  const checked = reconcileRoster(candidates.rows, calendar.rows);
  if (checked.issues.length) throw Error(checked.issues.slice(0, 8).join(' '));
  const db = supabaseService();
  let { data, error } = await db.rpc('fets_sync_live_roster', { p_center: center.id, p_day: date, p_rows: checked.rows, p_slots: checked.slots });
  // Until the booked-slots SQL is run, the database only knows the three-part
  // pull: names still come across, and the slots wait for the SQL.
  if (error?.code === 'PGRST202') {
    ({ data, error } = await db.rpc('fets_sync_live_roster', { p_center: center.id, p_day: date, p_rows: checked.rows }));
    if (!error && checked.slots.length) {
      checked.warnings.push(`${checked.slots.reduce((n, s) => n + s.count, 0)} bookings without names need the booked-slots SQL to appear as empty slots. Run it once in Supabase.`);
    }
  }
  if (error) throw Error(error.code === 'PGRST202' ? 'Install the fets.online roster sync migration before pulling candidates.' : error.message);
  const retained = Number((data as Record<string, unknown>)?.retained || 0);
  if (retained > 0) checked.warnings.push(`${retained} existing candidates are not in the current fets.live roster. They were retained with their exam-day progress; review the source roster.`);
  // Which exams the empty slots are for, so the result names them.
  return { ...(data as Record<string, unknown>), found: checked.rows.length, warnings: checked.warnings, date, booked: checked.slots };
}
