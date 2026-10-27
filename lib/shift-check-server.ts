import { isSecretKey } from './fets-live';

/** This module is imported only by API routes. Credentials never enter UI props. */
export async function liveCheckRpc(name: 'fets_online_check_snapshot' | 'fets_online_record_check', args: Record<string, unknown>) {
  const url = process.env.FETS_LIVE_SUPABASE_URL?.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = process.env.FETS_LIVE_SUPABASE_KEY;
  if (!url || new URL(url).hostname !== 'qqewusetilxxfvfkmsed.supabase.co' || !key || !isSecretKey(key)) {
    throw new Error('The FETS Live server connection is unavailable. No check was recorded.');
  }
  const headers: Record<string,string> = { apikey:key, 'Content-Type':'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const rpcName=name==='fets_online_check_snapshot'?'fets_online_shift_snapshot_v2':'fets_online_shift_record_v2';
  const response = await fetch(`${url}/rest/v1/rpc/${rpcName}`, { method:'POST', headers, body:JSON.stringify(args), cache:'no-store', signal:AbortSignal.timeout(15000) });
  const body = await response.json();
  if (!response.ok) {
    // Only controlled business-rule messages may be returned to the browser.
    const messages = ['Your verified email needs an active FETS Live staff account with access to this centre','Only the assigned owner or named break cover can record this check','Check is not currently due; missed checks cannot be backfilled','This check is already recorded; refresh the log','Report already submitted; this shift is closed','Your current roster no longer covers this shift; contact the lead','Published plan not found at your centre'];
    throw new Error(messages.includes(body.message) ? body.message : 'The shared check service is unavailable. Refresh to confirm whether the check was saved.');
  }
  return body;
}
