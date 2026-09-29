"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { basePath } from "@/lib/base-path";
import { useConsole } from "@/lib/console-data";
import { PROVIDERS, type DaySchedule, type Provider } from "@/lib/fets-live";
import { clockAt, todayInZone } from "@/lib/format";

const REMEMBER = "fets.provider";

/** A mark of colour for each provider, so the five read apart at a glance. */
const TINT: Record<Provider, string> = {
  Prometric: "oklch(0.72 0.14 250)",
  "Pearson VUE": "oklch(0.72 0.15 300)",
  CELPIP: "oklch(0.74 0.15 25)",
  PSI: "oklch(0.76 0.13 160)",
  ITTS: "oklch(0.8 0.13 80)",
};

/**
 * The first page of the day: which provider's exams are on.
 *
 * Choosing a provider reads that day from the fets.live calendar — how many
 * are booked, which exams, and how many hours the day runs. Below it, the
 * same three numbers from the roster once it is uploaded, so the two can be
 * checked against each other before the first candidate walks in.
 */
export function ExamsScreen() {
  const { center, candidates, session, programmes } = useConsole();
  const date = todayInZone(center.timezone);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [day, setDay] = useState<DaySchedule | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER) as Provider | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && (PROVIDERS as readonly string[]).includes(saved)) setProvider(saved);
    } catch {}
  }, []);

  useEffect(() => {
    if (!provider) return;
    let stale = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`${basePath}/api/fets-live/day?provider=${encodeURIComponent(provider)}&date=${date}`)
      .then((r) => r.json())
      .then((d: DaySchedule) => !stale && setDay(d))
      .catch(() => !stale && setDay({ connected: false, reason: "Could not reach the calendar." }))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [provider, date]);

  function choose(p: Provider) {
    setProvider(p);
    setDay(null);
    try {
      localStorage.setItem(REMEMBER, p);
    } catch {}
  }

  // The same three numbers, from the roster already in fets.tv.
  const fromRoster = useMemo(() => {
    // Only today's roster: one uploaded ahead for tomorrow is not today's day.
    if (!session || session.exam_date !== date) return null;
    // Every booking, no-shows included: the calendar still has them, and the
    // figures should not drift as the day goes on.
    const booked = candidates;
    if (booked.length === 0) return null;
    const minutes =
      programmes.find((p) => p.id === session.programme_id)?.default_duration_minutes ?? null;
    const starts = booked.map((c) => (c.scheduled_at ? Date.parse(c.scheduled_at) : NaN)).filter((n) => !Number.isNaN(n));
    const first = starts.length ? Math.min(...starts) : null;
    const last = starts.length ? Math.max(...starts) : null;
    const end = last !== null && minutes ? last + minutes * 60000 : last;
    const parts = new Map<string, number>();
    for (const c of booked) parts.set(c.part ?? session.exam_name, (parts.get(c.part ?? session.exam_name) ?? 0) + 1);
    return {
      count: booked.length,
      exam: session.exam_name,
      parts: [...parts.entries()].sort((a, b) => b[1] - a[1]),
      first,
      end,
      hours: first !== null && end !== null ? (end - first) / 3600000 : null,
    };
  }, [candidates, session, programmes, date]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto">
      <section className="grid shrink-0 grid-cols-2 gap-[10px] sm:grid-cols-3 lg:grid-cols-5">
        {PROVIDERS.map((p) => {
          const on = p === provider;
          return (
            <button
              key={p}
              type="button"
              onClick={() => choose(p)}
              aria-pressed={on}
              style={{ "--t": TINT[p] } as React.CSSProperties}
              className={`group flex min-h-[92px] cursor-pointer flex-col justify-between rounded-[18px] border p-[14px] text-left transition-all ${
                on
                  ? "border-[color-mix(in_oklab,var(--t)_65%,transparent)] bg-[linear-gradient(150deg,color-mix(in_oklab,var(--t)_16%,transparent),transparent_75%)] shadow-[0_14px_34px_-20px_var(--t)]"
                  : "border-edge-soft panel-bg hover:border-edge-warm"
              }`}
            >
              <span
                className="h-[6px] w-[34px] rounded-full"
                style={{ background: `linear-gradient(90deg, var(--t), color-mix(in oklab, var(--t) 40%, transparent))` }}
              />
              <span className="font-serif text-[22px] leading-tight">{p}</span>
            </button>
          );
        })}
      </section>

      <section className="shrink-0 rounded-[20px] border border-edge-mid panel-bg p-[18px]">
        <div className="flex flex-wrap items-baseline gap-[10px]">
          <span className="text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">
            {provider ? `${provider} · today` : "Choose a provider"}
          </span>
          <span className="font-mono text-[11px] text-fg-faint">{date}</span>
          <span className="flex-1" />
          <span className="font-mono text-[10.5px] text-fg-faint">from fets.live</span>
        </div>

        {!provider ? (
          <p className="mt-[12px] text-[13.5px] text-fg-muted">
            Pick the provider running today to see its bookings from the fets.live calendar.
          </p>
        ) : loading || !day ? (
          <p className="mt-[12px] text-[13.5px] text-fg-faint">Reading the calendar…</p>
        ) : day.connected ? (
          <>
            <Figures count={day.count} exams={day.exams.length} hours={day.hours} />
            <ul className="mt-[14px] divide-y divide-edge-soft rounded-[14px] border border-edge-soft">
              {day.exams.map((e) => (
                <li key={e.name} className="flex items-center gap-[12px] px-[14px] py-[10px] text-[13.5px]">
                  <span className="min-w-0 flex-1 truncate font-semibold">{e.name}</span>
                  <span className="font-mono text-[12px] text-fg-dim">
                    {e.start ? clockAt(e.start, center.timezone) : "—"}–{e.end ? clockAt(e.end, center.timezone) : "—"}
                  </span>
                  <span className="w-[64px] text-right font-mono text-[12.5px]">{e.count}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="mt-[12px] rounded-[14px] border border-dashed border-edge-warm bg-panel-soft/50 px-[14px] py-[13px]">
            <span className="block text-[13.5px] font-semibold">{day.reason}</span>
            <span className="mt-[4px] block text-[12.5px] text-fg-muted">
              Once it is, this shows {provider}&rsquo;s bookings for today: how many, which exams, and
              how many hours the day runs.
            </span>
          </div>
        )}
      </section>

      <section className="shrink-0 rounded-[20px] border border-edge-mid panel-bg p-[18px]">
        <div className="flex flex-wrap items-baseline gap-[10px]">
          <span className="text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">From today&rsquo;s roster</span>
          <span className="flex-1" />
          <Link href="/roster" className="rounded-[12px] gold-bg px-[14px] py-[8px] text-[12.5px] font-bold text-[#141418]">
            {fromRoster ? "Roster" : "Upload the roster →"}
          </Link>
        </div>
        {fromRoster ? (
          <>
            <Figures count={fromRoster.count} exams={fromRoster.parts.length} hours={fromRoster.hours} />
            <p className="mt-[10px] font-mono text-[11.5px] text-fg-dim">
              {fromRoster.exam}
              {fromRoster.first !== null &&
                ` · ${clockAt(new Date(fromRoster.first).toISOString(), center.timezone)}–${
                  fromRoster.end ? clockAt(new Date(fromRoster.end).toISOString(), center.timezone) : "—"
                }`}
            </p>
            <ul className="mt-[10px] flex flex-wrap gap-[7px]">
              {fromRoster.parts.map(([name, n]) => (
                <li key={name} className="rounded-[10px] border border-edge-soft bg-panel-soft px-[10px] py-[6px] text-[12px]">
                  {name} <span className="ml-[4px] font-mono text-fg-dim">{n}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-[12px] text-[13.5px] text-fg-muted">
            No roster uploaded for today yet. The next step is the roster.
          </p>
        )}
      </section>
    </div>
  );
}

function Figures({ count, exams, hours }: { count: number; exams: number; hours: number | null }) {
  const items: [string, string][] = [
    ["Candidates", String(count)],
    ["Exams", String(exams)],
    ["Hours", hours === null ? "—" : hours.toFixed(hours % 1 === 0 ? 0 : 1)],
  ];
  return (
    <div className="mt-[14px] grid grid-cols-3 gap-[10px]">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-[14px] border border-edge-soft bg-panel-soft/60 px-[14px] py-[12px]">
          <span className="block font-mono text-[10px] tracking-[0.12em] text-fg-faint uppercase">{label}</span>
          <span className="mt-[4px] block font-serif text-[32px] leading-none text-accent">{value}</span>
        </div>
      ))}
    </div>
  );
}
