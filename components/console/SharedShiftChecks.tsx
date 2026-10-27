"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {basePath} from "@/lib/base-path";
import {canRecord,checkStatus,dueAt,sharedLogCsv,type CheckSnapshot,type SharedCheck} from "@/lib/shift-checks";
const slotKey = (c: SharedCheck) => `${c.block}:${c.kind}:${c.due}`;
const time = (date: string, due: number) => new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit'}).format(dueAt(date,due));

/** No locally invented checks. The database owns the due time, owner and record. */
export function SharedChecks({date,centerName,notify,readOnly=false}:{date:string;centerName:string;readOnly?:boolean;notify?:(message:string,tone?:'ok'|'error')=>void}) {
  const [snapshot,setSnapshot] = useState<CheckSnapshot|null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState('');
  const [notes,setNotes] = useState<Record<string,string>>({});
  const [now,setNow] = useState(()=>Date.now());
  const offset = useRef(0);
  const requestId = useRef(0);
  const mounted = useRef(true);
  const saving = useRef(false);
  const load = useCallback(async () => {
    const id=++requestId.current;
    try {
      const res=await fetch(`${basePath}/api/fets-live/checks?date=${encodeURIComponent(date)}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error || 'Could not read shared checks.');
      if(!data.connected || !Number.isFinite(Date.parse(data.server_now)))throw new Error('Could not read shared checks.');
      if(!mounted.current || id!==requestId.current)return;
      offset.current=Date.parse(data.server_now)-Date.now();
      setNow(Date.now()+offset.current);setSnapshot(data);setError('');
    } catch(e) {if(mounted.current && id===requestId.current)setError(e instanceof Error?e.message:'Could not read shared checks.');}
  },[date]);
  useEffect(()=>{
    mounted.current=true;void load();
    const poll=setInterval(()=>{if(!saving.current)void load();},10000);
    const tick=setInterval(()=>setNow(Date.now()+offset.current),1000);
    const focus=()=>{if(!saving.current)void load();};window.addEventListener('focus',focus);
    return()=>{mounted.current=false;clearInterval(poll);clearInterval(tick);window.removeEventListener('focus',focus);};
  },[load]);
  async function record(check:SharedCheck) {
    if(readOnly || !snapshot?.plan || error || saving.current || !canRecord(snapshot,check,now))return;
    const key=slotKey(check);saving.current=true;setBusy(key);requestId.current++;
    try {
      const res=await fetch(`${basePath}/api/fets-live/checks`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId:snapshot.plan.id,block:check.block,kind:check.kind,due:check.due,note:notes[key]??''}),signal:AbortSignal.timeout(20000)});
      const data=await res.json();if(!res.ok)throw new Error(data.error || 'Could not save. Refresh to confirm the record.');
      if(!mounted.current)return;
      setNotes(n=>({...n,[key]:''}));notify?.('Check recorded in FETS Online and The Shift.');
      await load();
    } catch(e) {if(mounted.current)setError(e instanceof Error?e.message:'Could not save. Refresh before trying again.');}
    finally {saving.current=false;if(mounted.current)setBusy('');}
  }
  const checks=snapshot?.checks??[];
  const recorded=checks.filter(c=>!!c.event).length;
  const missed=snapshot?checks.filter(c=>checkStatus(snapshot,c,now)==='missed').length:0;
  function download() {
    if(!snapshot?.plan || error)return;
    const url=URL.createObjectURL(new Blob([sharedLogCsv(snapshot,now)],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`fets-shared-checks-${snapshot.plan.branch}-${date}.csv`;a.click();URL.revokeObjectURL(url);
  }
  return <section aria-label="Shared lab checks" className="w-full basis-full min-w-0 rounded-2xl border border-white/15 bg-ink/40 p-4 md:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-fg">{readOnly?'Shift check log':'Lab walks & DVR checks'}</h2><p className="mt-1 text-xs text-fg-muted">{snapshot?.plan?.branch||centerName} · {date} · Published timetable from The Shift · India time</p></div>
      <button type="button" onClick={()=>void load()} disabled={!!busy} className="rounded-xl border border-white/20 px-3 py-2 text-sm text-fg hover:bg-white/10 disabled:opacity-40">Refresh</button>
    </div>
    {error && <div role="alert" className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100">{error} {snapshot?.plan && 'Shown records may be out of date. Recording is paused until refresh succeeds.'}</div>}
    {!snapshot && !error && <p className="mt-4 text-sm text-fg-muted" role="status">Reading the published timetable…</p>}
    {snapshot && !snapshot.plan && <p className="mt-4 text-sm text-fg-muted">{snapshot.reason} <a href="https://fets.live" target="_blank" rel="noreferrer" className="underline">Open The Shift</a></p>}
    {snapshot?.plan && <>
      {snapshot.plan.closed && <p role="status" className="mt-3 text-sm text-fg-muted">This shift is closed. Its records are read-only.</p>}
      {!readOnly && <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(['walk','dvr'] as const).map(kind=>{
          const mine=checks.filter(c=>c.kind===kind);
          const current=[...mine].reverse().find(c=>dueAt(date,c.due)<=now)??mine[0];
          const next=mine.find(c=>dueAt(date,c.due)>now);
          if(!current)return null;
          const state=checkStatus(snapshot,current,now),key=slotKey(current);
          const can=canRecord(snapshot,current,now)&&!error&&!busy;
          return <div key={kind} className="min-w-0 rounded-xl border border-white/15 bg-white/[0.025] p-4">
            <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-fg">{kind==='walk'?'Lab walk':'DVR check'}<span className="mt-1 block text-xs font-normal text-fg-muted">Every {kind==='walk'?10:6} minutes</span></h3><span className={`rounded-full px-3 py-1 text-xs ${state==='recorded'?'bg-emerald-300/15 text-emerald-200':state==='due'?'bg-amber-300/15 text-amber-100':'bg-white/10 text-fg-muted'}`}>{state==='recorded'?'Recorded':state==='due'?'Due now':state==='missed'?'Not recorded':state==='closed'?'Closed':state==='not-tracked'?'Before activation':'Upcoming'}</span></div>
            <p className="mt-4 text-3xl font-semibold tabular-nums text-fg">{time(date,current.due)}</p>
            <p className="mt-2 text-sm text-fg">Assigned to <strong>{current.owner_name||'Unassigned — contact the lead'}</strong></p>
            {current.event ? <p className="mt-2 text-sm text-emerald-200">Recorded by {current.event.actor_name||'staff'} at {new Date(current.event.created_at).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit'})}.</p> : <>
              <label className="mt-3 block text-xs text-fg-muted" htmlFor={`note-${kind}`}>Note, if needed</label>
              <input id={`note-${kind}`} maxLength={2000} value={notes[key]??''} onChange={e=>setNotes(n=>({...n,[key]:e.target.value}))} disabled={!can} className="mt-1 w-full min-w-0 rounded-lg border border-white/20 bg-ink/50 px-3 py-2 text-sm text-fg disabled:opacity-40" />
              <button type="button" disabled={!can} onClick={()=>void record(current)} className="mt-3 w-full rounded-xl border border-emerald-200/30 bg-emerald-200/15 px-3 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-200/25 disabled:cursor-not-allowed disabled:opacity-40">{busy===key?'Saving…':kind==='walk'?'Record completed walk':'Record completed DVR check'}</button>
              <p className="mt-2 text-xs text-fg-muted">{state==='missed'?'The recording window has ended. Missed checks cannot be backfilled.':state==='upcoming'?'Record only after the check is due and you have completed it.':state==='closed'?'The day report has closed this shift.':state==='not-tracked'?'This check was due before shared tracking was activated. It is not counted as missed.':!snapshot.viewer_rostered?'Your current roster must cover this centre and day.':current.owner_id!==snapshot.viewer_id?'The assigned person or named break cover must record this check.':'Record only after you have completed the check.'}</p>
            </>}
            {next && next!==current && <p className="mt-3 border-t border-white/10 pt-2 text-xs text-fg-muted">Next: {time(date,next.due)} · {next.owner_name||'Unassigned'}</p>}
          </div>;
        })}
      </div>}
      {readOnly && <p className="mt-3 text-xs text-fg-muted">Shared duty records. Download this log separately from the signed exam report.</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-fg-muted">{recorded} recorded · {missed} missed · Saved once, shown in both sites</p><button type="button" disabled={!!error} onClick={download} className="rounded-xl border border-white/20 px-3 py-2 text-fg disabled:opacity-40">Download check log</button></div>
      <details open={readOnly || undefined} className="mt-3 border-t border-white/10 pt-3"><summary className="cursor-pointer text-sm font-semibold text-fg">View the day’s checks</summary><div className="mt-3 max-h-96 overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="text-fg-muted"><th className="p-2">Due</th><th className="p-2">Check</th><th className="p-2">Assigned / recorded by</th><th className="p-2">Status</th></tr></thead><tbody>{checks.map(c=><tr key={slotKey(c)} className="border-t border-white/10"><td className="p-2 whitespace-nowrap">{time(date,c.due)}</td><td className="p-2">{c.kind==='walk'?'Walk':'DVR'}</td><td className="p-2 break-words">{c.owner_name||'Unassigned'}{c.event&&<span className="block text-fg-muted">Recorded: {c.event.actor_name}{c.event.note&&` · ${c.event.note}`}</span>}</td><td className="p-2">{checkStatus(snapshot,c,now)}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
