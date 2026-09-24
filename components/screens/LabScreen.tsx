"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useConsole } from "@/lib/console-data";
import { fullName, initials } from "@/lib/format";
import type { Candidate, Workstation } from "@/lib/types";

/** Everyone who has been sent in but has nowhere to sit yet. */
const UNSEATED = ["frisking", "biometrics", "assigned"];

/**
 * Seating, in three taps: the person, the seat, confirm. The page shows who is
 * still standing; the seats appear only once you have said who you are seating,
 * so there is never a grid of eighty squares with no question attached to it.
 */
export function LabScreen() {
  const { candidates, labs, workstations, session, canLab } = useConsole();
  const [seatingId, setSeatingId] = useState<string | null>(null);

  const waiting = useMemo(
    () =>
      candidates
        .filter((c) => UNSEATED.includes(c.status) && !c.workstation_id)
        .sort((a, b) => (a.called_at ?? a.check_in_at ?? "").localeCompare(b.called_at ?? b.check_in_at ?? "")),
    [candidates],
  );

  const seated = useMemo(
    () => candidates.filter((c) => c.workstation_id && !c.exam_finished_at),
    [candidates],
  );

  const seating = candidates.find((c) => c.id === seatingId) ?? null;

  // Only seats that belong to a lab the centre still has. A retired bank keeps
  // its rows for the candidates who sat there, but it is not part of the floor.
  const byLab = useMemo(
    () =>
      labs.map((lab) => ({
        lab,
        seats: workstations
          .filter((w) => w.lab_id === lab.id)
          .sort((a, b) => a.seat_code.localeCompare(b.seat_code, undefined, { numeric: true })),
      })),
    [labs, workstations],
  );

  const free = workstations.filter((w) => w.lab_id && w.status === "free").length;

  if (!session) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-[20px] border border-edge-mid panel-bg p-[24px] text-center">
        <p className="max-w-[360px] text-[13.5px] text-fg-muted">
          No active roster for this center. Import one from{" "}
          <span className="font-semibold text-gold">Roster</span> to start seating.
        </p>
      </div>
    );
  }

  if (labs.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-[20px] border border-edge-mid panel-bg p-[24px] text-center">
        <p className="max-w-[360px] text-[13.5px] text-fg-muted">
          This center has no labs set up. Add them under{" "}
          <span className="font-semibold text-gold">Setup</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[12px]">
      <div className="flex shrink-0 flex-wrap items-center gap-[10px]">
        {byLab.map(({ lab, seats }) => {
          const open = seats.filter((s) => s.status === "free").length;
          return (
            <span
              key={lab.id}
              className="rounded-[14px] border border-edge bg-panel-soft px-[14px] py-[10px] text-[12.5px]"
            >
              <span className="font-semibold">{lab.name}</span>
              <span className="ml-[9px] font-mono text-fg-muted">
                {open}/{seats.length} free
              </span>
            </span>
          );
        })}
        <span className="flex-1" />
        <span className="text-[12.5px] text-fg-faint">{seated.length} seated</span>
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-edge-mid panel-bg">
        <div className="flex shrink-0 items-center gap-[10px] border-b border-edge-soft px-[16px] py-[12px]">
          <span className="text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">
            Waiting for a seat
          </span>
          <span className="h-px flex-1 bg-edge-soft" />
          <span className="font-mono text-[13px] font-semibold text-gold">{waiting.length}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {waiting.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={!canLab || free === 0}
              onClick={() => setSeatingId(c.id)}
              className="flex w-full items-center gap-[12px] border-b border-edge-soft/60 px-[14px] py-[12px] text-left hover:bg-panel-soft disabled:cursor-not-allowed md:px-[18px]"
            >
              <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[12px] border border-edge-strong bg-[#1f1f27] font-mono text-[11px] font-semibold">
                {initials(fullName(c))}
              </span>
              <span className="block min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{fullName(c)}</span>
                <span className="block truncate font-mono text-[10.5px] text-fg-faint">
                  {[c.public_token, c.part, c.locker_key && `KEY ${c.locker_key}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="shrink-0 rounded-[12px] border border-gold/45 bg-gold/10 px-[15px] py-[10px] text-[12.5px] font-bold text-gold-bright">
                Seat them
              </span>
            </button>
          ))}

          {waiting.length === 0 && (
            <p className="p-[26px] text-center text-[13px] text-fg-faint">
              Nobody is waiting for a seat.
            </p>
          )}
        </div>

        {free === 0 && waiting.length > 0 && (
          <p className="shrink-0 border-t border-rust/30 bg-rust/8 px-[16px] py-[11px] text-[12.5px] text-rust">
            Every seat is taken. Finish somebody on the Live Floor to free one.
          </p>
        )}
      </section>

      {seating && (
        <SeatPicker
          key={seating.id}
          candidate={seating}
          byLab={byLab}
          onClose={() => setSeatingId(null)}
        />
      )}
    </div>
  );
}

/** The seats, once there is somebody to put in one. */
function SeatPicker({
  candidate,
  byLab,
  onClose,
}: {
  candidate: Candidate;
  byLab: { lab: { id: string; name: string }; seats: Workstation[] }[];
  onClose: () => void;
}) {
  const { candidates, rpc, canLab } = useConsole();
  const [chosen, setChosen] = useState<Workstation | null>(null);
  const [busy, setBusy] = useState(false);

  const occupantOf = (w: Workstation) =>
    candidates.find((c) => c.id === w.current_candidate_id)?.public_token ?? null;

  async function confirm() {
    if (!chosen) return;
    setBusy(true);
    const ok = await rpc(
      "fets_assign_workstation",
      { p_candidate: candidate.id, p_workstation: chosen.id },
      `${candidate.public_token} seated at ${chosen.seat_code}`,
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      title={chosen ? `Seat at ${chosen.seat_code}?` : "Choose a seat"}
      subtitle={`${fullName(candidate)} · ${candidate.public_token}`}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button
            type="button"
            disabled={!chosen || busy || !canLab}
            onClick={confirm}
            className={`flex-1 rounded-[14px] px-[22px] py-[15px] text-[15px] font-bold ${
              chosen && canLab
                ? "cursor-pointer bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] text-[#0c1711]"
                : "cursor-not-allowed bg-[#1d1d25] text-fg-dim"
            }`}
          >
            {busy ? "Seating…" : chosen ? `Confirm ${chosen.seat_code}` : "Pick a seat above"}
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
      <div className="flex flex-col gap-[18px]">
        {byLab.map(({ lab, seats }) => {
          const open = seats.filter((s) => s.status === "free").length;
          return (
            <div key={lab.id} className="flex flex-col gap-[9px]">
              <div className="flex items-baseline gap-[10px]">
                <span className="text-[13.5px] font-semibold">{lab.name}</span>
                <span className="font-mono text-[11.5px] text-fg-faint">
                  {open} of {seats.length} free
                </span>
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-[7px]">
                {seats.map((seat) => {
                  const taken = seat.status !== "free";
                  const picked = chosen?.id === seat.id;
                  const number = seat.seat_code.replace(/^.*-/, "");
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      disabled={taken || !canLab}
                      title={
                        seat.status === "fault"
                          ? "Marked faulty"
                          : taken
                            ? `Taken by ${occupantOf(seat) ?? "somebody"}`
                            : seat.seat_code
                      }
                      onClick={() => setChosen(seat)}
                      className={`aspect-square rounded-[12px] border font-mono text-[13px] font-semibold ${
                        picked
                          ? "border-mint bg-mint/25 text-mint"
                          : seat.status === "fault"
                            ? "cursor-not-allowed border-rust/35 bg-rust/8 text-rust/60"
                            : taken
                              ? "cursor-not-allowed border-edge bg-panel text-fg-faint/40"
                              : "cursor-pointer border-edge-warm bg-panel-soft text-fg-muted hover:border-gold hover:text-gold-bright"
                      }`}
                    >
                      {number}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <p className="text-[12px] leading-[1.5] text-fg-faint">
          A dim square is taken, a red one is faulty. Picking a seat turns it green; the button below
          confirms it.
        </p>
      </div>
    </Dialog>
  );
}
