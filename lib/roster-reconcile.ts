import type { CalendarRow, LiveCandidate } from './fets-live';

export const ROSTER_PROVIDERS = ['PROMETRIC', 'PEARSON VUE', 'CELPIP', 'PSI', 'ITTS'];

/** One exam and start time the calendar books without names: that many empty slots. */
export type BookedSlot = { client_name: string; exam_name: string; start_time: string; count: number };

/**
 * CMA US always comes with its candidates' names, so a CMA booking without
 * them is a missing upload to fix in fets.live, not something to fill at the desk.
 */
const NAMES_REQUIRED = /\bCMA\b/i;

export function reconcileRoster(candidates: LiveCandidate[], calendar: CalendarRow[]) {
  const rows: LiveCandidate[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];
  const slots: BookedSlot[] = [];
  const identities = new Set<string>();
  const groups = new Map<string, number>();
  const key = (provider: string, exam: string, time: string) => JSON.stringify([provider, exam.trim().toUpperCase(), time.slice(0, 5)]);
  for (const [index, row] of candidates.entries()) {
    const provider = (row.client_name ?? '').trim().toUpperCase();
    if (!ROSTER_PROVIDERS.includes(provider)) continue;
    // Do not silently discard incomplete provider bookings or invent an appointment time.
    if (!row.roster_number?.trim() || !row.full_name?.trim() || !row.exam_name?.trim() || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(row.exam_start_time ?? '')) {
      issues.push(`Source row ${index + 1} needs a registration ID, full name, exam and valid start time in fets.live.`);
      continue;
    }
    const id = JSON.stringify([provider, row.roster_number.trim()]);
    if (identities.has(id)) issues.push(`Source row ${index + 1} duplicates a provider registration ID.`);
    identities.add(id);
    const normalized = { ...row, client_name: provider, roster_number: row.roster_number.trim() };
    rows.push(normalized);
    const group = key(provider, row.exam_name, row.exam_start_time!);
    groups.set(group, (groups.get(group) ?? 0) + 1);
  }
  const totals = new Map<string, number>();
  // The exam as first spelled on the calendar, for the slots' label.
  const spelled = new Map<string, { provider: string; exam: string; time: string }>();
  for (const c of calendar) {
    const provider = (c.client_name ?? '').trim().toUpperCase();
    if (!ROSTER_PROVIDERS.includes(provider)) continue;
    const group = key(provider, c.exam_name ?? '', c.start_time ?? '');
    totals.set(group, (totals.get(group) ?? 0) + (c.candidate_count ?? 0));
    if (!spelled.has(group)) {
      spelled.set(group, {
        provider,
        exam: (c.exam_name ?? '').trim().replace(/\s+/g, ' '),
        time: (c.start_time ?? '').slice(0, 5),
      });
    }
  }
  for (const [group, count] of groups) {
    if (totals.get(group) !== count) issues.push(`Calendar count mismatch for ${group}: roster ${count}, calendar ${totals.get(group) ?? 0}. Reconcile in fets.live.`);
  }
  for (const [group, count] of totals) {
    if (count <= 0 || groups.has(group)) continue;
    const s = spelled.get(group)!;
    // No names in fets.live yet: keep that many empty slots for the desk to
    // fill at check-in. CMA US is the exception; its names must come across.
    if (s.exam && !NAMES_REQUIRED.test(s.exam) && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) {
      // "CELPIP General" and "CELPIP  General" are one exam on the floor, so
      // their slots are counted together.
      const same = slots.find(
        (x) => x.client_name === s.provider && x.start_time === s.time && x.exam_name.toUpperCase() === s.exam.toUpperCase(),
      );
      if (same) same.count += count;
      else slots.push({ client_name: s.provider, exam_name: s.exam, start_time: s.time, count });
    } else {
      warnings.push(`Calendar has ${count} bookings without candidate rows for ${group}. Upload their roster in fets.live.`);
    }
  }
  for (const x of slots) {
    if (x.count > 999) {
      issues.push(`Calendar books ${x.count} for ${x.exam_name} at ${x.start_time}; check the count in fets.live.`);
    }
  }
  return { rows, issues, warnings, slots: slots.filter((x) => x.count <= 999) };
}
