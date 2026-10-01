'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConsole } from '@/lib/console-data';
import { basePath } from '@/lib/base-path';
import { todayInZone } from '@/lib/format';
import { supabaseBrowser } from '@/lib/supabase/client';

type PullResult = {
  inserted: number;
  updated: number;
  retained: number;
  found: number;
  warnings: string[];
  date: string;
  prepared?: boolean;
};

type Prepared = { id: string; exam_date: string; count: number };

/** "2026-10-02" → "Fri 2 Oct". */
function dayLabel(date: string) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function addDays(date: string, n: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

/**
 * Bringing a day in from fets.live — any day from today on, when the staff
 * choose. Nothing pulls on its own.
 *
 * Today fills (or tops up) the live list. A later day is prepared: its list is
 * built and kept aside, and today carries on untouched. When that day comes,
 * pulling it again opens the prepared list with any late changes.
 */
export function RosterUploadScreen() {
  const { center, session, candidates, profile, refresh, notify } = useConsole();
  const router = useRouter();
  const today = todayInZone('Asia/Kolkata');
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PullResult | null>(null);
  const [error, setError] = useState('');
  const [prepared, setPrepared] = useState<Prepared[]>([]);
  const allowed = ['admin', 'tca', 'front_office'].includes(profile.role);
  const quick = useMemo(() => [0, 1, 2, 3].map((n) => addDays(today, n)), [today]);

  const loadPrepared = useCallback(async () => {
    const supabase = supabaseBrowser();
    const { data: sessions } = await supabase
      .from('exam_sessions')
      .select('id, exam_date')
      .eq('center_id', center.id)
      .eq('status', 'draft')
      .gt('exam_date', today)
      .order('exam_date');
    const rows = (sessions ?? []) as { id: string; exam_date: string }[];
    if (rows.length === 0) return setPrepared([]);
    const { data: people } = await supabase
      .from('candidates')
      .select('exam_session_id')
      .in('exam_session_id', rows.map((r) => r.id));
    const counts = new Map<string, number>();
    for (const p of (people ?? []) as { exam_session_id: string }[]) {
      counts.set(p.exam_session_id, (counts.get(p.exam_session_id) ?? 0) + 1);
    }
    setPrepared(rows.map((r) => ({ id: r.id, exam_date: r.exam_date, count: counts.get(r.id) ?? 0 })));
  }, [center.id, today]);

  useEffect(() => {
    // Loaded once on opening and after each pull; it only changes when
    // somebody pulls.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPrepared();
  }, [loadPrepared]);

  async function pull(day = date) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${basePath}/api/fets-live/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: day }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Could not pull the roster');
      setResult(body);
      if (body.prepared) {
        notify(`${dayLabel(day)} prepared · ${body.inserted} added · ${body.updated} updated`);
      } else {
        await refresh();
        notify(`${body.inserted} added · ${body.updated} matched with fets.live`);
      }
      await loadPrepared();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach fets.live');
    } finally {
      setBusy(false);
    }
  }

  const isToday = date === today;

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-auto p-1">
      <section className="rounded-[24px] border border-accent/35 panel-bg p-7">
        <p className="text-sm text-fg-faint">
          {center.name} · today is {dayLabel(today)}
        </p>
        <h1 className="mt-3 font-serif text-3xl">Bring a day in from fets.live.</h1>
        <p className="mt-4 max-w-2xl text-fg-muted">
          Pick any day from today on. Today fills the live list; a later day is prepared and kept aside, and today carries
          on untouched. Pulling again only adds and updates — check-in, keys, seats and exam progress are never reset.
          Nothing pulls on its own.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {quick.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                date === d ? 'border-accent/60 bg-accent/12 text-fg' : 'border-edge text-fg-muted hover:border-edge-warm'
              }`}
            >
              {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayLabel(d)}
            </button>
          ))}
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-xl border border-edge-strong bg-panel-soft px-3 py-2 font-mono text-sm text-fg outline-none focus:border-accent/50"
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            disabled={busy || !allowed}
            onClick={() => void pull()}
            className="rounded-xl gold-bg px-6 py-3 font-semibold text-[#1a1512] disabled:opacity-40"
          >
            {busy ? 'Checking and pulling…' : isToday ? 'Pull today from fets.live' : `Prepare ${dayLabel(date)}`}
          </button>
          <a
            href="https://fets.live/calendar"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-edge-warm px-6 py-3"
          >
            Open fets.live Calendar ↗
          </a>
          {session && (
            <button
              onClick={() => router.push('/front-office')}
              className="rounded-xl border border-edge-warm px-6 py-3"
            >
              View today&apos;s {candidates.length} candidates
            </button>
          )}
        </div>
        <p className="mt-4 text-sm text-fg-faint">
          {isToday
            ? 'If yesterday still has candidates inside, finish them first — today opens only once the hall is clear.'
            : `${dayLabel(date)} will be ready and waiting. On the day, pull it again to open it with any late changes.`}
        </p>
      </section>

      {error && (
        <p role="alert" className="rounded-xl border border-rust/40 bg-rust/10 p-5 text-rust">
          {error}
        </p>
      )}

      {result && (
        <section aria-live="polite" className="rounded-2xl border border-edge p-5">
          <h2 className="text-xl">
            {result.prepared ? `${dayLabel(result.date)} prepared` : `Today checked · ${dayLabel(result.date)}`}
          </h2>
          <p className="mt-2">
            {result.found} in fets.live · {result.inserted} added · {result.updated} matched
            {result.retained ? ` · ${result.retained} kept that fets.live no longer lists` : ''}
          </p>
          {result.warnings.map((warning, i) => (
            <p key={i} className="mt-3 text-gold">
              {warning}
            </p>
          ))}
        </section>
      )}

      <section className="rounded-2xl border border-edge p-5">
        <h2 className="text-lg font-semibold">Prepared days</h2>
        {prepared.length === 0 ? (
          <p className="mt-2 text-sm text-fg-faint">None yet. Pick a later day above to prepare it.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {prepared.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-edge-soft bg-panel-soft/60 px-4 py-3">
                <span className="min-w-[110px] font-semibold">{dayLabel(p.exam_date)}</span>
                <span className="text-sm text-fg-muted">{p.count} candidates</span>
                <span className="flex-1" />
                <button
                  type="button"
                  disabled={busy || !allowed}
                  onClick={() => {
                    setDate(p.exam_date);
                    void pull(p.exam_date);
                  }}
                  className="rounded-lg border border-edge-warm px-3 py-2 text-sm font-semibold text-fg-muted hover:text-fg disabled:opacity-40"
                >
                  Pull again
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
