'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConsole } from '@/lib/console-data';
import { basePath } from '@/lib/base-path';
import { todayInZone } from '@/lib/format';

type PullResult = { inserted: number; updated: number; retained: number; found: number; warnings: string[]; date: string };

export function RosterUploadScreen() {
  const { center, session, candidates, profile, refresh, notify } = useConsole();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PullResult | null>(null);
  const [error, setError] = useState('');
  const allowed = ['admin', 'tca', 'front_office'].includes(profile.role);
  async function pull() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`${basePath}/api/fets-live/roster`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Could not pull the roster');
      setResult(body); await refresh();
      notify(`${body.inserted} added · ${body.updated} matched with fets.live`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not reach fets.live'); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-1 flex-col gap-5 overflow-auto p-1">
    <section className="rounded-[24px] border border-accent/35 panel-bg p-7">
      <p className="text-sm text-fg-faint">{center.name} · {todayInZone('Asia/Kolkata')}</p>
      <h1 className="mt-3 font-serif text-3xl">One roster. A connected exam day.</h1>
      <p className="mt-4 max-w-2xl text-fg-muted">Candidates are maintained in the fets.live Calendar. Bring all providers into today’s list together. Repeating a pull preserves check-in, lockers, seating and exam progress.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button disabled={busy || !allowed} onClick={() => void pull()} className="rounded-xl gold-bg px-6 py-3 font-semibold text-[#1a1512] disabled:opacity-40">{busy ? 'Checking and pulling…' : 'Pull today from fets.live'}</button>
        <a href="https://fets.live/calendar" target="_blank" rel="noreferrer" className="rounded-xl border border-edge-warm px-6 py-3">Open fets.live Calendar ↗</a>
        {session && <button onClick={() => router.push('/candidates')} className="rounded-xl border border-edge-warm px-6 py-3">View {candidates.length} candidates</button>}
      </div>
      <p className="mt-4 text-sm text-fg-faint">The morning pull runs at 6:00 AM IST. While this console is open, it checks for updates every five minutes. Correct missing IDs, appointment times or count differences in fets.live, then pull again.</p>
    </section>
    {error && <p role="alert" className="rounded-xl border border-rust/40 bg-rust/10 p-5 text-rust">{error}</p>}
    {result && <section aria-live="polite" className="rounded-2xl border border-edge p-5">
      <h2 className="text-xl">Roster checked · {result.date}</h2>
      <p className="mt-2">{result.found} in source · {result.inserted} added · {result.updated} matched · {result.retained ?? 0} existing candidates retained</p>
      {result.warnings.map((warning, i) => <p key={i} className="mt-3 text-gold">{warning}</p>)}
    </section>}
  </div>;
}
