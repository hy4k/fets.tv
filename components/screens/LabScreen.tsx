"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { useDrawers } from "@/lib/drawer-store";
import { useConsole } from "@/lib/console-data";
import { STAGE_LABELS, fullName } from "@/lib/format";
import type { CandidateStatus, WorkstationStatus } from "@/lib/types";

const SEAT_TONES: Record<WorkstationStatus, { dot: string; box: string }> = {
  active: { dot: "bg-mint", box: "border-mint/40 bg-mint/12" },
  assigned: { dot: "bg-iris", box: "border-iris/40 bg-iris/12" },
  free: { dot: "bg-fg-faint", box: "border-edge bg-panel-soft" },
  cleaning: { dot: "bg-gold", box: "border-gold/40 bg-gold/12" },
  fault: { dot: "bg-rust", box: "border-rust/40 bg-rust/12" },
};

const HANDOFF_STAGES: CandidateStatus[] = ["frisking", "biometrics", "assigned", "lab_entry", "testing"];

export function LabScreen() {
  const { workstations, candidates, rules, rpc, canLab } = useConsole();
  const { open, toggle } = useDrawers("lab", { handoff: true });
  const [lab, setLab] = useState<string>(workstations[0]?.lab_name ?? "A");
  const [seatId, setSeatId] = useState<string | null>(null);
  const [candidateId, setCandidateId] = useState<string | null>(null);

  const labs = [...new Set(workstations.map((w) => w.lab_name))].sort();
  const seats = workstations.filter((w) => w.lab_name === lab);
  const activeSeats = seats.filter((s) => s.status === "active" || s.status === "assigned").length;
  const seat = seats.find((s) => s.id === seatId) ?? null;

  const handoffs = candidates.filter((c) => HANDOFF_STAGES.includes(c.status));
  const picked = candidates.find((c) => c.id === candidateId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[12px] overflow-x-hidden overflow-y-auto">
      <div className="shrink-0 rounded-[20px] border border-edge-mid panel-bg p-[14px]">
        <div className="mb-[12px] flex flex-wrap gap-[6px]">
          {(labs.length ? labs : ["A"]).map((name) => {
            const on = name === lab;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setLab(name);
                  setSeatId(null);
                }}
                className={`cursor-pointer rounded-[13px] border px-[14px] py-[9px] text-[12px] font-bold ${
                  on ? "border-gold/50 bg-gold/15 text-gold-bright" : "border-edge bg-panel-soft text-fg-dim"
                }`}
              >
                {name}
              </button>
            );
          })}
          <span className="flex-1" />
          <span className="self-center font-mono text-[11px] text-fg-dim">
            {seats.length} seats · {activeSeats} active
          </span>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(62px,1fr))] gap-[9px]">
          {seats.map((s) => {
            const tone = SEAT_TONES[s.status];
            const on = s.id === seatId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSeatId(s.id)}
                className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-[3px] rounded-[16px] border ${
                  on ? "border-gold/65 bg-gold/20 text-fg" : `${tone.box} text-fg-muted`
                }`}
              >
                <span className="font-mono text-[11.5px] font-semibold">{shortSeat(s.seat_code)}</span>
                <span className={`h-[6px] w-[6px] rounded-full ${tone.dot}`} />
              </button>
            );
          })}
          {seats.length === 0 && (
            <p className="font-mono text-[11px] text-fg-faint">
              No workstations yet — run “Rebuild seat map” in Setup.
            </p>
          )}
        </div>

        <div className="mt-[13px] flex flex-wrap items-center gap-[9px] border-t border-edge-soft pt-[12px]">
          {(
            [
              ["Active", "bg-mint"],
              ["Assigned", "bg-iris"],
              ["Free", "bg-fg-faint"],
              ["Cleaning", "bg-gold"],
              ["Fault", "bg-rust"],
            ] as const
          ).map(([label, dot]) => (
            <span
              key={label}
              className="flex items-center gap-[6px] text-[10.5px] font-bold tracking-[0.06em] text-fg-muted uppercase"
            >
              <span className={`h-[8px] w-[8px] rounded-[3px] ${dot}`} />
              {label}
            </span>
          ))}

          <span className="flex-1" />

          {seat && (
            <span className="flex flex-wrap items-center gap-[8px]">
              <span className="font-mono text-[11px] text-fg-muted">
                {seat.seat_code} · {seat.status}
              </span>
              <button
                type="button"
                disabled={!canLab || !picked || seat.status === "fault"}
                onClick={() =>
                  picked &&
                  rpc(
                    "fets_assign_workstation",
                    { p_candidate: picked.id, p_workstation: seat.id },
                    `${picked.public_token} → ${seat.seat_code}`,
                  )
                }
                className="cursor-pointer rounded-[11px] border border-gold/45 bg-gold/15 px-[12px] py-[8px] text-[11px] font-bold text-gold-bright disabled:opacity-40"
              >
                {picked ? `Assign ${picked.public_token}` : "Pick a handoff first"}
              </button>
              <button
                type="button"
                disabled={!canLab || !!seat.current_candidate_id}
                onClick={() =>
                  rpc("fets_set_workstation_status", {
                    p_workstation: seat.id,
                    p_status: seat.status === "fault" ? "free" : "fault",
                  })
                }
                className="cursor-pointer rounded-[11px] border border-edge px-[12px] py-[8px] text-[11px] font-bold text-fg-muted disabled:opacity-40"
              >
                {seat.status === "fault" ? "Clear fault" : "Mark fault"}
              </button>
            </span>
          )}
        </div>
      </div>

      <Drawer label="Handoffs" meta={handoffs.length} metaClassName="text-gold" open={open.handoff} onToggle={toggle("handoff")}>
        <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[10px]">
          {handoffs.map((c) => {
            const seatCode = workstations.find((w) => w.id === c.workstation_id)?.seat_code;
            const on = c.id === candidateId;
            return (
              <div
                key={c.id}
                onClick={() => setCandidateId(c.id)}
                className={`flex cursor-pointer items-center gap-[10px] rounded-[14px] border p-[11px] ${
                  on ? "border-gold/50 bg-gold/10" : "border-edge bg-panel-soft"
                }`}
              >
                <span className="w-[72px] shrink-0 font-mono text-[12px] font-semibold whitespace-nowrap">
                  {c.public_token}
                </span>
                <span className="min-w-0 flex-1 overflow-hidden font-mono text-[10.5px] text-fg-dim text-ellipsis whitespace-nowrap uppercase">
                  {STAGE_LABELS[c.status]} → {nextLabel(c.status, rules.biometrics_enabled)}
                  {seatCode ? ` · ${seatCode}` : ""}
                </span>
                <button
                  type="button"
                  disabled={!canLab}
                  onClick={(e) => {
                    e.stopPropagation();
                    void rpc("fets_advance_stage", { p_candidate: c.id }, `${c.public_token} advanced`);
                  }}
                  className="cursor-pointer rounded-[10px] border border-edge-warm bg-[#221d19] px-[11px] py-[7px] text-[11px] font-semibold disabled:opacity-40"
                >
                  Accept
                </button>
              </div>
            );
          })}
          {handoffs.length === 0 && (
            <p className="font-mono text-[11px] text-fg-faint">
              Nobody is in the pipeline — candidates appear here once the front office sends them in.
            </p>
          )}
        </div>
      </Drawer>

      {picked && (
        <p className="shrink-0 font-mono text-[10.5px] text-fg-faint">
          Selected {picked.public_token} · {fullName(picked)} — pick a seat above to assign.
        </p>
      )}
    </div>
  );
}

/** Seats read "LAB A-07"; the lab is already in the tab above. */
function shortSeat(seatCode: string) {
  return seatCode.replace(/^LAB\s+[A-Z]-/, "");
}

function nextLabel(status: CandidateStatus, biometrics: boolean) {
  switch (status) {
    case "frisking":
      return biometrics ? STAGE_LABELS.biometrics : STAGE_LABELS.assigned;
    case "biometrics":
      return STAGE_LABELS.assigned;
    case "assigned":
      return STAGE_LABELS.lab_entry;
    case "lab_entry":
      return STAGE_LABELS.testing;
    case "testing":
      return STAGE_LABELS.completed;
    default:
      return "—";
  }
}
