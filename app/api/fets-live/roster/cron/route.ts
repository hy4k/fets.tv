import { timingSafeEqual } from 'node:crypto';
import { supabaseService } from '@/lib/supabase/service';
import { syncLiveRoster } from '@/lib/sync-live-roster';
import { branchOf } from '@/lib/fets-live';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.FETS_ROSTER_CRON_SECRET;
  const received = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (!secret || Buffer.byteLength(received) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: centers, error } = await supabaseService().from('centers').select('id,name').eq('active', true);
  if (error) return Response.json({ error: 'Could not read centres' }, { status: 503 });
  const results = [];
  for (const center of centers ?? []) {
    if (!branchOf(center.name)) continue;
    try { results.push({ center: center.id, ok: true, ...await syncLiveRoster(center) }); }
    catch (error) { results.push({ center: center.id, ok: false, error: error instanceof Error ? error.message : 'Sync failed' }); }
  }
  return Response.json({ results }, { status: results.some(r => !r.ok) ? 409 : 200 });
}
