import { checkHandlers } from '@/lib/shift-check-api';
import { supabaseServer } from '@/lib/supabase/server';
import { branchOf } from '@/lib/fets-live';
import { liveCheckRpc } from '@/lib/shift-check-server';
export const dynamic = 'force-dynamic';
async function context() {
  const db = await supabaseServer();
  const {data:{user},error} = await db.auth.getUser();
  if (error || !user) return {error:'Sign in to record checks',status:401} as const;
  if (!user.email || !user.email_confirmed_at) return {error:'Verify your staff email before recording checks',status:403} as const;
  const {data:p,error:pe} = await db.from('profiles').select('role,center_id').eq('id',user.id).maybeSingle();
  if (pe || !p || !['admin','tca','front_office','lab_staff'].includes(p.role)) return {error:'Staff access is required',status:403} as const;
  const {data:c,error:ce} = await db.from('centers').select('name,active').eq('id',p.center_id).maybeSingle();
  const branch = c?.active ? branchOf(c.name) : null;
  if (ce || !branch) return {error:'Choose an active centre before recording checks',status:403} as const;
  return {args:{p_online_user:user.id,p_email:user.email,p_branch:branch}} as const;
}
export const {GET,POST}=checkHandlers(context,liveCheckRpc);
