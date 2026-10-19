import { supabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';
import { pushLiveCorrections } from '@/lib/live-corrections';
export const dynamic = 'force-dynamic';

/**
 * Send this centre's waiting corrections to fets.live. The console calls it
 * right after staff save a candidate's details; the centre comes from the
 * signed-in staff member's profile, never from the request.
 */
export async function POST() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role,center_id').eq('id', user.id).maybeSingle();
  if (!profile || profile.role === 'viewer') return Response.json({ error: 'Staff only' }, { status: 403 });
  try {
    return Response.json(await pushLiveCorrections(supabaseService(), profile.center_id));
  } catch {
    return Response.json({ error: 'Could not reach fets.live; the corrections will go with the next pull.' }, { status: 502 });
  }
}
