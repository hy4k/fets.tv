"use client";

import { useState } from "react";
import { basePath } from "@/lib/base-path";
import { useConsole } from "@/lib/console-data";
import {
  DVR_MINUTES,
  WALK_MINUTES,
  dutyLogCsv,
  dutySpan,
  marks,
  nextMark,
  twoDigit,
  type DutyCheck,
  type DutyRota,
} from "@/lib/duty-timer";
import { clockAt, todayInZone } from "@/lib/format";
import type { Candidate } from "@/lib/types";
import { useNow } from "@/lib/use-clock";

const DVR = { ink: "oklch(0.86 0.12 205)", glow: "oklch(0.8 0.14 205 / 0.75)" };
const WALK = { ink: "oklch(0.88 0.13 85)", glow: "oklch(0.85 0.14 85 / 0.75)" };

/**
 * The Lab's top banner: the whole sitting as one long liquid-glass cylinder.
 *
 * It fills from the first exam start to the last expected finish. Gold marks
 * above the glass are the ten-minute floor walks, cyan marks below are the
 * six-minute DVR checks; two counters say how long until the next of each.
 * Nothing is logged here — the export at the end gives the day's sheet, with
 * who was on duty for each mark taken from the fets.live rota.
 */
export function DutyTimer() {
  const { candidates, walkthroughs, center, session, notify } = useConsole();
  return (
    <DutyTimerView
      candidates={candidates}
      checks={walkthroughs}
      timezone={center.timezone}
      date={session?.exam_date ?? todayInZone(center.timezone)}
      notify={notify}
    />
  );
}

/** The day's rota from fets.live, or why there is none. */
async function loadRota(date: string): Promise<{ rota: DutyRota | null; reason?: string }> {
  try {
    const res = await fetch(`${basePath}/api/fets-live/duty-rota?date=${date}`, { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) return { rota: null, reason: body.error ?? "Could not read the fets.live rota." };
    return body.connected ? { rota: body.rota } : { rota: null, reason: body.reason };
  } catch {
    return { rota: null, reason: "Could not reach fets.live." };
  }
}

export function DutyTimerView({
  candidates,
  checks,
  timezone,
  date,
  notify,
}: {
  candidates: Candidate[];
  checks: DutyCheck[];
  timezone: string;
  date: string;
  notify?: (message: string) => void;
}) {
  const now = useNow();
  const [exporting, setExporting] = useState(false);
  const { start, end } = dutySpan(candidates);

  if (now === 0) return null;

  const running = start !== null && end !== null;
  const over = running && now >= end;
  const span = running ? Math.max(1, end - start) : 1;
  const at = (t: number) => (running ? Math.min(100, Math.max(0, ((t - start) / span) * 100)) : 0);
  const progress = running ? at(now) / 100 : 0;
  const dvr = running ? nextMark(start, end, DVR_MINUTES, now) : null;
  const walk = running ? nextMark(start, end, WALK_MINUTES, now) : null;

  async function exportLog() {
    setExporting(true);
    const { rota, reason } = await loadRota(date);
    setExporting(false);
    // The sheet still goes out without the rota; the on-duty column is blank.
    if (!rota && reason) notify?.(`Exported without rota names: ${reason}`);
    const csv = dutyLogCsv({ start, end, checks, date, timezone, rota });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `fets-duty-log-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex w-full basis-full flex-col gap-[14px]">
      <div className="flex flex-wrap items-end gap-x-[22px] gap-y-[10px]">
        <Counter label="DVR check" every={DVR_MINUTES} tone={DVR} left={dvr?.left ?? null} running={running && !over} />
        <Counter label="Floor walk" every={WALK_MINUTES} tone={WALK} left={walk?.left ?? null} running={running && !over} />
        <span className="flex-1" />
        <span className="font-mono text-[11.5px] text-fg-dim">
          {!running
            ? "Starts with the first exam"
            : over
              ? `Done · ${clockAt(new Date(start).toISOString(), timezone)}–${clockAt(new Date(end).toISOString(), timezone)}`
              : `Until ${clockAt(new Date(end).toISOString(), timezone)}`}
        </span>
        <button
          type="button"
          disabled={!running || exporting}
          onClick={() => void exportLog()}
          className="cursor-pointer rounded-[12px] border border-accent/30 bg-ink/50 px-[14px] py-[8px] text-[12.5px] font-semibold text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          {exporting ? "Reading the rota…" : "Export the day’s log"}
        </button>
      </div>

      {/* The cylinder, with walk marks above it and DVR marks below. */}
      <div className="relative px-[4px] pt-[18px] pb-[18px]">
        {running &&
          marks(start, end, WALK_MINUTES).map((t) => (
            <Tick key={`w${t}`} left={at(t)} tone={WALK} passed={t <= now} side="top" />
          ))}
        {running &&
          marks(start, end, DVR_MINUTES).map((t) => (
            <Tick key={`d${t}`} left={at(t)} tone={DVR} passed={t <= now} side="bottom" />
          ))}

        <div className="relative h-[34px] rounded-full border border-white/[0.14] bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.015)_55%,rgba(0,0,0,0.3))] p-[4px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),inset_0_-12px_20px_rgba(0,0,0,0.5),0_18px_34px_-18px_rgba(0,0,0,0.95)]">
          <div className="relative h-full overflow-hidden rounded-full bg-[linear-gradient(180deg,rgba(0,0,0,0.4),rgba(255,255,255,0.03))] shadow-[inset_0_2px_5px_rgba(0,0,0,0.55)]">
            {progress > 0 && (
              <span
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-linear"
                style={{
                  width: `${progress * 100}%`,
                  background: "linear-gradient(90deg, oklch(0.62 0.09 205), oklch(0.8 0.11 190) 60%, oklch(0.9 0.08 170))",
                  boxShadow: "0 0 18px oklch(0.8 0.12 195 / 0.55)",
                }}
              >
                <span className="absolute inset-x-[6px] top-[2px] h-[36%] rounded-full bg-gradient-to-b from-white/75 to-white/0" />
                <span className="absolute inset-x-0 bottom-0 h-[35%] bg-gradient-to-t from-black/25 to-transparent" />
                {!over && (
                  <span className="absolute inset-y-[3px] right-[3px] w-[10px] rounded-full bg-white/70 blur-[3px] motion-safe:animate-pulse" />
                )}
              </span>
            )}
          </div>
          {/* The glass: one long highlight along the top, a rim of light below. */}
          <span className="pointer-events-none absolute inset-x-[16px] top-[3px] h-[7px] rounded-full bg-gradient-to-b from-white/45 to-white/0" />
          <span className="pointer-events-none absolute inset-x-[24px] bottom-[2px] h-[2px] rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}

function Counter({
  label,
  every,
  tone,
  left,
  running,
}: {
  label: string;
  every: number;
  tone: { ink: string; glow: string };
  left: number | null;
  running: boolean;
}) {
  // The last thirty seconds before a mark, the counter calls for attention.
  const soon = running && left !== null && left <= 30000;
  return (
    <span className="flex items-end gap-[10px]">
      <span className="flex flex-col">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase" style={{ color: tone.ink }}>
          {label} · {every} min
        </span>
        <span
          className={`font-mono text-[44px] leading-none font-semibold tabular-nums md:text-[52px] ${soon ? "motion-safe:animate-pulse" : ""} ${running ? "" : "text-fg-faint/40"}`}
          style={{ color: running ? tone.ink : undefined, textShadow: soon ? `0 0 22px ${tone.glow}` : undefined }}
        >
          {running && left !== null ? twoDigit(left) : "--:--"}
        </span>
      </span>
    </span>
  );
}

function Tick({
  left,
  tone,
  passed,
  side,
}: {
  left: number;
  tone: { ink: string; glow: string };
  passed: boolean;
  side: "top" | "bottom";
}) {
  return (
    <span
      aria-hidden
      className={`absolute w-[3px] -translate-x-1/2 rounded-full ${side === "top" ? "top-[2px] h-[20px]" : "bottom-[2px] h-[20px]"}`}
      style={{
        left: `calc(4px + (100% - 8px) * ${left / 100})`,
        background: tone.ink,
        opacity: passed ? 0.35 : 1,
        boxShadow: passed ? undefined : `0 0 8px ${tone.glow}`,
      }}
    />
  );
}
