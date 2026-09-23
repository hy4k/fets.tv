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
  const [moving, setMoving] = useState<Seated | null>(null);

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
              onMove={() => setMoving(s)}
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

      {moving && (
        <TransferDialog key={moving.candidate.id} row={moving} onClose={() => setMoving(null)} />
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
  onMove,
}: {
  row: Seated;
  now: number;
  canLab: boolean;
  timezone: string;
  rpc: (fn: string, args: Record<string, unknown>, ok?: string) => Promise<boolean>;
  onEdit: () => void;
  onMove: () => void;
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
          disabled={!canLab}
          onClick={onMove}
          title="Move them to another machine, carrying the sitting across"
          className="cursor-pointer rounded-[10px] border border-edge-strong bg-panel-soft px-[11px] py-[8px] text-[11.5px] font-bold text-fg-muted disabled:opacity-40"
        >
          Move
        </button>
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

/**
 * Moving somebody mid-exam, carrying their sitting with them.
 *
 * Three things have to be true at once and each is easy to forget under
 * pressure: the clock keeps the hour they already sat, the minutes they spent
 * standing about are given back, and the machine that failed does not quietly
 * return to the pool. The form does all three and writes the incident itself.
 */
function TransferDialog({ row, onClose }: { row: Seated; onClose: () => void }) {
  const { workstations, labs, rpc, notify, canLab } = useConsole();
  const { candidate, seat } = row;

  const [toSeat, setToSeat] = useState("");
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState("0");
  const [faultOld, setFaultOld] = useState(true);
  const [busy, setBusy] = useState(false);

  const free = useMemo(
    () =>
      workstations
        .filter((w) => w.lab_id && w.status === "free" && w.id !== seat.id)
        .sort((a, b) => a.seat_code.localeCompare(b.seat_code, undefined, { numeric: true })),
    [workstations, seat.id],
  );

  const byLab = labs.map((lab) => ({ lab, seats: free.filter((w) => w.lab_id === lab.id) }));
  const chosen = free.find((w) => w.id === toSeat) ?? null;

  async function move() {
    if (!chosen) return;
    if (!reason.trim()) {
      notify("Say why they are being moved — it goes in the incident", "error");
      return;
    }
    const lost = Number(minutes || "0");
    if (!Number.isInteger(lost) || lost < 0 || lost > 1440) {
      notify("Minutes lost has to be a whole number of minutes", "error");
      return;
    }

    setBusy(true);
    const ok = await rpc(
      "fets_transfer_workstation",
      {
        p_candidate: candidate.id,
        p_to_workstation: chosen.id,
        p_reason: reason,
        p_minutes_lost: lost,
        p_fault_old_seat: faultOld,
      },
      `${candidate.public_token} moved to ${chosen.seat_code}`,
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      title="Move them to another machine"
      subtitle={`${fullName(candidate)} · currently at ${seat.seat_code}`}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button
            type="button"
            disabled={busy || !chosen || !reason.trim() || !canLab}
            onClick={move}
            className={`flex-1 rounded-[14px] px-[22px] py-[15px] text-[14.5px] font-bold ${
              chosen && reason.trim() && canLab
                ? "cursor-pointer gold-bg text-[#1a1512]"
                : "cursor-not-allowed bg-[#221d19] text-fg-dim"
            }`}
          >
            {busy
              ? "Moving…"
              : chosen
                ? `Move to ${chosen.seat_code}`
                : "Pick a machine above"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[14px] border border-edge px-[20px] py-[15px] text-[14px] font-semibold text-fg-muted"
          >
            Cancel
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-[17px]">
        <p className="text-[12.5px] leading-[1.55] text-fg-faint">
          Their clock keeps the time they have already sat. Whatever you put as minutes lost is added
          on at the end, so they get it back rather than losing it.
        </p>

        {free.length === 0 ? (
          <p className="rounded-[14px] border border-rust/40 bg-rust/8 p-[13px] text-[13px] text-rust">
            Every other machine is taken or faulty. Free one first.
          </p>
        ) : (
          byLab
            .filter(({ seats }) => seats.length > 0)
            .map(({ lab, seats }) => (
              <div key={lab.id} className="flex flex-col gap-[8px]">
                <span className="text-[11.5px] font-semibold text-fg-dim">
                  {lab.name} · {seats.length} free
                </span>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-[7px]">
                  {seats.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setToSeat(w.id)}
                      className={`aspect-square rounded-[12px] border font-mono text-[13px] font-semibold ${
                        toSeat === w.id
                          ? "border-mint bg-mint/25 text-mint"
                          : "cursor-pointer border-edge-warm bg-panel-soft text-fg-muted hover:border-gold hover:text-gold-bright"
                      }`}
                    >
                      {w.seat_code.replace(/^.*-/, "")}
                    </button>
                  ))}
                </div>
              </div>
            ))
        )}

        <label className="flex flex-col gap-[7px]">
          <span className="text-[11.5px] font-semibold text-fg-dim">
            Why <span className="font-normal text-fg-faint">— this becomes the incident</span>
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Machine froze on the reading section"
            className="w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] text-[15px] outline-none placeholder:text-fg-faint focus:border-gold/50"
          />
        </label>

        <label className="flex w-[170px] flex-col gap-[7px]">
          <span className="text-[11.5px] font-semibold text-fg-dim">Minutes to give back</span>
          <input
            inputMode="numeric"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="rounded-[12px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] font-mono text-[16px] outline-none focus:border-gold/50"
          />
        </label>

        <button
          type="button"
          role="switch"
          aria-checked={faultOld}
          onClick={() => setFaultOld((v) => !v)}
          className="flex cursor-pointer items-center gap-[14px] rounded-[16px] border border-edge bg-panel-soft p-[13px] text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold">
              Take {seat.seat_code} out of service
            </span>
            <span className="mt-[2px] block text-[12px] leading-[1.45] text-fg-faint">
              On by default. A machine that just failed should not be handed to the next candidate.
              Turn it off if the move was for some other reason.
            </span>
          </span>
          <span
            className={`flex h-[26px] w-[46px] shrink-0 items-center rounded-full p-[3px] transition-colors ${
              faultOld ? "bg-rust/70" : "bg-[#30291f]"
            }`}
          >
            <span
              className={`h-[20px] w-[20px] rounded-full bg-[#141110] transition-transform ${
                faultOld ? "translate-x-[20px]" : ""
              }`}
            />
          </span>
        </button>
      </div>
    </Dialog>
  );
}
