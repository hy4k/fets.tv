"use client";

import { useMemo, useState } from "react";
import { useConsole } from "@/lib/console-data";
import type { Candidate, Workstation } from "@/lib/types";

/**
 * Every seat in the centre, lab by lab, for putting one person in one of them.
 * Shown inline where the person is — the Admin page — so seating is two taps
 * on the page already open: the seat, then confirm.
 */
export function SeatGrid({ candidate, onDone }: { candidate: Candidate; onDone: () => void }) {
  const { candidates, labs, workstations, rpc, canLab } = useConsole();
  const [chosen, setChosen] = useState<Workstation | null>(null);
  const [busy, setBusy] = useState(false);

  // Only seats in a lab the centre still has; a retired bank keeps its rows
  // for the record but is not part of the floor.
  const byLab = useMemo(
    () =>
      labs
        .map((lab) => ({
          lab,
          seats: workstations
            .filter((w) => w.lab_id === lab.id)
            .sort((a, b) => a.seat_code.localeCompare(b.seat_code, undefined, { numeric: true })),
        }))
        .filter((l) => l.seats.length > 0),
    [labs, workstations],
  );

  const occupantOf = (w: Workstation) =>
    candidates.find((c) => c.id === w.current_candidate_id)?.public_token ?? null;

  async function repair(seat: Workstation) {
    if (!window.confirm(`${seat.seat_code} is marked faulty. Is it working again?`)) return;
    setBusy(true);
    await rpc("fets_set_workstation_status", { p_workstation: seat.id, p_status: "free" }, `${seat.seat_code} is back in use`);
    setBusy(false);
  }

  async function confirm() {
    if (!chosen) return;
    setBusy(true);
    const ok = await rpc(
      "fets_assign_workstation",
      { p_candidate: candidate.id, p_workstation: chosen.id },
      `${candidate.public_token} seated at ${chosen.seat_code}`,
    );
    setBusy(false);
    if (ok) onDone();
  }

  if (byLab.length === 0) {
    return <p className="text-[12.5px] text-gold">No labs are set up. Add them under Setup.</p>;
  }

  return (
    <div className="flex flex-col gap-[14px]">
      {byLab.map(({ lab, seats }) => {
        const open = seats.filter((s) => s.status === "free").length;
        return (
          <div key={lab.id} className="flex flex-col gap-[8px]">
            <div className="flex items-baseline gap-[10px]">
              <span className="text-[13px] font-semibold">{lab.name}</span>
              <span className="font-mono text-[11px] text-fg-faint">
                {open} of {seats.length} free
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(50px,1fr))] gap-[6px]">
              {seats.map((seat) => {
                const faulty = seat.status === "fault";
                const taken = seat.status !== "free";
                const picked = chosen?.id === seat.id;
                return (
                  <button
                    key={seat.id}
                    type="button"
                    disabled={(taken && !faulty) || !canLab || busy}
                    title={
                      faulty
                        ? "Marked faulty — tap if it works again"
                        : taken
                          ? `Taken by ${occupantOf(seat) ?? "somebody"}`
                          : seat.seat_code
                    }
                    onClick={() => (faulty ? void repair(seat) : setChosen(seat))}
                    className={`aspect-square rounded-[11px] border font-mono text-[12.5px] font-semibold transition-colors ${
                      picked
                        ? "border-mint bg-mint/25 text-mint shadow-[0_0_0_3px_oklch(0.8_0.15_160/0.18)]"
                        : seat.status === "fault"
                          ? "cursor-pointer border-rust/35 bg-rust/8 text-rust/70 hover:border-rust"
                          : taken
                            ? "cursor-not-allowed border-edge bg-panel text-fg-faint/40"
                            : "cursor-pointer border-edge-warm bg-panel-soft text-fg-muted hover:border-accent hover:text-fg"
                    }`}
                  >
                    {seat.seat_code.replace(/^.*-/, "")}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-[10px]">
        <button
          type="button"
          disabled={!chosen || busy || !canLab}
          onClick={confirm}
          className={`rounded-[14px] px-[22px] py-[13px] text-[14px] font-bold ${
            chosen && canLab
              ? "cursor-pointer bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] text-[#0c1711]"
              : "cursor-not-allowed bg-[#1d1d25] text-fg-dim"
          }`}
        >
          {busy ? "Seating…" : chosen ? `Seat at ${chosen.seat_code}` : "Pick a seat"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="cursor-pointer rounded-[14px] border border-edge px-[18px] py-[13px] text-[13px] font-semibold text-fg-muted"
        >
          Cancel
        </button>
        <span className="text-[11.5px] text-fg-faint">Dim is taken. Red is faulty — tap it if it works again.</span>
      </div>
    </div>
  );
}
