"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { slotKey, useSharedChecks } from "@/components/console/SharedShiftChecks";
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
import { canRecord, checkRail, checkStatus, dueAt, sharedLogCsv, type CheckSnapshot, type SharedCheck } from "@/lib/shift-checks";
import { useNow } from "@/lib/use-clock";

const TONE: Record<DutyKind, { ink: string; glow: string; label: string; every: number; verb: string }> = {
  floor: { ink: "oklch(0.88 0.13 85)", glow: "oklch(0.85 0.14 85 / 0.75)", label: "Floor walk", every: WALK_MINUTES, verb: "Walked" },
  dvr: { ink: "oklch(0.86 0.12 205)", glow: "oklch(0.8 0.14 205 / 0.75)", label: "DVR check", every: DVR_MINUTES, verb: "Checked" },
};

/** The Shift calls the floor walk a "walk". */
const TRACK: Record<SharedCheck["kind"], DutyKind> = { walk: "floor", dvr: "dvr" };

const PILL = {
  missed: "border-rust/60 bg-rust/15 text-rust",
  due: "border-gold/60 bg-gold/15 text-gold-bright",
  done: "border-mint/40 bg-mint/10 text-mint",
  quiet: "border-edge-soft bg-panel-soft text-fg-faint",
};

type Status = { text: string; cls: string } | null;

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

function saveCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The Lab's duty rail: the floor walk and the DVR check side by side, one line
 * high, so the floor plan below keeps the page.
 *
 * When The Shift on fets.live has published today's staff plan, the rail runs
 * from it: each card counts down to the plan's next check and names who is
 * assigned, and only that person (or their named break cover) can press it.
 * The press is saved in The Shift, so both sites keep the one record.
 *
 * With no plan published, or fets.live out of reach, the rail runs on its own
 * from the first exam start, names whoever the fets.live rota has on duty, and
 * saves here only. Either way a check nobody answered turns the card red, and
 * the log keeps every check of the day and exports the sheet.
 */
export function DutyTimer() {
  const { center } = useConsole();
  const now = useNow();
  if (now === 0) return null;
  // The centre's own day: midnight starts a fresh rail even with an exam import open.
  const date = todayInZone(center.timezone, new Date(now));
  return <DutyRail key={`${center.id}:${date}`} date={date} />;
}

function DutyRail({ date }: { date: string }) {
  const { notify } = useConsole();
  const shared = useSharedChecks(date, (message) => notify(message));
  // Once a plan has loaded it stays in charge: a failed refresh pauses recording, it never falls back.
  if (shared.snapshot?.plan) return <SharedRail shared={shared} />;
  if (!shared.snapshot && !shared.error) {
    return (
      <p role="status" className="basis-full font-mono text-[11px] text-fg-dim">
        Reading today’s staff plan…
      </p>
    );
  }
  return <LocalRail reason={shared.snapshot?.reason || shared.error} />;
}

/** The rail on The Shift's published plan: its times, its names, its record. */
function SharedRail({ shared }: { shared: ReturnType<typeof useSharedChecks> }) {
  const { center } = useConsole();
  const { error, busy, now, load, record } = shared;
  const snapshot = shared.snapshot as CheckSnapshot & { plan: NonNullable<CheckSnapshot["plan"]> };
  const [logOpen, setLogOpen] = useState(false);
  const closeLog = useCallback(() => setLogOpen(false), []);

  const at = (due: number) => dueAt(snapshot.plan.day, due);
  const time = (ms: number) => clockAt(new Date(ms).toISOString(), center.timezone);
  const checks = [...(snapshot.checks ?? [])].sort((a, b) => a.due - b.due);
  const missed = checks.filter((c) => checkStatus(snapshot, c, now) === "missed").length;
  const last = checks.length ? at(checks[checks.length - 1].due) : null;

  const rows: LogRow[] = checks
    .filter((c) => checkStatus(snapshot, c, now) !== "upcoming")
    .reverse()
    .map((c) => {
      const state = checkStatus(snapshot, c, now);
      return {
        key: slotKey(c),
        at: at(c.due),
        kind: TRACK[c.kind],
        onDuty: c.owner_name ?? "",
        checkedBy: c.event
          ? `${c.event.actor_name || "Staff"} · ${time(Date.parse(c.event.created_at))}${c.event.note ? ` · ${c.event.note}` : ""}`
          : "",
        state: state === "recorded" ? "done" : state === "due" || state === "missed" || state === "closed" ? state : "untracked",
      };
    });

  return (
    <div className="flex w-full basis-full flex-col gap-[8px]">
      <div className="grid grid-cols-1 gap-[10px] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        {(["walk", "dvr"] as const).map((kind) => {
          const track = TRACK[kind];
          const { current, next } = checkRail(snapshot, kind, now);
          const state = current ? checkStatus(snapshot, current, now) : null;
          const can = !!current && canRecord(snapshot, current, now) && !error && !busy;
          const from = current ? at(current.due) : next ? at(next.due) - TONE[track].every * 60000 : now;
          const status: Status =
            current?.event
              ? { text: `✓ ${time(Date.parse(current.event.created_at))} · ${(current.event.actor_name || "Staff").split(/\s+/)[0]}`, cls: PILL.done }
              : state === "due"
                ? { text: `Due now · ${time(at(current!.due))}`, cls: PILL.due }
                : state === "missed"
                  ? { text: `Missed ${time(at(current!.due))}`, cls: PILL.missed }
                  : state === "closed"
                    ? { text: "Shift closed", cls: PILL.quiet }
                    : null;
          const hint =
            state !== "due" || can
              ? ""
              : error
                ? "Paused until the plan refreshes"
                : !snapshot.viewer_rostered
                  ? "Your shift today does not cover this centre"
                  : !current!.owner_id
                    ? "Nobody assigned · ask the lead"
                    : current!.owner_id !== snapshot.viewer_id
                      ? `${current!.owner_name || "The assigned person"} records this one`
                      : "";
          return (
            <DutyCard
              key={kind}
              kind={track}
              next={next ? { at: at(next.due), left: at(next.due) - now } : null}
              step={next ? at(next.due) - from : TONE[track].every * 60000}
              running={next !== null}
              timezone={center.timezone}
              owner={next?.owner_name ?? ""}
              status={status}
              hint={hint}
              busy={!!current && busy === slotKey(current)}
              canMark={can}
              onMark={() => current && void record(current)}
            />
          );
        })}
        <div className="flex items-center gap-[10px] md:flex-col md:items-end md:justify-center">
          <span className="font-mono text-[11px] text-fg-dim">
            {last === null ? "No checks in today’s plan" : now >= last ? `Done · last ${time(last)}` : `Until ${time(last)}`}
          </span>
          <span className="text-[10.5px] text-mint/80">Shared with The Shift</span>
          <button
            type="button"
            onClick={() => setLogOpen(true)}
            className="cursor-pointer rounded-[12px] border border-accent/30 bg-ink/50 px-[14px] py-[8px] text-[12.5px] font-semibold text-fg-muted hover:text-fg"
          >
            Log{missed > 0 && <span className="ml-[6px] rounded-full bg-rust/25 px-[7px] font-mono text-[11px] text-rust">{missed} missed</span>}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[11.5px] text-rust">
          {error} Recording is paused until the plan refreshes.{" "}
          <button type="button" onClick={() => void load()} className="cursor-pointer font-semibold underline">
            Try again
          </button>
        </p>
      )}

      <DutyLog
        open={logOpen}
        onClose={closeLog}
        rows={rows}
        onDutyLabel="Assigned"
        timezone={center.timezone}
        footer="Times and names come from the plan published in The Shift. Each check is saved once and shown in both sites."
        onExport={() => saveCsv(`fets-shared-checks-${snapshot.plan.branch}-${snapshot.plan.day}.csv`, sharedLogCsv(snapshot, now))}
        canExport={!error}
      />
    </div>
  );
}

/** The rail on its own, with no plan published: marks from the first exam start, saved here only. */
function LocalRail({ reason }: { reason?: string }) {
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
  const time = (ms: number) => clockAt(new Date(ms).toISOString(), center.timezone);

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
            next={running ? nextMark(start, end, TONE[kind].every, now) : null}
            step={TONE[kind].every * 60000}
            running={running && now < end}
            timezone={center.timezone}
            owner={rota && running ? (nextOwner(rota, kind, start, end, now) ?? "") : ""}
            status={localStatus(kind === "floor" ? floor : dvr, time)}
            busy={busy === kind}
            canMark={canLab}
            onMark={() => void mark(kind)}
          />
        ))}
        <div className="flex items-center gap-[10px] md:flex-col md:items-end md:justify-center">
          <span className="font-mono text-[11px] text-fg-dim">
            {!running ? "Starts with the first exam" : now >= end ? `Done · ended ${time(end)}` : `Until ${time(end)}`}
          </span>
          <span className="max-w-[220px] text-right text-[10.5px] text-fg-faint" title={reason}>
            Saved in FETS Online only
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
      {reason && <p className="text-[11px] text-fg-faint">Not linked to The Shift today: {reason}</p>}

      <DutyLog
        open={logOpen}
        onClose={closeLog}
        rows={[...floor, ...dvr]
          .sort((a, b) => b.at - a.at)
          .map((r) => ({
            key: `${r.kind}-${r.n}`,
            at: r.at,
            kind: r.kind,
            onDuty: rota ? rotaOwnerAt(rota, r.kind, r.at) : "",
            checkedBy: r.check ? `${r.check.walked_by_name} · ${time(new Date(r.check.walked_at).getTime())}` : "",
            state: r.state,
          }))}
        onDutyLabel="On the rota"
        timezone={center.timezone}
        footer={rota ? "On-duty names come from the fets.live rota." : rotaReason ? `No rota names: ${rotaReason}` : "Reading the rota…"}
        onExport={() => {
          if (!rota && rotaReason) notify(`Exported without rota names: ${rotaReason}`);
          saveCsv(`fets-duty-log-${date}.csv`, dutyLogCsv({ start, end, checks: walkthroughs, date, timezone: center.timezone, rota }));
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

/**
 * The latest mark already due or passed decides the card's colour; a later
 * check of any kind clears a miss from the card (the log still keeps it).
 */
function localStatus(rows: MarkRow[], time: (ms: number) => string): Status {
  const passed = rows.filter((r) => r.state !== "ahead");
  const last = passed[passed.length - 1] ?? null;
  const lastCheck = rows.map((r) => r.check).filter(Boolean).pop() ?? null;
  const missedOpen = last?.state === "missed" && !(lastCheck && new Date(lastCheck.walked_at).getTime() > last.at);
  if (missedOpen) return { text: `Missed ${time(last!.at)}`, cls: PILL.missed };
  if (last?.state === "due") return { text: `Due now · ${time(last.at)}`, cls: PILL.due };
  if (lastCheck) {
    return { text: `✓ ${time(new Date(lastCheck.walked_at).getTime())} · ${lastCheck.walked_by_name.split(/\s+/)[0]}`, cls: PILL.done };
  }
  return null;
}

function DutyCard({
  kind,
  next,
  step,
  running,
  timezone,
  owner,
  status,
  hint,
  busy,
  canMark,
  onMark,
}: {
  kind: DutyKind;
  next: { at: number; left: number } | null;
  /** The ring fills over this many ms before the next check. */
  step: number;
  running: boolean;
  timezone: string;
  owner: string;
  status: Status;
  hint?: string;
  busy: boolean;
  canMark: boolean;
  onMark: () => void;
}) {
  const tone = TONE[kind];
  const share = running && next && step > 0 ? Math.min(1, Math.max(0, 1 - next.left / step)) : 0;
  const soon = running && next !== null && next.left <= 30000;
  const missed = status?.cls === PILL.missed;
  const at = (ms: number) => clockAt(new Date(ms).toISOString(), timezone);

  const C = 2 * Math.PI * 18;
  return (
    <div
      style={{ borderColor: missed ? undefined : `color-mix(in oklab, ${tone.ink} 30%, transparent)` }}
      className={`flex min-w-0 items-center gap-[12px] rounded-[18px] border bg-ink/45 px-[12px] py-[9px] ${missed ? "border-rust/60" : ""}`}
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
        {hint && <span className="mt-[3px] truncate text-[10.5px] text-fg-faint">{hint}</span>}
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

const STATE = {
  done: { label: "Done", cls: "bg-mint/15 text-mint" },
  due: { label: "Due now", cls: "bg-gold/15 text-gold-bright" },
  missed: { label: "Missed", cls: "bg-rust/20 text-rust" },
  ahead: { label: "Coming", cls: "bg-panel-soft text-fg-faint" },
  closed: { label: "Closed", cls: "bg-panel-soft text-fg-faint" },
  untracked: { label: "Not counted", cls: "bg-panel-soft text-fg-faint" },
} as const;

type LogRow = { key: string; at: number; kind: DutyKind; onDuty: string; checkedBy: string; state: keyof typeof STATE };

/** Every check of the day so far, newest first, with who was on duty and who checked. */
function DutyLog({
  open,
  onClose,
  rows,
  onDutyLabel,
  timezone,
  footer,
  onExport,
  canExport,
}: {
  open: boolean;
  onClose: () => void;
  rows: LogRow[];
  onDutyLabel: string;
  timezone: string;
  footer: string;
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
          <span className="flex-1 text-[11.5px] text-fg-faint">{footer}</span>
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
        <p className="py-[20px] text-center text-[13px] text-fg-faint">No checks due yet.</p>
      ) : (
        <div className="flex flex-col">
          <div className="hidden grid-cols-[80px_110px_1fr_1fr_86px] gap-[10px] border-b border-edge-soft pb-[8px] text-[11px] font-semibold text-fg-dim md:grid">
            <span>Due</span>
            <span>Track</span>
            <span>{onDutyLabel}</span>
            <span>Checked by</span>
            <span>State</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.key}
              className="grid grid-cols-[70px_1fr_auto] items-center gap-[10px] border-b border-edge-soft/60 py-[8px] md:grid-cols-[80px_110px_1fr_1fr_86px]"
            >
              <span className="font-mono text-[12.5px] font-semibold">{at(r.at)}</span>
              <span className="text-[12.5px]" style={{ color: TONE[r.kind].ink }}>
                {TONE[r.kind].label}
              </span>
              <span className="hidden truncate text-[12.5px] text-fg-muted md:block">{r.onDuty || "—"}</span>
              <span className="hidden truncate text-[12.5px] md:block">{r.checkedBy || "—"}</span>
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
