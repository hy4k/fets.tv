"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useConsole } from "@/lib/console-data";
import { clockAt, fullName, instantFromZonedTime } from "@/lib/format";
import { useNow } from "@/lib/use-clock";
import type { Candidate, CandidateBreak, ExamProgramme, Workstation } from "@/lib/types";

/**
 * Countdown bands. The clock is an operational estimate — reaching zero asks
 * staff to confirm, it never finishes anyone.
 */
function band(msRemaining: number) {
  const minutes = msRemaining / 60000;
  if (minutes <= 0) return { text: "text-rust", row: "bg-rust/12", pulse: true };
  if (minutes <= 5) return { text: "text-rust", row: "bg-rust/8", pulse: true };
  if (minutes <= 15) return { text: "text-rust", row: "", pulse: false };
  if (minutes <= 60) return { text: "text-iris", row: "", pulse: false };
  return { text: "text-mint", row: "", pulse: false };
}

function countdown(msRemaining: number) {
  const over = msRemaining <= 0;
  const total = Math.floor(Math.abs(msRemaining) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const body = h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m}m`;
  return over ? `+${body}` : body;
}

function awayFor(startedAt: string, now: number) {
  return `${Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 60000))}m`;
}

type Seated = {
  seat: Workstation;
  candidate: Candidate;
  programme: ExamProgramme | null;
  onBreak: CandidateBreak | null;
  remaining: number;
};

/**
 * The floor while it is running. Twenty-five people at once will not fit as
 * cards, so each one is a line: seat, who, how long left, and the two buttons
 * that matter. What needs attention is lifted out of the list and put across
 * the top, where it cannot be scrolled past.
 */
export function FloorScreen() {
  const { candidates, workstations, programmes, openBreaks, center, rpc, canLab } = useConsole();
  const now = useNow();
  const [editing, setEditing] = useState<Seated | null>(null);

  const seatById = useMemo(() => new Map(workstations.map((w) => [w.id, w])), [workstations]);

  const seated: Seated[] = useMemo(
    () =>
      candidates
        .filter((c) => c.workstation_id && seatById.has(c.workstation_id) && !c.exam_finished_at)
        .map((c) => ({
          seat: seatById.get(c.workstation_id!)!,
          candidate: c,
          programme: programmes.find((p) => p.id === c.programme_id) ?? null,
          onBreak: openBreaks.find((b) => b.candidate_id === c.id) ?? null,
          remaining: c.exam_expected_end ? new Date(c.exam_expected_end).getTime() - now : Infinity,
        }))
        .sort((a, b) => a.remaining - b.remaining),
    [candidates, seatById, programmes, openBreaks, now],
  );

  const overdue = seated.filter((s) => s.remaining <= 0);
  const soon = seated.filter((s) => s.remaining > 0 && s.remaining <= 5 * 60000);
  const away = seated.filter((s) => s.onBreak);
  const faults = workstations.filter((w) => w.lab_id && w.status === "fault");

  // Anything that needs a person, gathered where a person will see it.
  const alerts = [
    overdue.length > 0 && {
      key: "over",
      tone: "border-rust bg-rust/15 text-rust",
      text:
        overdue.length === 1
          ? `${overdue[0].seat.seat_code} is past time — confirm or extend`
          : `${overdue.length} seats are past time — confirm or extend`,
    },
    soon.length > 0 && {
      key: "soon",
      tone: "border-gold/60 bg-gold/12 text-gold-bright",
      text: `${soon.length} finishing within 5 minutes: ${soon.map((s) => s.seat.seat_code).join(", ")}`,
    },
    away.length > 0 && {
      key: "away",
      tone: "border-iris/55 bg-iris/12 text-iris",
      text: `${away.length} on break: ${away
        .map((s) => `${s.seat.seat_code} ${awayFor(s.onBreak!.started_at, now)}`)
        .join(", ")}`,
    },
    faults.length > 0 && {
      key: "fault",
      tone: "border-rust/50 bg-rust/8 text-rust",
      text: `Faulty: ${faults.map((w) => w.seat_code).join(", ")}`,
    },
  ].filter(Boolean) as { key: string; tone: string; text: string }[];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[11px]">
      {alerts.length > 0 && (
        <div className="flex shrink-0 flex-col gap-[7px]">
          {alerts.map((a) => (
            <div
              key={a.key}
              className={`rounded-[15px] border-2 px-[15px] py-[12px] text-[14px] font-bold ${a.tone}`}
            >
              {a.text}
            </div>
          ))}
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center gap-[10px]">
        <span className="text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">
          On the floor
        </span>
        <span className="font-mono text-[13px] font-semibold text-gold">{seated.length}</span>
        <span className="h-px min-w-[12px] flex-1 bg-edge-soft" />
        <span className="text-[12px] text-fg-faint">
          {workstations.filter((w) => w.lab_id && w.status === "free").length} seats free
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-edge-mid panel-bg">
        <div className="hidden shrink-0 grid-cols-[86px_1fr_78px_64px_auto] items-center gap-[12px] border-b border-edge-soft px-[16px] py-[10px] text-[10.5px] font-semibold text-fg-dim sm:grid">
          <span>Seat</span>
          <span>Candidate</span>
          <span className="text-right">Left</span>
          <span>Ends</span>
          <span />
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {seated.map((s) => (
            <FloorRow
              key={s.seat.id}
              row={s}
              now={now}
              canLab={canLab}
              timezone={center.timezone}
              rpc={rpc}
              onEdit={() => setEditing(s)}
            />
          ))}

          {seated.length === 0 && (
            <p className="p-[26px] text-center text-[13px] text-fg-faint">
              Nobody is on the floor. Seating somebody in the Lab starts their clock.
            </p>
          )}
        </div>
      </div>

      <p className="shrink-0 font-mono text-[10.5px] text-fg-faint">
        The clock is an estimate and keeps running through breaks. The exam software remains
        authoritative; nobody is finished until somebody presses Finish.
      </p>

      {editing && (
        <AdjustDialog key={editing.candidate.id} row={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function FloorRow({
  row,
  now,
  canLab,
  timezone,
  rpc,
  onEdit,
}: {
  row: Seated;
  now: number;
  canLab: boolean;
  timezone: string;
  rpc: (fn: string, args: Record<string, unknown>, ok?: string) => Promise<boolean>;
  onEdit: () => void;
}) {
  const { seat, candidate, programme, onBreak, remaining } = row;
  const tone = band(remaining);

  return (
    <div
      className={`grid grid-cols-[1fr_auto] items-center gap-x-[12px] gap-y-[7px] border-b border-edge-soft/60 px-[13px] py-[10px] sm:grid-cols-[86px_1fr_78px_64px_auto] sm:px-[16px] ${tone.row}`}
    >
      <span className="order-1 font-mono text-[12.5px] font-semibold whitespace-nowrap">
        {seat.seat_code}
      </span>

      <span className="order-3 col-span-2 block min-w-0 sm:order-2 sm:col-span-1">
        <span className="flex items-center gap-[8px]">
          <span className="min-w-0 truncate text-[13.5px]">{fullName(candidate)}</span>
          {onBreak && (
            <span className="shrink-0 rounded-[7px] bg-iris/20 px-[7px] py-[3px] text-[9.5px] font-bold whitespace-nowrap text-iris uppercase">
              break {awayFor(onBreak.started_at, now)}
            </span>
          )}
        </span>
        <span className="block truncate font-mono text-[10px] text-fg-faint">
          {[candidate.public_token, programme?.code, `${candidate.exam_duration_minutes ?? "?"} min`]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>

      <button
        type="button"
        onClick={onEdit}
        title="Correct the start time or length"
        className={`order-2 cursor-pointer text-right font-mono text-[19px] leading-none font-semibold sm:order-3 ${tone.text} ${
          tone.pulse ? "animate-pulse-dot motion-reduce:animate-none" : ""
        }`}
      >
        {Number.isFinite(remaining) ? countdown(remaining) : "—"}
      </button>

      <span className="order-4 hidden font-mono text-[11px] text-fg-faint sm:block">
        {clockAt(candidate.exam_expected_end, timezone)}
      </span>

      <span className="order-5 col-span-2 flex justify-end gap-[6px] sm:col-span-1">
        {onBreak ? (
          <button
            type="button"
            disabled={!canLab}
            onClick={() => rpc("fets_break_in", { p_candidate: candidate.id }, "Break ended")}
            className="cursor-pointer rounded-[10px] border border-iris/55 bg-iris/15 px-[11px] py-[8px] text-[11.5px] font-bold text-iris disabled:opacity-40"
          >
            Back
          </button>
        ) : (
          <button
            type="button"
            disabled={!canLab}
            onClick={() =>
              rpc(
                "fets_break_out",
                { p_candidate: candidate.id, p_kind: "scheduled" },
                "Break started",
              )
            }
            className="cursor-pointer rounded-[10px] border border-edge-strong bg-panel-soft px-[11px] py-[8px] text-[11.5px] font-bold text-fg-muted disabled:opacity-40"
          >
            Break
          </button>
        )}
        <button
          type="button"
          disabled={!canLab || !!onBreak}
          onClick={() =>
            rpc(
              "fets_confirm_finish",
              { p_candidate: candidate.id },
              `${candidate.public_token} finished`,
            )
          }
          className="cursor-pointer rounded-[10px] bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] px-[13px] py-[8px] text-[11.5px] font-bold text-[#0c1711] disabled:opacity-40"
        >
          Finish
        </button>
      </span>
    </div>
  );
}

/** The clock starts itself now, so this is the correction the user asked for. */
function AdjustDialog({ row, onClose }: { row: Seated; onClose: () => void }) {
  const { center, rpc, notify, canLab } = useConsole();
  const { candidate, seat } = row;

  const [startTime, setStartTime] = useState(() =>
    clockAt(candidate.exam_started_at, center.timezone),
  );
  const [duration, setDuration] = useState(String(candidate.exam_duration_minutes ?? 180));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      notify("Write the start time as HH:MM on a 24-hour clock", "error");
      return;
    }
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      notify("Enter a length between 1 and 1440 minutes", "error");
      return;
    }
    if (!reason.trim()) {
      notify("Say why it is being changed — it goes in the audit trail", "error");
      return;
    }

    // Typed as the centre's wall clock. A time that lands in the future belongs
    // to yesterday's overnight sitting.
    let startedAt = instantFromZonedTime(startTime, center.timezone);
    if (startedAt.getTime() > Date.now() + 5 * 60000) {
      startedAt = new Date(startedAt.getTime() - 24 * 3600 * 1000);
    }

    setBusy(true);
    const ok = await rpc(
      "fets_adjust_exam",
      {
        p_candidate: candidate.id,
        p_started_at: startedAt.toISOString(),
        p_duration: minutes,
        p_reason: reason.trim(),
      },
      "Clock corrected",
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      title="Correct the clock"
      subtitle={`${fullName(candidate)} · ${seat.seat_code}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            disabled={busy || !canLab}
            onClick={save}
            className="flex-1 cursor-pointer rounded-[14px] gold-bg px-[22px] py-[14px] text-[14px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save the correction"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[14px] border border-edge px-[20px] py-[14px] text-[14px] font-semibold text-fg-muted"
          >
            Cancel
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-[15px]">
        <p className="text-[12.5px] leading-[1.5] text-fg-faint">
          The clock started when this candidate was seated. Change it here if they actually started
          at a different time, or if the exam is a different length.
        </p>

        <div className="flex flex-wrap gap-[12px]">
          <label className="flex w-[120px] flex-col gap-[7px]">
            <span className="text-[11.5px] font-semibold text-fg-dim">Started at</span>
            <input
              inputMode="numeric"
              maxLength={5}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-[12px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] font-mono text-[16px] outline-none focus:border-gold/50"
            />
          </label>
          <label className="flex w-[120px] flex-col gap-[7px]">
            <span className="text-[11.5px] font-semibold text-fg-dim">Minutes</span>
            <input
              inputMode="numeric"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="rounded-[12px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] font-mono text-[16px] outline-none focus:border-gold/50"
            />
          </label>
        </div>

        <label className="flex flex-col gap-[7px]">
          <span className="text-[11.5px] font-semibold text-fg-dim">
            Why <span className="font-normal text-fg-faint">— kept in the audit trail</span>
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Started 10 minutes late"
            className="rounded-[12px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] text-[15px] outline-none placeholder:text-fg-faint focus:border-gold/50"
          />
        </label>
      </div>
    </Dialog>
  );
}
