"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { MaterialsPanel } from "@/components/screens/MaterialsPanel";
import { useConsole } from "@/lib/console-data";
import { clockAt, fullName, refOf } from "@/lib/format";
import { stillHeld } from "@/lib/types";

/**
 * The end of a candidate's day, in one place.
 *
 * The candidate stands up in the lab, so the lab finishes them: stop the
 * clock, count back what the centre gave them, take the locker key, and sign
 * them out. Signing out is what frees the seat's key on the board, so the next
 * candidate can have it straight away. Nobody has to walk back to the check-in
 * desk to close the record.
 *
 * It also serves a candidate already finished but not yet signed out — one
 * from before this screen did both, or one whose sign-out was held up — and
 * then it only signs them out.
 *
 * Held by id, not by value: every rpc() refreshes the console, and a dialog
 * holding the old row would keep offering a step that has already happened.
 */
export function FinishDialog({
  candidateId,
  where,
  seat,
  onClose,
}: {
  candidateId: string;
  /** Recorded on the audit trail: "in the lab", "at the front desk". */
  where: string;
  /** The seat they sat at, if the caller knows it, for the subtitle. */
  seat?: string | null;
  onClose: () => void;
}) {
  const { candidates, center, materials, materialKinds, rpc, canLab } = useConsole();
  const [busy, setBusy] = useState(false);

  const candidate = candidates.find((c) => c.id === candidateId);
  if (!candidate) return null;

  const finished = !!candidate.exam_finished_at || candidate.status === "completed";
  const gone = candidate.status === "signed_out" || candidate.status === "no_show";

  const outstanding = materials.filter((m) => {
    if (m.candidate_id !== candidate.id) return false;
    const kind = materialKinds.find((k) => k.code === m.kind);
    return kind?.returnable && stillHeld(m) > 0;
  });
  const ready = outstanding.length === 0 && !gone;
  const key = candidate.locker_key && candidate.locker_key !== "NIL" ? candidate.locker_key : null;

  const finishAndSignOut = async () => {
    setBusy(true);
    try {
      // Two steps, in order. If the second is refused the candidate is left
      // finished with their seat free, and shows under "Finished · sign out"
      // on the Lab page, where this dialog can be opened again.
      if (!finished) {
        const stopped = await rpc(
          "fets_confirm_finish",
          { p_candidate: candidate.id, p_note: `Finished ${where}` },
        );
        if (!stopped) return;
      }
      const out = await rpc(
        "fets_sign_out",
        { p_candidate: candidate.id, p_note: `Signed out ${where}` },
        key ? `${refOf(candidate)} signed out · locker ${key} is free` : `${refOf(candidate)} signed out`,
      );
      if (out) onClose();
    } finally {
      setBusy(false);
    }
  };

  const label = gone
    ? "Already signed out"
    : !ready
      ? "Take everything back first"
      : finished
        ? `Sign out ${refOf(candidate)}`
        : `Finish and sign out ${refOf(candidate)}`;

  return (
    <Dialog
      open
      title={fullName(candidate)}
      subtitle={[
        refOf(candidate),
        seat,
        finished && candidate.completed_at
          ? `finished ${clockAt(candidate.completed_at, center.timezone)}`
          : "still testing",
      ]
        .filter(Boolean)
        .join(" · ")}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            disabled={!ready || !canLab || busy}
            onClick={finishAndSignOut}
            className={`flex-1 rounded-[14px] px-[22px] py-[15px] text-[14.5px] font-bold ${
              ready && canLab && !busy
                ? "cursor-pointer bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] text-[#0c1711]"
                : "cursor-not-allowed bg-[#1d1d25] text-fg-dim"
            }`}
          >
            {busy ? "Signing out…" : label}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[14px] border border-edge px-[20px] py-[15px] text-[14px] font-semibold text-fg-muted"
          >
            {finished ? "Close" : "Not yet"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-[12px]">
        {!finished && (
          <p className="text-[13px] text-fg-muted">
            This stops their clock, frees the seat, and signs them out. Collect what they were given
            before they leave the lab.
          </p>
        )}

        {key ? (
          <div className="flex items-center gap-[13px] rounded-[16px] border border-gold/40 bg-gold/8 p-[13px]">
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border-2 border-gold bg-gold/12 font-mono text-[12px] font-semibold text-gold-bright">
              K
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">Locker key {key} back</span>
              <span className="block font-mono text-[11.5px] text-fg-faint">
                It shows free for the next candidate as soon as they are signed out
              </span>
            </span>
          </div>
        ) : (
          <p className="font-mono text-[11.5px] text-fg-faint">
            {candidate.locker_key === "NIL" ? "Locker: Nil — no key to collect" : "No locker key issued"}
          </p>
        )}

        <div>
          <span className="mb-[9px] block text-[11px] font-bold tracking-[0.12em] text-fg-faint uppercase">
            Count it back in
          </span>
          <MaterialsPanel candidate={candidate} mode="collect" />
        </div>
      </div>
    </Dialog>
  );
}
