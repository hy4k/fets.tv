"use client";

import { useState } from "react";
import { useConsole } from "@/lib/console-data";
import { clockAt, fullName, instantFromZonedTime, nowInZone } from "@/lib/format";
import { useNow } from "@/lib/use-clock";
import type { Candidate, CandidateBreak, ExamProgramme, Workstation } from "@/lib/types";

/**
 * Countdown bands. The clock is an operational estimate — reaching zero asks
 * staff to confirm, it never finishes anyone.
 */
function band(msRemaining: number) {
  const minutes = msRemaining / 60000;
  if (minutes <= 0) return { key: "over", text: "text-rust", box: "border-rust/60 bg-rust/15", pulse: false };
  if (minutes < 1) return { key: "last", text: "text-rust", box: "border-rust/60 bg-rust/15", pulse: true };
  if (minutes <= 15) return { key: "red", text: "text-rust", box: "border-rust/45 bg-rust/10", pulse: false };
  if (minutes <= 60) return { key: "blue", text: "text-iris", box: "border-iris/45 bg-iris/10", pulse: false };
  return { key: "green", text: "text-mint", box: "border-mint/40 bg-mint/8", pulse: false };
}

function countdown(msRemaining: number) {
  const over = msRemaining <= 0;
  const total = Math.floor(Math.abs(msRemaining) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const body = h > 0 ? `${h} hr ${String(m).padStart(2, "0")} min` : `${m} min`;
  return over ? `+${body}` : body;
}

function awayFor(startedAt: string, now: number) {
  const mins = Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 60000));
  return `${mins} min`;
}

type Seated = {
  seat: Workstation;
  candidate: Candidate;
  programme: ExamProgramme | null;
  onBreak: CandidateBreak | null;
  remaining: number | null;
};

export function FloorScreen() {
  const { candidates, workstations, programmes, openBreaks, center, rpc, canLab } = useConsole();
  const now = useNow();

  const seatById = new Map(workstations.map((w) => [w.id, w]));

  const seated: Seated[] = candidates
    .filter((c) => c.workstation_id && seatById.has(c.workstation_id) && !c.exam_finished_at)
    .map((c) => ({
      seat: seatById.get(c.workstation_id!)!,
      candidate: c,
      programme: programmes.find((p) => p.id === c.programme_id) ?? null,
      onBreak: openBreaks.find((b) => b.candidate_id === c.id) ?? null,
      remaining: c.exam_expected_end ? new Date(c.exam_expected_end).getTime() - now : null,
    }))
    .sort((a, b) => {
      if (a.remaining === null) return 1;
      if (b.remaining === null) return -1;
      return a.remaining - b.remaining;
    });

  const running = seated.filter((s) => s.remaining !== null);
  const within = (mins: number) =>
    running.filter((s) => s.remaining! > 0 && s.remaining! <= mins * 60000).length;

  const clusters = (() => {
    const buckets = new Map<number, number>();
    for (const s of running) {
      if (s.remaining === null || s.remaining <= 0) continue;
      const end = new Date(s.candidate.exam_expected_end!).getTime();
      const slot = Math.floor(end / (15 * 60000)) * 15 * 60000;
      buckets.set(slot, (buckets.get(slot) ?? 0) + 1);
    }
    return [...buckets.entries()]
      .filter(([, n]) => n >= 2)
      .sort(([a], [b]) => a - b)
      .slice(0, 3)
      .map(([slot, n]) => ({
        n,
        from: clockAt(new Date(slot).toISOString(), center.timezone),
        to: clockAt(new Date(slot + 15 * 60000).toISOString(), center.timezone),
      }));
  })();

  const unavailable = workstations.filter((w) => w.status === "fault" || w.status === "cleaning").length;

  const stats = [
    { label: "Finishing ≤15 min", value: within(15), className: "text-rust" },
    { label: "≤30 min", value: within(30), className: "text-iris" },
    { label: "≤60 min", value: within(60), className: "text-iris" },
    { label: "On break", value: openBreaks.length, className: "text-gold" },
    { label: "Seats unavailable", value: unavailable, className: "text-fg-muted" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[12px] overflow-x-hidden overflow-y-auto">
      <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[12px]">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[18px] border border-edge-mid panel-bg p-[13px]">
            <span className="text-[9.5px] font-bold tracking-[0.12em] text-fg-dim uppercase">{s.label}</span>
            <div className={`mt-[4px] font-serif text-[34px] leading-[1.05] ${s.className}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {clusters.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-[8px]">
          {clusters.map((c) => (
            <span
              key={c.from}
              className="rounded-[12px] border border-gold/40 bg-gold/10 px-[12px] py-[8px] text-[11.5px] font-semibold text-gold-bright"
            >
              {c.n} candidates expected to finish between {c.from} and {c.to}
            </span>
          ))}
        </div>
      )}

      <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-[12px]">
        {seated.map((s) => (
          <SeatCard key={s.seat.id} row={s} now={now} canLab={canLab} timezone={center.timezone} rpc={rpc} />
        ))}
      </div>

      {seated.length === 0 && (
        <p className="shrink-0 rounded-[20px] border border-dashed border-[#38302a] p-[26px] text-center font-mono text-[11.5px] text-fg-faint">
          Nobody is seated yet. Assign a workstation on the Lab screen, then start the exam here.
        </p>
      )}

      <p className="shrink-0 font-mono text-[10.5px] text-fg-faint">
        Times shown are an operational estimate. The exam software remains authoritative, and the countdown
        keeps running through breaks.
      </p>
    </div>
  );
}

function SeatCard({
  row,
  now,
  canLab,
  timezone,
  rpc,
}: {
  row: Seated;
  now: number;
  canLab: boolean;
  timezone: string;
  rpc: (fn: string, args: Record<string, unknown>, ok?: string) => Promise<boolean>;
}) {
  const { seat, candidate, programme, onBreak, remaining } = row;
  const started = candidate.exam_started_at;

  if (!started) return <StartCard row={row} canLab={canLab} timezone={timezone} rpc={rpc} />;

  const tone = band(remaining ?? 0);
  const over = (remaining ?? 0) <= 0;

  return (
    <div className={`flex flex-col gap-[10px] rounded-[20px] border p-[14px] ${tone.box}`}>
      <div className="flex items-center gap-[10px]">
        <span className="font-mono text-[13px] font-semibold">{seat.seat_code}</span>
        <span className="rounded-[8px] bg-panel-soft px-[8px] py-[4px] font-mono text-[10px] text-fg-muted">
          {programme?.code ?? "—"}
        </span>
        <span className="flex-1" />
        {onBreak && (
          <span className="rounded-[8px] bg-gold/15 px-[8px] py-[4px] text-[9.5px] font-bold tracking-[0.06em] text-gold uppercase">
            On break · {awayFor(onBreak.started_at, now)}
          </span>
        )}
      </div>

      <div>
        <div className="overflow-hidden text-[13.5px] font-semibold text-ellipsis whitespace-nowrap">
          {fullName(candidate)}
        </div>
        <div className="font-mono text-[10px] text-fg-faint">
          {candidate.public_token} · started {clockAt(started, timezone)} · {candidate.exam_duration_minutes} min
          · ends {clockAt(candidate.exam_expected_end, timezone)}
        </div>
      </div>

      <div
        className={`font-mono text-[30px] leading-none font-semibold ${tone.text} ${
          tone.pulse ? "animate-pulse-dot motion-reduce:animate-none" : ""
        }`}
      >
        {countdown(remaining ?? 0)}
      </div>

      {over && (
        <p className="text-[11px] font-semibold text-rust">Expected end reached — confirm status</p>
      )}

      <div className="flex flex-wrap gap-[6px]">
        {onBreak ? (
          <button
            type="button"
            disabled={!canLab}
            onClick={() => rpc("fets_break_in", { p_candidate: candidate.id }, "Break ended")}
            className="cursor-pointer rounded-[11px] border border-gold/50 bg-gold/15 px-[12px] py-[8px] text-[11px] font-bold text-gold-bright disabled:opacity-40"
          >
            Break in
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={!canLab}
              onClick={() =>
                rpc(
                  "fets_break_out",
                  { p_candidate: candidate.id, p_kind: "scheduled" },
                  "Scheduled break started",
                )
              }
              className="cursor-pointer rounded-[11px] border border-edge-strong bg-panel-soft/70 px-[12px] py-[8px] text-[11px] font-bold text-fg-muted disabled:opacity-40"
            >
              Scheduled break
            </button>
            <button
              type="button"
              disabled={!canLab}
              onClick={() => {
                const reason = window.prompt("Reason for the unscheduled break?");
                if (reason === null) return;
                void rpc(
                  "fets_break_out",
                  { p_candidate: candidate.id, p_kind: "unscheduled", p_reason: reason || null },
                  "Unscheduled break recorded",
                );
              }}
              className="cursor-pointer rounded-[11px] border border-edge-strong bg-panel-soft/70 px-[12px] py-[8px] text-[11px] font-bold text-fg-muted disabled:opacity-40"
            >
              Unscheduled break
            </button>
          </>
        )}
        <span className="flex-1" />
        <button
          type="button"
          disabled={!canLab || !!onBreak}
          onClick={() => rpc("fets_confirm_finish", { p_candidate: candidate.id }, `${candidate.public_token} finished`)}
          className="cursor-pointer rounded-[11px] bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] px-[13px] py-[8px] text-[11px] font-bold text-[#0c1711] disabled:opacity-40"
        >
          Confirm finish
        </button>
      </div>
    </div>
  );
}

function StartCard({
  row,
  canLab,
  timezone,
  rpc,
}: {
  row: Seated;
  canLab: boolean;
  timezone: string;
  rpc: (fn: string, args: Record<string, unknown>, ok?: string) => Promise<boolean>;
}) {
  const { programmes, notify } = useConsole();
  const { seat, candidate } = row;
  const [programmeId, setProgrammeId] = useState(programmes[0]?.id ?? "");
  const [duration, setDuration] = useState(String(programmes[0]?.default_duration_minutes ?? 180));
  const [startTime, setStartTime] = useState(() => nowInZone(timezone));

  function pickProgramme(id: string) {
    setProgrammeId(id);
    const p = programmes.find((x) => x.id === id);
    if (p) setDuration(String(p.default_duration_minutes));
  }

  return (
    <div className="flex flex-col gap-[10px] rounded-[20px] border border-edge-mid panel-bg p-[14px]">
      <div className="flex items-center gap-[10px]">
        <span className="font-mono text-[13px] font-semibold">{seat.seat_code}</span>
        <span className="flex-1" />
        <span className="rounded-[8px] bg-panel-soft px-[8px] py-[4px] text-[9.5px] font-bold tracking-[0.06em] text-fg-dim uppercase">
          Not started
        </span>
      </div>

      <div>
        <div className="overflow-hidden text-[13.5px] font-semibold text-ellipsis whitespace-nowrap">
          {fullName(candidate)}
        </div>
        <div className="font-mono text-[10px] text-fg-faint">{candidate.public_token}</div>
      </div>

      <div className="flex flex-wrap items-end gap-[8px]">
        <label className="flex min-w-[110px] flex-1 flex-col gap-[4px]">
          <span className="text-[9px] font-bold tracking-[0.1em] text-fg-dim uppercase">Exam</span>
          <select
            value={programmeId}
            onChange={(e) => pickProgramme(e.target.value)}
            className="rounded-[10px] border border-edge-strong bg-panel-soft px-[9px] py-[8px] text-[12px] outline-none"
          >
            {programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-[86px] flex-col gap-[4px]">
          <span className="text-[9px] font-bold tracking-[0.1em] text-fg-dim uppercase">Started</span>
          <input
            inputMode="numeric"
            maxLength={5}
            // The prefill is the clock at render, so server and client can differ by a minute.
            suppressHydrationWarning
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-[10px] border border-edge-strong bg-panel-soft px-[9px] py-[8px] font-mono text-[12px] outline-none"
          />
        </label>
        <label className="flex w-[86px] flex-col gap-[4px]">
          <span className="text-[9px] font-bold tracking-[0.1em] text-fg-dim uppercase">Minutes</span>
          <input
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="rounded-[10px] border border-edge-strong bg-panel-soft px-[9px] py-[8px] font-mono text-[12px] outline-none"
          />
        </label>
        <button
          type="button"
          disabled={!canLab}
          onClick={() => {
            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
              notify("Enter the start time as HH:MM on a 24-hour clock", "error");
              return;
            }
            const minutes = Number(duration);
            if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
              notify("Enter a duration between 1 and 1440 minutes", "error");
              return;
            }
            // Typed as the center's wall clock, not the laptop's. A time that
            // lands in the future belongs to yesterday's overnight sitting.
            let startedAt = instantFromZonedTime(startTime, timezone);
            if (startedAt.getTime() > Date.now() + 5 * 60000) {
              startedAt = new Date(startedAt.getTime() - 24 * 3600 * 1000);
            }
            void rpc(
              "fets_start_exam",
              {
                p_candidate: candidate.id,
                p_programme: programmeId || null,
                p_started_at: startedAt.toISOString(),
                p_duration: minutes,
              },
              `${candidate.public_token} started`,
            );
          }}
          className="cursor-pointer rounded-[11px] gold-bg px-[14px] py-[9px] text-[11.5px] font-bold text-[#1a1512] disabled:opacity-40"
        >
          Start
        </button>
      </div>
    </div>
  );
}
