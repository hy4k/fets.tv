import { readTable, type CalendarRow, type LiveCandidate } from './fets-live';
import { reconcileRoster } from './roster-reconcile';
import { supabaseService } from './supabase/service';
import { todayInZone } from './format';

export async function syncLiveRoster(center: { id: string; name: string }) {
  const date = todayInZone('Asia/Kolkata');
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
  const { data, error } = await supabaseService().rpc('fets_sync_live_roster', { p_center: center.id, p_day: date, p_rows: checked.rows });
  if (error) throw Error(error.code === 'PGRST202' ? 'Install the fets.online roster sync migration before pulling candidates.' : error.message);
  const retained = Number((data as Record<string, unknown>)?.retained || 0);
  if (retained > 0) checked.warnings.push(`${retained} existing candidates are not in the current fets.live roster. They were retained with their exam-day progress; review the source roster.`);
  return { ...(data as Record<string, unknown>), found: checked.rows.length, warnings: checked.warnings, date };
}
