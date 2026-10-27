import test from 'node:test';
import assert from 'node:assert/strict';
import {canRecord,checkStatus,dueAt,sharedLogCsv,type CheckSnapshot,type SharedCheck} from '../lib/shift-checks.ts';
import {checkHandlers} from '../lib/shift-check-api.ts';
const day='2026-10-20';
const check:SharedCheck={block:0,kind:'walk',due:570,owner_id:'outgoing',owner_name:'Outgoing',event:null};
const snapshot:CheckSnapshot={connected:true,server_now:'2026-10-20T04:00:00Z',viewer_id:'outgoing',viewer_rostered:true,plan:{id:'00000000-0000-0000-0000-000000000001',day,branch:'cochin',version:1,closed:false},checks:[check]};
test('only current due owner can record; outgoing owner keeps a changeover check',()=>{
 assert.equal(canRecord(snapshot,check,dueAt(day,570)-1),false);
 assert.equal(canRecord(snapshot,check,dueAt(day,570)),true);
 assert.equal(canRecord({...snapshot,viewer_id:'incoming'},check,dueAt(day,570)),false);
 assert.equal(checkStatus(snapshot,check,dueAt(day,580)),'missed');
 assert.equal(canRecord(snapshot,check,dueAt(day,580)),false);
});
test('named cover is used exactly as supplied by the canonical database',()=>{
 const c={...check,owner_id:'cover',due:610};assert.equal(canRecord(snapshot,c,dueAt(day,610)),false);assert.equal(canRecord({...snapshot,viewer_id:'cover'},c,dueAt(day,610)),true);
});
test('DVR closes at six minutes, closure and roster removal disable writes',()=>{
 const c={...check,kind:'dvr' as const,due:576};assert.equal(canRecord(snapshot,c,dueAt(day,582)-1),true);assert.equal(checkStatus(snapshot,c,dueAt(day,582)),'missed');
 assert.equal(canRecord({...snapshot,viewer_rostered:false},check,dueAt(day,570)),false);
 assert.equal(canRecord({...snapshot,plan:{...snapshot.plan!,closed:true}},check,dueAt(day,570)),false);
});
test('an existing check never becomes missed or recordable again',()=>{
 const c={...check,event:{id:'event',actor_id:'outgoing',actor_name:'Actual actor',created_at:new Date(dueAt(day,571)).toISOString(),note:'Done'}};
 assert.equal(checkStatus(snapshot,c,dueAt(day,800)),'recorded');assert.equal(canRecord(snapshot,c,dueAt(day,571)),false);
});
test('export uses exact record IDs and actual actors, never nearest-time matching',()=>{
 const c={...check,event:{id:'event-123',actor_id:'outgoing',actor_name:'Actual actor',created_at:new Date(dueAt(day,579)).toISOString(),note:' =formula'}};
 const s={...snapshot,checks:[c,{...check,due:580}]};const csv=sharedLogCsv(s,dueAt(day,600));
 assert.equal(csv.split('event-123').length-1,1);assert.match(csv,/' =formula/);assert.match(csv,/"missed","","","",""/);
 assert.match(csv,/'?Actual actor/);
});
const identity={p_online_user:'trusted-online-id',p_email:'staff@example.test',p_branch:'cochin'};
const input={planId:snapshot.plan!.id,block:0,kind:'walk',due:570,note:'Completed'};
const request=(body:unknown=input,origin='https://fets.online')=>new Request('https://fets.online/api/fets-live/checks',{method:'POST',headers:{origin,host:'fets.online','content-type':'application/json'},body:JSON.stringify(body)});
test('anonymous requests never call the Live bridge',async()=>{
 let calls=0;const h=checkHandlers(async()=>({error:'Not signed in',status:401}),async()=>{calls++;});
 assert.equal((await h.POST(request())).status,401);assert.equal((await h.GET(new Request('https://fets.online/api/fets-live/checks?date='+day))).status,401);assert.equal(calls,0);
});
test('cross-origin and invalid input requests cannot write',async()=>{
 let calls=0;const h=checkHandlers(async()=>({args:identity}),async()=>{calls++;});
 assert.equal((await h.POST(request(input,'https://attacker.test'))).status,403);
 for(const bad of [null,{...input,kind:'verify'},{...input,block:48},{...input,due:570.5},{...input,note:'a'.repeat(2001)}])assert.equal((await h.POST(request(bad))).status,400);
 assert.equal(calls,0);
});
test('forged actor/centre/email/timestamp fields are ignored; context is authoritative',async()=>{
 let args:Record<string,unknown>={};const h=checkHandlers(async()=>({args:identity}),async(_name,a)=>{args=a;return{id:'saved'};});
 const res=await h.POST(request({...input,p_email:'victim@example.test',p_branch:'calicut',actor_id:'victim',created_at:'2020-01-01'}));
 assert.equal(res.status,200);assert.deepEqual(args,{...identity,p_plan:input.planId,p_block:0,p_kind:'walk',p_due:570,p_note:'Completed'});assert.match(res.headers.get('cache-control')??'',/no-store/);
});
test('read failure and uncertain write are errors, never successful completion',async()=>{
 const h=checkHandlers(async()=>({args:identity}),async()=>{throw new Error('Unavailable');});
 assert.equal((await h.GET(new Request('https://fets.online/api/fets-live/checks?date='+day))).status,503);
 assert.equal((await h.POST(request())).status,409);
});

test('variable day plans accept early morning, evening and additional monitoring windows',async()=>{let calls=0;const h=checkHandlers(async()=>({args:identity}),async()=>{calls++;return{id:'saved'}});for(const due of [366,1080,1230])assert.equal((await h.POST(request({...input,block:7,due}))).status,200);assert.equal(calls,3);for(const due of [0,1441])assert.equal((await h.POST(request({...input,due}))).status,400);});
test('slots before new-plan activation are not falsely marked missed',()=>{const s={...snapshot,plan:{...snapshot.plan!,tracking_from:new Date(dueAt(day,580)).toISOString()}};assert.equal(checkStatus(s,check,dueAt(day,600)),'not-tracked');assert.equal(canRecord(s,check,dueAt(day,571)),false)});
