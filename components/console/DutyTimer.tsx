"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { basePath } from "@/lib/base-path";
import { useConsole } from "@/lib/console-data";
import {
  DVR_MINUTES,
  WALK_MINUTES,
  dutyLogCsv,
  dutySpan,
  markRows,
  nextMark,
  rotaOwnerAt,
  twoDigit,
  type DutyKind,
  type DutyRota,
  type MarkRow,
} from "@/lib/duty-timer";
import { clockAt, todayInZone } from "@/lib/format";
import { useNow } from "@/lib/use-clock";

const TONE: Record<DutyKind, { ink: string; glow: string; label: string; every: number; verb: string }> = {
  floor: { ink: "oklch(0.88 0.13 85)", glow: "oklch(0.85 0.14 85 / 0.75)", label: "Floor walk", every: WALK_MINUTES, verb: "Walked" },
  dvr: { ink: "oklch(0.86 0.12 205)", glow: "oklch(0.8 0.14 205 / 0.75)", label: "DVR check", every: DVR_MINUTES, verb: "Checked" },
};

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

/**
 * The Lab's duty rail: the floor walk and the DVR check side by side, one line
 * high, so the floor plan below keeps the page.
 *
 * Each card counts down to its next mark and names who the fets.live rota has
 * on duty for it. Whoever does the walk or the check presses the card's button
 * and it is recorded under their own name. A mark nobody answered turns the
 * card red until somebody checks again; the log keeps every mark of the day —
 * due, who was on the rota, who checked and when — and exports the sheet.
 */
export function DutyTimer() {
  const { candidates, walkthroughs, center, session, rpc, canLab, notify } = useConsole();
  const now = useNow();
  const date = session?.exam_date ?? todayInZone(center.timezone);
  const [rota, setRota] = useState<DutyRota | null>(null);
  const [rotaReason, setRotaReason] = useState<string | null>(null);
  const [busy, setBusy] = useState<DutyKind | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  // Stable: this rail redraws every second, and the log would otherwise grab focus each time.
  const closeLog = useCallback(() => setLogOpen(false), []);

  // The rota changes a few times a day at most: read on arrival and every ten minutes.
  useEffect(() => {
    let live = true;
    const read = () =>
      void loadRota(date).then(({ rota: r, reason }) => {
        if (!live) return;
        setRota(r);
        setRotaReason(r ? null : (reason ?? null));
      });
    read();
    const every = window.setInterval(read, 10 * 60_000);
    return () => {
      live = false;
      window.clearInterval(every);
    };
  }, [date]);

  if (now === 0) return null;

  const { start, end } = dutySpan(candidates);
  const running = start !== null && end !== null;
  const rows = (kind: DutyKind) => (running ? markRows(kind, start, end, now, walkthroughs) : []);
  const floor = rows("floor");
  const dvr = rows("dvr");
  const missed = [...floor, ...dvr].filter((r) => r.state === "missed").length;

  async function mark(kind: DutyKind) {
    setBusy(kind);
    await rpc(
      "fets_record_walkthrough",
      { p_center: center.id, p_kind: kind },
      kind === "floor" ? "Floor walk recorded" : "DVR check recorded",
    );
    setBusy(null);
  }

  return (
    <div className="flex w-full basis-full flex-col gap-[8px]">
      <div className="grid grid-cols-1 gap-[10px] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        {(["floor", "dvr"] as const).map((kind) => (
          <DutyCard
            key={kind}
            kind={kind}
            rows={kind === "floor" ? floor : dvr}
            next={running ? nextMark(start, end, TONE[kind].every, now) : null}
            running={running && now < end}
            timezone={center.timezone}
            owner={rota && running ? (nextOwner(rota, kind, start, end, now) ?? "") : ""}
            busy={busy === kind}
            canMark={canLab}
            onMark={() => void mark(kind)}
          />
        ))}
        <div className="flex items-center gap-[10px] md:flex-col md:items-end md:justify-center">
          <span className="font-mono text-[11px] text-fg-dim">
            {!running
              ? "Starts with the first exam"
              : now >= end
                ? `Done · ended ${clockAt(new Date(end).toISOString(), center.timezone)}`
                : `Until ${clockAt(new Date(end).toISOString(), center.timezone)}`}
          </span>
          <button
            type="button"
            onClick={() => setLogOpen(true)}
            className="cursor-pointer rounded-[12px] border border-accent/30 bg-ink/50 px-[14px] py-[8px] text-[12.5px] font-semibold text-fg-muted hover:text-fg"
          >
            Log{missed > 0 && <span className="ml-[6px] rounded-full bg-rust/25 px-[7px] font-mono text-[11px] text-rust">{missed} missed</span>}
          </button>
        </div>
      </div>

      <DutyLog
        open={logOpen}
        onClose={closeLog}
        rows={[...floor, ...dvr].sort((a, b) => b.at - a.at)}
        rota={rota}
        rotaReason={rotaReason}
        timezone={center.timezone}
        onExport={() => {
          if (!rota && rotaReason) notify(`Exported without rota names: ${rotaReason}`);
          const csv = dutyLogCsv({ start, end, checks: walkthroughs, date, timezone: center.timezone, rota });
          const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
          const a = document.createElement("a");
          a.href = url;
          a.download = `fets-duty-log-${date}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }}
        canExport={running}
      />
    </div>
  );
}

/** Who the rota has on the next mark of a track. */
function nextOwner(rota: DutyRota, kind: DutyKind, start: number, end: number, now: number) {
  const next = nextMark(start, end, TONE[kind].every, now);
  return next ? rotaOwnerAt(rota, kind, next.at) : null;
}

function DutyCard({
  kind,
  rows,
  next,
  running,
  timezone,
  owner,
  busy,
  canMark,
  onMark,
}: {
  kind: DutyKind;
  rows: MarkRow[];
  next: { at: number; left: number } | null;
  running: boolean;
  timezone: string;
  owner: string;
  busy: boolean;
  canMark: boolean;
  onMark: () => void;
}) {
  const tone = TONE[kind];
  const step = tone.every * 60000;
  const share = running && next ? Math.min(1, Math.max(0, 1 - next.left / step)) : 0;
  const soon = running && next !== null && next.left <= 30000;

  // The latest mark already due or passed decides the card's colour; a later
  // check of any kind clears a miss from the card (the log still keeps it).
  const passed = rows.filter((r) => r.state !== "ahead");
  const last = passed[passed.length - 1] ?? null;
  const lastCheck = rows.map((r) => r.check).filter(Boolean).pop() ?? null;
  const missedOpen = last?.state === "missed" && !(lastCheck && new Date(lastCheck.walked_at).getTime() > last.at);
  const due = last?.state === "due";
  const at = (ms: number) => clockAt(new Date(ms).toISOString(), timezone);

  const status = missedOpen
    ? { text: `Missed ${at(last!.at)}`, cls: "border-rust/60 bg-rust/15 text-rust" }
    : due
      ? { text: `Due now · ${at(last!.at)}`, cls: "border-gold/60 bg-gold/15 text-gold-bright" }
      : lastCheck
        ? {
            text: `✓ ${at(new Date(lastCheck.walked_at).getTime())} · ${lastCheck.walked_by_name.split(/\s+/)[0]}`,
            cls: "border-mint/40 bg-mint/10 text-mint",
          }
        : null;

  const C = 2 * Math.PI * 18;
  return (
    <div
      style={{ borderColor: missedOpen ? undefined : `color-mix(in oklab, ${tone.ink} 30%, transparent)` }}
      className={`flex min-w-0 items-center gap-[12px] rounded-[18px] border bg-ink/45 px-[12px] py-[9px] ${missedOpen ? "border-rust/60" : ""}`}
    >
      <span className="relative h-[44px] w-[44px] shrink-0">
        <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke={tone.ink}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${C * share} ${C}`}
            style={{ filter: soon ? `drop-shadow(0 0 6px ${tone.glow})` : undefined }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-bold" style={{ color: tone.ink }}>
          {tone.every}′
        </span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase" style={{ color: tone.ink }}>
          {tone.label}
        </span>
        <span className="flex items-baseline gap-[8px]">
          <span
            className={`font-mono text-[24px] leading-none font-semibold tabular-nums ${soon ? "motion-safe:animate-pulse" : ""} ${running ? "" : "text-fg-faint/50"}`}
            style={{ color: running ? tone.ink : undefined, textShadow: soon ? `0 0 16px ${tone.glow}` : undefined }}
          >
            {running && next ? twoDigit(next.left) : "--:--"}
          </span>
          <span className="truncate text-[11.5px] text-fg-dim">
            {running && next ? `next ${at(next.at)}${owner ? ` · ${owner}` : ""}` : ""}
          </span>
        </span>
        {status && (
          <span className={`mt-[4px] self-start rounded-full border px-[8px] py-[1px] text-[10.5px] font-bold ${status.cls}`}>
            {status.text}
          </span>
        )}
      </span>

      <button
        type="button"
        disabled={!canMark || busy}
        onClick={onMark}
        style={{ background: `linear-gradient(145deg, ${tone.ink}, color-mix(in oklab, ${tone.ink} 70%, black))` }}
        className="min-h-[42px] shrink-0 cursor-pointer rounded-[13px] px-[14px] text-[13px] font-bold text-[#111015] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "…" : `✓ ${tone.verb}`}
      </button>
    </div>
  );
}

const STATE: Record<MarkRow["state"], { label: string; cls: string }> = {
  done: { label: "Done", cls: "bg-mint/15 text-mint" },
  due: { label: "Due now", cls: "bg-gold/15 text-gold-bright" },
  missed: { label: "Missed", cls: "bg-rust/20 text-rust" },
  ahead: { label: "Coming", cls: "bg-panel-soft text-fg-faint" },
};

/** Every mark of the day so far, newest first, with who was on the rota and who checked. */
function DutyLog({
  open,
  onClose,
  rows,
  rota,
  rotaReason,
  timezone,
  onExport,
  canExport,
}: {
  open: boolean;
  onClose: () => void;
  rows: MarkRow[];
  rota: DutyRota | null;
  rotaReason: string | null;
  timezone: string;
  onExport: () => void;
  canExport: boolean;
}) {
  const at = (ms: number) => clockAt(new Date(ms).toISOString(), timezone);
  const missed = rows.filter((r) => r.state === "missed").length;
  const done = rows.filter((r) => r.state === "done").length;
  return (
    <Dialog
      open={open}
      title="Duty log · today"
      subtitle={`${done} done · ${missed} missed · floor walk every ${WALK_MINUTES} min, DVR every ${DVR_MINUTES} min`}
      onClose={onClose}
      width={760}
      footer={
        <>
          <span className="flex-1 text-[11.5px] text-fg-faint">
            {rota ? "On-duty names come from the fets.live rota." : rotaReason ? `No rota names: ${rotaReason}` : "Reading the rota…"}
          </span>
          <button
            type="button"
            disabled={!canExport}
            onClick={onExport}
            className="cursor-pointer rounded-[13px] border border-edge-warm px-[16px] py-[11px] text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            Export the day’s sheet
          </button>
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="py-[20px] text-center text-[13px] text-fg-faint">No marks yet. They start with the first exam.</p>
      ) : (
        <div className="flex flex-col">
          <div className="hidden grid-cols-[80px_110px_1fr_1fr_86px] gap-[10px] border-b border-edge-soft pb-[8px] text-[11px] font-semibold text-fg-dim md:grid">
            <span>Due</span>
            <span>Track</span>
            <span>On the rota</span>
            <span>Checked by</span>
            <span>State</span>
          </div>
          {rows.map((r) => (
            <div
              key={`${r.kind}-${r.n}`}
              className="grid grid-cols-[70px_1fr_auto] items-center gap-[10px] border-b border-edge-soft/60 py-[8px] md:grid-cols-[80px_110px_1fr_1fr_86px]"
            >
              <span className="font-mono text-[12.5px] font-semibold">{at(r.at)}</span>
              <span className="text-[12.5px]" style={{ color: TONE[r.kind].ink }}>
                {TONE[r.kind].label}
              </span>
              <span className="hidden truncate text-[12.5px] text-fg-muted md:block">{rota ? rotaOwnerAt(rota, r.kind, r.at) || "—" : "—"}</span>
              <span className="hidden truncate text-[12.5px] md:block">
                {r.check ? `${r.check.walked_by_name} · ${at(new Date(r.check.walked_at).getTime())}` : "—"}
              </span>
              <span className={`justify-self-start rounded-full px-[8px] py-[2px] text-[11px] font-bold ${STATE[r.state].cls}`}>
                {STATE[r.state].label}
              </span>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
