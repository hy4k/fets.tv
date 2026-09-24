"use client";

import { useMemo, useState } from "react";
import { RotationDialog } from "@/components/screens/DutyScreen";
import { useConsole } from "@/lib/console-data";
import { clockAt, todayInZone } from "@/lib/format";
import {
  countdown,
  dayBounds,
  handoverDue,
  minutesToShiftEnd,
  monitoringCsv,
  monitoringDay,
  type CheckKind,
  type Track,
  type Window,
} from "@/lib/monitoring";
import { useNow } from "@/lib/use-clock";

/** Which post each check belongs to. The floor post is kind "lab" in the database. */
const POST_KIND: Record<CheckKind, string> = { floor: "lab", dvr: "cctv" };

const COPY: Record<CheckKind, { title: string; action: string; done: string; toast: string }> = {
  floor: { title: "Floor walk", action: "Walked the floor", done: "Walked", toast: "Walk logged" },
  dvr: { title: "DVR", action: "Checked the DVR", done: "Checked", toast: "DVR check logged" },
};

/**
 * The floor walk and the DVR, on the exam's clock.
 *
 * Nothing to press in the morning. The moment the first candidate's exam
 * clock starts on Live exams, both ten-minute countdowns and the ninety-minute
 * shift start with it. Each ten minutes is a window in the log, done or
 * missed. The handover only appears when the ninety minutes are nearly up —
 * not for every post, all day — and one press moves everybody along and
 * starts the next shift's clocks.
 */
export function MonitoringScreen() {
  const { center, candidates, walkthroughs, dutyBlocks, dutyPosts, rules, rpc, canCall } =
    useConsole();
  const now = useNow();
  const live = now > 0;
  const [starting, setStarting] = useState(false);

  const { anchor, finishedAt } = useMemo(() => dayBounds(candidates), [candidates]);

  // Today's checks only, oldest first is not needed: the day sorts them.
  const checks = useMemo(
    () =>
      walkthroughs.map((w) => ({
        kind: w.kind ?? "floor",
        walked_at: w.walked_at,
        walked_by_name: w.walked_by_name,
        note: w.note,
      })),
    [walkthroughs],
  );

  const day = monitoringDay({
    anchor,
    finishedAt,
    now: live ? now : (anchor ?? 0),
    checks,
    walkMinutes: rules.walkthrough_minutes,
    shiftMinutes: rules.duty_block_minutes,
  });

  const posts = useMemo(
    () => dutyPosts.filter((p) => p.active).sort((a, b) => a.position - b.position),
    [dutyPosts],
  );
  const kindOf = useMemo(() => new Map(dutyPosts.map((p) => [p.id, p.kind])), [dutyPosts]);
  const open = posts
    .map((p) => ({ post: p, block: dutyBlocks.find((b) => b.post_id === p.id && !b.ended_at) }))
    .filter((x) => x.block && x.block.profile_id);

  const holder = (kind: CheckKind) =>
    open.find((x) => x.post.kind === POST_KIND[kind])?.block?.profile_name ?? null;

  // What "hand over" will do: each staffed post takes the person from the
  // staffed post before it, the first from the last — fets_rotate_duty's rule.
  const next = open.map((x, i) => ({
    post: x.post,
    from: x.block!.profile_name,
    to: open[(i - 1 + open.length) % open.length].block!.profile_name,
  }));

  // A rotation restarts every staffed post at once, so the oldest open block
  // says when everybody last moved. One post handed over on its own leaves
  // the others old, and does not count as the shift's handover.
  const lastRotation = open.length
    ? Math.min(...open.map((x) => new Date(x.block!.started_at).getTime()))
    : null;
  const handover = handoverDue({
    day,
    now,
    lastRotation,
    shiftMinutes: rules.duty_block_minutes,
  });

  const nobodyOn = !holder("floor") && !holder("dvr");

  function exportLog() {
    // The exam day's date, not today's: a log exported the next morning is
    // still the log of the day the clocks ran.
    const date = todayInZone(center.timezone, day.anchor !== null ? new Date(day.anchor) : new Date());
    const csv = monitoringCsv({
      day,
      date,
      timezone: center.timezone,
      blocks: dutyBlocks.map((b) => ({
        post_kind: kindOf.get(b.post_id) ?? "",
        profile_name: b.profile_name,
        started_at: b.started_at,
        ended_at: b.ended_at,
      })),
    });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `fets-monitoring-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[12px] overflow-y-auto">
      {/* The day's state, in one line. */}
      <div className="flex shrink-0 flex-wrap items-center gap-[12px] rounded-[18px] border border-edge-mid panel-bg px-[16px] py-[13px]">
        {day.anchor === null ? (
          <span className="flex items-center gap-[10px] text-[14px] text-fg-muted">
            <span className="h-[8px] w-[8px] rounded-full bg-fg-faint" />
            Waiting for the first exam. Both clocks start by themselves when the first
            candidate&rsquo;s exam starts.
          </span>
        ) : day.finishedAt !== null ? (
          <span className="flex items-center gap-[10px] text-[14px]">
            <span className="h-[8px] w-[8px] rounded-full bg-fg-dim" />
            Day finished at {clockAt(new Date(day.finishedAt).toISOString(), center.timezone)}.
            Started {clockAt(new Date(day.anchor).toISOString(), center.timezone)}.
          </span>
        ) : (
          <ShiftBar day={day} now={now} timezone={center.timezone} minutes={rules.duty_block_minutes} />
        )}

        <span className="min-w-[8px] flex-1" />

        <button
          type="button"
          disabled={!canCall}
          onClick={() => setStarting(true)}
          className="cursor-pointer rounded-[12px] border border-edge-warm px-[13px] py-[9px] text-[12.5px] font-semibold hover:bg-panel disabled:opacity-40"
        >
          {nobodyOn ? "Set who starts" : "Change who is on"}
        </button>
        <button
          type="button"
          disabled={day.anchor === null}
          onClick={exportLog}
          className="cursor-pointer rounded-[12px] gold-bg px-[14px] py-[9px] text-[12.5px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export log
        </button>
      </div>

      {day.anchor !== null && day.finishedAt === null && nobodyOn && (
        <div className="shrink-0 rounded-[15px] border-2 border-rust bg-rust/12 px-[15px] py-[12px] text-[14px] font-bold text-rust">
          The exam has started and nobody is on the floor or the DVR.{" "}
          <button
            type="button"
            disabled={!canCall}
            onClick={() => setStarting(true)}
            className="cursor-pointer underline underline-offset-2"
          >
            Set who starts
          </button>
        </div>
      )}

      {handover.due && handover.boundary !== null && (
        <div className="flex shrink-0 flex-wrap items-center gap-[12px] rounded-[18px] border-2 border-gold/70 bg-gold/10 px-[16px] py-[13px]">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-gold-bright">
              {handover.boundary > now
                ? `Shift ${day.shift!.n} ends in ${countdown(handover.boundary - now)} — hand over`
                : `Shift ended ${countdown(handover.boundary - now).slice(1)} ago — hand over`}
            </span>
            <span className="mt-[4px] flex flex-wrap gap-x-[14px] gap-y-[2px] text-[12.5px] text-fg-muted">
              {next.map((x) => (
                <span key={x.post.id}>
                  <span className="text-fg">{x.post.name}</span>: {x.from} →{" "}
                  <span className="font-semibold text-fg">{x.to}</span>
                </span>
              ))}
            </span>
          </span>
          <button
            type="button"
            disabled={!canCall || next.length < 2}
            onClick={() =>
              rpc(
                "fets_rotate_duty",
                { p_center: center.id, p_minutes: handover.minutes },
                "Handed over. The next shift's clocks have started.",
              )
            }
            className="cursor-pointer rounded-[13px] gold-bg px-[18px] py-[12px] text-[14px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Hand over now
          </button>
        </div>
      )}

      <div className="grid shrink-0 gap-[12px] lg:grid-cols-2">
        {(["floor", "dvr"] as const).map((kind) => (
          <TrackCard
            key={kind}
            kind={kind}
            track={day[kind]}
            holder={holder(kind)}
            now={now}
            timezone={center.timezone}
            walkMinutes={rules.walkthrough_minutes}
            may={canCall}
            onCheck={(note) =>
              rpc(
                "fets_record_walkthrough",
                { p_center: center.id, p_note: note || null, p_kind: kind },
                COPY[kind].toast,
              )
            }
          />
        ))}
      </div>

      {day.anchor !== null && <Log day={day} timezone={center.timezone} />}

      {starting && (
        <RotationDialog
          onClose={() => setStarting(false)}
          minutes={day.anchor !== null && day.finishedAt === null ? minutesToShiftEnd(day, now) : null}
        />
      )}
    </div>
  );
}

function ShiftBar({
  day,
  now,
  timezone,
  minutes,
}: {
  day: ReturnType<typeof monitoringDay>;
  now: number;
  timezone: string;
  minutes: number;
}) {
  const s = day.shift!;
  const done = Math.min(1, Math.max(0, (now - s.start) / (s.end - s.start)));
  const left = s.end - now;
  return (
    <span className="flex min-w-[260px] flex-1 items-center gap-[14px]">
      <span className="shrink-0">
        <span className="block font-mono text-[10px] font-bold tracking-[0.14em] text-fg-dim uppercase">
          Shift {s.n} · {clockAt(new Date(s.start).toISOString(), timezone)}–
          {clockAt(new Date(s.end).toISOString(), timezone)}
        </span>
        <span
          className={`block font-mono text-[26px] leading-tight font-semibold tabular-nums ${
            left <= 5 * 60000 ? "text-gold-bright" : "text-fg"
          }`}
        >
          {countdown(left)}
        </span>
      </span>
      <span className="h-[8px] min-w-[80px] flex-1 overflow-hidden rounded-full bg-panel-soft">
        <span className="block h-full rounded-full gold-bg" style={{ width: `${done * 100}%` }} />
      </span>
      <span className="shrink-0 font-mono text-[11px] text-fg-faint">of {minutes} min</span>
    </span>
  );
}

function TrackCard({
  kind,
  track,
  holder,
  now,
  timezone,
  walkMinutes,
  may,
  onCheck,
}: {
  kind: CheckKind;
  track: Track;
  holder: string | null;
  now: number;
  timezone: string;
  walkMinutes: number;
  may: boolean;
  onCheck: (note: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const w = track.current;
  const copy = COPY[kind];

  const left = w ? w.end - now : 0;
  const done = w?.status === "done";
  const tone = !w
    ? "border-edge-mid panel-bg"
    : done
      ? "border-mint/40 bg-mint/6"
      : left <= 2 * 60000
        ? "border-gold/60 bg-gold/10"
        : "border-edge-mid panel-bg";
  const ring = !w ? 0 : Math.min(1, Math.max(0, left / (walkMinutes * 60000)));

  const inShift = w ? track.windows.filter((x) => x.shift === w.shift) : [];
  const shiftDone = inShift.filter((x) => x.status === "done").length;

  return (
    <div className={`flex flex-col gap-[14px] rounded-[20px] border-2 p-[16px] ${tone}`}>
      <div className="flex items-baseline gap-[10px]">
        <span className="font-serif text-[22px] leading-none">{copy.title}</span>
        <span className="min-w-0 flex-1 truncate text-right text-[13px] text-fg-muted">
          {holder ? (
            <>
              On now: <span className="font-semibold text-fg">{holder}</span>
            </>
          ) : (
            "Nobody on this post"
          )}
        </span>
      </div>

      <div className="flex items-center gap-[18px]">
        <Ring value={ring} done={done} urgent={!!w && !done && left <= 2 * 60000}>
          <span className="font-mono text-[26px] font-semibold tabular-nums">
            {w ? countdown(left) : "—"}
          </span>
          <span className="font-mono text-[10px] text-fg-faint">
            {w ? `of ${walkMinutes}:00` : "not started"}
          </span>
        </Ring>

        <div className="min-w-0 flex-1">
          {w ? (
            <>
              <span className="block font-mono text-[11px] text-fg-dim">
                Window {clockAt(new Date(w.start).toISOString(), timezone)}–
                {clockAt(new Date(w.end).toISOString(), timezone)}
              </span>
              <span className={`mt-[4px] block text-[15px] font-semibold ${done ? "text-mint" : ""}`}>
                {done
                  ? `${copy.done} at ${clockAt(w.checks[0].walked_at, timezone)} by ${w.checks[0].walked_by_name}`
                  : "Due in this window"}
              </span>
              <span className="mt-[4px] block font-mono text-[11px] text-fg-faint">
                {shiftDone} of {inShift.length} done this shift
              </span>
            </>
          ) : (
            <span className="text-[13px] text-fg-muted">
              Starts with the first exam clock.
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-[8px]">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Anything seen (optional)"
          disabled={!w || !may}
          className="min-w-0 flex-1 rounded-[12px] border border-edge bg-panel-soft px-[12px] py-[10px] text-[13px] placeholder:text-fg-faint disabled:opacity-40"
        />
        <button
          type="button"
          disabled={!w || busy || !may}
          onClick={async () => {
            setBusy(true);
            const ok = await onCheck(note.trim());
            setBusy(false);
            if (ok) setNote("");
          }}
          className={`shrink-0 cursor-pointer rounded-[12px] px-[16px] py-[10px] text-[13.5px] font-bold disabled:cursor-not-allowed disabled:opacity-40 ${
            done ? "border border-edge-warm text-fg-muted" : "gold-bg text-[#1a1512]"
          }`}
        >
          {done ? "Log another" : copy.action}
        </button>
      </div>
    </div>
  );
}

function Ring({
  value,
  done,
  urgent,
  children,
}: {
  value: number;
  done: boolean;
  urgent: boolean;
  children: React.ReactNode;
}) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const stroke = done ? "var(--color-mint)" : urgent ? "var(--color-gold-bright)" : "var(--color-gold)";
  return (
    <span className="relative flex h-[124px] w-[124px] shrink-0 items-center justify-center">
      <svg viewBox="0 0 124 124" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="62" cy="62" r={R} fill="none" stroke="currentColor" strokeWidth="7" className="text-panel-soft" />
        <circle
          cx="62"
          cy="62"
          r={R}
          fill="none"
          stroke={stroke}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - value)}
        />
      </svg>
      <span className="relative flex flex-col items-center">{children}</span>
    </span>
  );
}

/** The day's windows, newest first, both tracks side by side, grouped by shift. */
function Log({ day, timezone }: { day: ReturnType<typeof monitoringDay>; timezone: string }) {
  const rows = day.floor.windows.map((w, i) => ({ floor: w, dvr: day.dvr.windows[i] })).reverse();
  const shifts = [...new Set(rows.map((r) => r.floor.shift))];

  return (
    <div className="shrink-0 rounded-[20px] border border-edge-mid panel-bg">
      <div className="flex items-center gap-[10px] border-b border-edge-soft px-[16px] py-[11px]">
        <span className="text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">Today&rsquo;s log</span>
        <span className="h-px flex-1 bg-edge-soft" />
        <span className="font-mono text-[11px] text-fg-faint">
          {day.floor.windows.filter((w) => w.status === "done").length} walks ·{" "}
          {day.dvr.windows.filter((w) => w.status === "done").length} DVR checks ·{" "}
          {day.floor.windows.filter((w) => w.status === "missed").length +
            day.dvr.windows.filter((w) => w.status === "missed").length}{" "}
          missed
        </span>
      </div>
      <div className="grid grid-cols-[92px_1fr_1fr] gap-[10px] border-b border-edge-soft px-[16px] py-[7px] font-mono text-[10px] font-bold tracking-[0.1em] text-fg-faint uppercase">
        <span>Window</span>
        <span>Floor walk</span>
        <span>DVR</span>
      </div>
      {shifts.map((n) => (
        <div key={n}>
          <div className="bg-panel-soft/60 px-[16px] py-[6px] font-mono text-[10.5px] font-bold tracking-[0.12em] text-gold uppercase">
            Shift {n}
          </div>
          {rows
            .filter((r) => r.floor.shift === n)
            .map((r) => (
              <div
                key={r.floor.n}
                className="grid grid-cols-[92px_1fr_1fr] items-center gap-[10px] border-b border-edge-soft px-[16px] py-[8px] last:border-b-0"
              >
                <span className="font-mono text-[12px] text-fg-dim tabular-nums">
                  {clockAt(new Date(r.floor.start).toISOString(), timezone)}–
                  {clockAt(new Date(r.floor.end).toISOString(), timezone)}
                </span>
                <LogCell w={r.floor} timezone={timezone} />
                <LogCell w={r.dvr} timezone={timezone} />
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

function LogCell({ w, timezone }: { w: Window; timezone: string }) {
  if (w.status === "open") return <span className="font-mono text-[11.5px] text-gold">due now</span>;
  if (w.status === "missed") return <span className="font-mono text-[11.5px] text-rust">missed</span>;
  return (
    <span className="min-w-0 truncate text-[12.5px]">
      <span className="text-mint">✓ {clockAt(w.checks[0].walked_at, timezone)}</span>{" "}
      <span className="text-fg-muted">{w.checks.map((c) => c.walked_by_name).join(", ")}</span>
      {w.checks.some((c) => c.note) && (
        <span className="text-fg-faint"> · {w.checks.map((c) => c.note).filter(Boolean).join("; ")}</span>
      )}
    </span>
  );
}
