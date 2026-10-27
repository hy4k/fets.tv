type Context = {error:string;status:number} | {args:{p_online_user:string;p_email:string;p_branch:string}};
type Rpc = (name:'fets_online_check_snapshot'|'fets_online_record_check',args:Record<string,unknown>)=>Promise<unknown>;
const reply = (body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export function checkHandlers(context:()=>Promise<Context>,liveCheckRpc:Rpc) {
async function GET(request: Request) {
  const ctx = await context();
  if ('error' in ctx) return reply({error:ctx.error},ctx.status);
  const date = new URL(request.url).searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return reply({error:'Choose a valid date'},400);
  try {return reply(await liveCheckRpc('fets_online_check_snapshot',{...ctx.args,p_day:date}));}
  catch(e) {return reply({error:e instanceof Error ? e.message : 'Could not read shared checks'},503);}
}
async function POST(request: Request) {
  // Browser cookie credentials cannot be used by another origin. Host is set by
  // the reverse proxy; compare the full scheme/host, not a suffix match.
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':','');
  if (!origin || origin !== `${protocol}://${host}` || !request.headers.get('content-type')?.startsWith('application/json')) return reply({error:'Same-origin JSON request required'},403);
  const ctx = await context();
  if ('error' in ctx) return reply({error:ctx.error},ctx.status);
  if (Number(request.headers.get('content-length') ?? 0)>12000) return reply({error:'Check note is too long'},413);
  let body;
  try {const raw = await request.text();if(raw.length>12000)return reply({error:'Check note is too long'},413);body=JSON.parse(raw);} catch {return reply({error:'Invalid check'},400);}
  if (!body || typeof body !== 'object' || !/^[a-f0-9-]{36}$/i.test(body.planId ?? '') || !Number.isInteger(body.block) || body.block<0 || body.block>47 || !['walk','dvr'].includes(body.kind) || !Number.isInteger(body.due) || body.due<1 || body.due>1440 || typeof body.note!=='string' || body.note.length>2000) return reply({error:'Invalid check'},400);
  try {
    const event = await liveCheckRpc('fets_online_record_check',{...ctx.args,p_plan:body.planId,p_block:body.block,p_kind:body.kind,p_due:body.due,p_note:body.note});
    return reply({event});
  } catch(e) {return reply({error:e instanceof Error ? e.message : 'Could not save. Refresh to check the record.'},409);}
}

return {GET,POST};
}
