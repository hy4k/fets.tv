import { supabaseServer } from '@/lib/supabase/server';
import { syncLiveRoster } from '@/lib/sync-live-roster';
export const dynamic = 'force-dynamic';

/** Pull all providers together. The staff member's own centre is determined on the server. */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role,center_id').eq('id', user.id).maybeSingle();
  if (!profile || !['admin', 'tca', 'front_office'].includes(profile.role)) return Response.json({ error: 'Roster staff only' }, { status: 403 });
  const { data: center } = await supabase.from('centers').select('id,name').eq('id', profile.center_id).eq('active', true).maybeSingle();
  if (!center) return Response.json({ error: 'Active centre required' }, { status: 403 });
  // An empty body, or none, means today.
  const body = (await request.json().catch(() => null)) as { date?: unknown } | null;
  const date = typeof body?.date === 'string' ? body.date : undefined;
  try { return Response.json(await syncLiveRoster(center, date)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Roster sync failed' }, { status: 409 }); }
}
