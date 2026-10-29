/** Shared, immutable checks from the published FETS Live timetable. */
export type SharedCheck = {
  block: number; kind: 'walk' | 'dvr'; due: number;
  owner_id: string | null; owner_name: string | null;
  event: null | { id: string; actor_id: string; actor_name: string | null; created_at: string; note: string };
};
export type CheckSnapshot = {
  connected: true; server_now: string; viewer_id?: string; viewer_rostered?: boolean;
  plan: null | { id: string; day: string; branch: string; version: number; closed: boolean; tracking_from?:string; format?:number };
  checks?: SharedCheck[]; reason?: string;
};
export function dueAt(day: string, due: number) {
  return Date.parse(`${day}T00:00:00+05:30`) + due * 60000;
}
export function checkStatus(snapshot: CheckSnapshot, check: SharedCheck, now: number) {
  if (check.event) return 'recorded' as const;
  if (!snapshot.plan) return 'unavailable' as const;
  const due = dueAt(snapshot.plan.day, check.due);
  if(snapshot.plan.tracking_from && due<Date.parse(snapshot.plan.tracking_from))return 'not-tracked' as const;
  if (now < due) return 'upcoming' as const;
  if (now >= due + (check.kind === 'walk' ? 10 : 6) * 60000) return 'missed' as const;
  if (snapshot.plan.closed) return 'closed' as const;
  return 'due' as const;
}
export function canRecord(snapshot: CheckSnapshot, check: SharedCheck, now: number) {
  return checkStatus(snapshot, check, now) === 'due' && !!snapshot.viewer_rostered && !!check.owner_id && check.owner_id === snapshot.viewer_id;
}
export function sharedLogCsv(snapshot: CheckSnapshot, now: number) {
  const quote = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const time = (iso: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
  const rows: unknown[][] = [['Date','Centre','Check','Due at (IST)','Assigned to','Status','Recorded at (IST)','Recorded by','Note','Record ID']];
  for (const check of snapshot.checks ?? []) {
    rows.push([snapshot.plan?.day,snapshot.plan?.branch,check.kind === 'walk' ? 'Lab walk' : 'DVR check',time(new Date(dueAt(snapshot.plan!.day,check.due)).toISOString()),check.owner_name,
      checkStatus(snapshot,check,now),check.event ? time(check.event.created_at) : '',check.event?.actor_name,check.event?.note,check.event?.id]);
  }
  return rows.map(row => row.map(quote).join(',')).join('\r\n')+'\r\n';
}
/** For the Lab rail: the latest check of a kind already due, and the next one ahead. */
export function checkRail(snapshot: CheckSnapshot, kind: SharedCheck['kind'], now: number) {
  if (!snapshot.plan) return { current: null, next: null };
  const day = snapshot.plan.day;
  const mine = (snapshot.checks ?? []).filter(c => c.kind === kind).sort((a, b) => a.due - b.due);
  return {
    current: mine.filter(c => dueAt(day, c.due) <= now).pop() ?? null,
    next: mine.find(c => dueAt(day, c.due) > now) ?? null,
  };
}
