/**
 * Two checks against seating the wrong person.
 *
 * On a busy day two candidates can share most of a name — "Sana Nasrin" at
 * 4:00 PM and "Sana Nasrin Kulanagar veetiil sulaiman" at 11:00 AM — and a
 * truncated list makes them look the same. Picking the wrong one launched the
 * wrong exam profile once already. So the console marks such pairs as name
 * twins, and it stops a check-in that is far from the booked time until
 * somebody confirms it is the right person.
 *
 * Staff screens only. Nothing here is ever shown on the hall TV.
 */

type Named = { id: string; first_name: string; last_name: string };

/** Lower case, letters and digits only, single spaces. */
function words(c: Pick<Named, "first_name" | "last_name">): string[] {
  return `${c.first_name} ${c.last_name}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Edit distance, stopping early once it passes `max`. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      row.push(v);
      if (v < best) best = v;
    }
    if (best > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

/**
 * Whether two names could be mistaken for each other at the desk:
 * - one name's words all appear, in order, at the start of the other
 *   ("Sana Nasrin" / "Sana Nasrin Kulanagar ..."), when the shorter has at
 *   least two words;
 * - the same first two words;
 * - or the whole name within a couple of letters ("Mohammed Ali" /
 *   "Muhammed Ali").
 */
export function namesClash(
  a: Pick<Named, "first_name" | "last_name">,
  b: Pick<Named, "first_name" | "last_name">,
): boolean {
  const x = words(a);
  const y = words(b);
  if (x.length === 0 || y.length === 0) return false;

  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 2 && short.every((w, i) => long[i] === w)) return true;
  if (x.length >= 2 && y.length >= 2 && x[0] === y[0] && x[1] === y[1]) return true;

  const sx = x.join(" ");
  const sy = y.join(" ");
  if (sx === sy) return true;
  // A short name is too easy to be two letters from another; only fuzzy-match
  // names long enough that a near miss is a real look-alike.
  const shortest = Math.min(sx.length, sy.length);
  return shortest >= 8 && within(sx, sy, shortest >= 14 ? 2 : 1);
}

/**
 * Every candidate who has a name twin on the list, mapped to their twins.
 * Candidates with no twin are not in the map.
 */
export function nameTwins<T extends Named>(candidates: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (!namesClash(a, b)) continue;
      out.set(a.id, [...(out.get(a.id) ?? []), b]);
      out.set(b.id, [...(out.get(b.id) ?? []), a]);
    }
  }
  return out;
}

/** How far from the booked time a check-in may be before it is questioned. */
export const SESSION_WINDOW_MINUTES = 60;

/**
 * Minutes from now to the booking (positive: still to come; negative: past),
 * when it is further away than the window; otherwise null.
 */
export function outsideSession(
  scheduledAt: string | null,
  now: number,
  windowMinutes = SESSION_WINDOW_MINUTES,
): number | null {
  if (!scheduledAt) return null;
  const at = new Date(scheduledAt).getTime();
  if (!Number.isFinite(at)) return null;
  const minutes = Math.round((at - now) / 60000);
  return Math.abs(minutes) > windowMinutes ? minutes : null;
}

/** "5 hours from now", "1 hour 20 minutes ago". */
export function howFar(minutes: number): string {
  const m = Math.abs(minutes);
  const h = Math.floor(m / 60);
  const r = m % 60;
  const parts = [
    h ? `${h} hour${h === 1 ? "" : "s"}` : "",
    r ? `${r} minute${r === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return `${parts.join(" ") || "0 minutes"} ${minutes >= 0 ? "from now" : "ago"}`;
}
