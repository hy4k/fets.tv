import { branchOf, isSecretKey } from './fets-live.ts';

/** One candidate waiting to go back to fets.live, as fets_live_push_queue returns it. */
export type QueuedCorrection = {
  id: string;
  roster_number: string;
  live_provider: string;
  exam_date: string;
  center_name: string;
  full_name: string | null;
  phone: string | null;
  place: string | null;
  part: string | null;
};

/**
 * The fets.live update for one corrected candidate: which record (centre,
 * IST day, provider, confirmation number — fets.live's own unique key) and
 * which fields. Only details that have a value are sent, so nothing fets.live
 * holds is blanked by a field fets.online never had. Null when the candidate
 * cannot be matched.
 */
export function correctionRequest(c: QueuedCorrection): { query: URLSearchParams; body: Record<string, string> } | null {
  const branch = branchOf(c.center_name);
  const number = c.roster_number?.trim();
  if (!branch || !number || !c.live_provider || !/^\d{4}-\d{2}-\d{2}$/.test(c.exam_date)) return null;
  const next = new Date(Date.parse(`${c.exam_date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const query = new URLSearchParams({
    branch_location: `eq.${branch}`,
    roster_number: `eq.${number}`,
    client_name: `ilike.${c.live_provider}`,
    and: `(exam_date.gte.${c.exam_date}T00:00:00+05:30,exam_date.lt.${next}T00:00:00+05:30)`,
  });
  const body: Record<string, string> = {};
  const put = (key: string, v: string | null) => {
    const t = v?.trim();
    if (t) body[key] = t;
  };
  put('full_name', c.full_name);
  put('phone', c.phone);
  put('address', c.place);
  put('exam_part', c.part);
  return Object.keys(body).length ? { query, body } : null;
}

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * Sends one centre's waiting corrections to fets.live. Each candidate is its
 * own small update, so one that fails stays waiting without holding up the
 * rest; it goes on the next save or the next pull.
 */
export async function pushLiveCorrections(client: object, centerId: string): Promise<{ sent: number; waiting: number; failed: number }> {
  const url = process.env.FETS_LIVE_SUPABASE_URL?.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = process.env.FETS_LIVE_SUPABASE_KEY;
  if (!url || !key || !isSecretKey(key)) return { sent: 0, waiting: 0, failed: 0 };

  // The two queue functions are not in the generated types; call them untyped.
  const rpc = ((client as { rpc: Rpc }).rpc).bind(client) as Rpc;
  const sentAt = new Date().toISOString();
  const { data, error } = await rpc('fets_live_push_queue', { p_center: centerId });
  // Before the corrections SQL is run the queue does not exist: nothing to send.
  if (error) return { sent: 0, waiting: 0, failed: 0 };
  const queue = (data ?? []) as QueuedCorrection[];

  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

  const done: string[] = [];
  let failed = 0;
  for (const c of queue) {
    const req = correctionRequest(c);
    // Nothing to match on or nothing to send: there is no fets.live change to make.
    if (!req) {
      done.push(c.id);
      continue;
    }
    try {
      const res = await fetch(`${url}/rest/v1/candidates?${req.query}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(req.body),
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) done.push(c.id);
      else failed++;
    } catch {
      failed++;
    }
  }
  if (done.length) await rpc('fets_live_push_done', { p_ids: done, p_sent_at: sentAt });
  return { sent: done.length, waiting: queue.length - done.length, failed };
}
