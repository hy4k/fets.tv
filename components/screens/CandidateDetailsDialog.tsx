"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { useConsole } from "@/lib/console-data";
import { fullName, refOf } from "@/lib/format";
import type { Candidate } from "@/lib/types";

const PARTS = ["PART 1", "PART 2"];

/**
 * One form for two jobs: adding somebody who is not on the board's list, and
 * filling in what the board's list left out. The name is a single box here
 * because it is a single column everywhere else — the split into first and last
 * exists only because the database keeps them apart.
 */
export function CandidateDetailsDialog({
  open,
  candidate,
  onClose,
  onLockerKey,
}: {
  open: boolean;
  /** Null means a new candidate. */
  candidate: Candidate | null;
  onClose: () => void;
  /** Opens the key board for this candidate; shown once they are checked in. */
  onLockerKey?: () => void;
}) {
  const { center, rpc, canFrontOffice } = useConsole();
  const editing = candidate !== null;
  const router = useRouter();
  // On the check-in page the new person is pinned at the top already.
  const atDesk = usePathname() === "/front-office";

  const [name, setName] = useState(candidate ? fullName(candidate) : "");
  const [number, setNumber] = useState(candidate?.roster_number ?? "");
  const [part, setPart] = useState(candidate?.part ?? "");
  const [phone, setPhone] = useState(candidate?.phone ?? "");
  const [place, setPlace] = useState(candidate?.place ?? "");
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();

  async function save(thenCheckIn = false) {
    if (!trimmed) return;
    setBusy(true);

    // The database keeps a first and a last name, so the single box is split on
    // its first space: "Fatima Noor Rahman" becomes "Fatima" and "Noor Rahman",
    // which joins back to exactly what was typed.
    const cut = trimmed.indexOf(" ");
    const first = cut === -1 ? trimmed : trimmed.slice(0, cut);
    const last = cut === -1 ? "" : trimmed.slice(cut + 1).trim();

    // The confirmation number has its own check (no two alike today), so it
    // is saved first and the rest only if it went through.
    if (editing && number.trim() && number.trim() !== candidate.roster_number) {
      const fixed = await rpc(
        "fets_set_confirmation_number",
        { p_candidate: candidate.id, p_number: number.trim() },
        "Confirmation number saved",
      );
      if (!fixed) {
        setBusy(false);
        return;
      }
    }

    const ok = editing
      ? await rpc(
          "fets_update_candidate_details",
          {
            p_candidate: candidate.id,
            p_first_name: first,
            p_last_name: last,
            p_part: part,
            p_phone: phone,
            p_place: place,
          },
          "Details saved",
        )
      : await rpc(
          "fets_add_candidate",
          {
            p_center: center.id,
            p_first_name: first,
            p_last_name: last,
            p_part: part,
            p_phone: phone,
            p_place: place,
          },
          `${trimmed} added to today's list`,
        );

    setBusy(false);
    if (ok) {
      onClose();
      if (thenCheckIn) router.push("/front-office");
    }
  }

  return (
    <Dialog
      open={open}
      title={editing ? "Edit details" : "Add a walk-in candidate"}
      subtitle={
        editing
          ? `Confirmation ${refOf(candidate)}`
          : "For somebody who is not on the uploaded list"
      }
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            disabled={busy || !trimmed || !canFrontOffice}
            onClick={() => save(!editing && !atDesk)}
            className="flex-1 cursor-pointer rounded-[14px] gold-bg px-[22px] py-[14px] text-[14px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Saving…" : editing ? "Save changes" : atDesk ? "Add to today's list" : "Add & check in"}
          </button>
          {!editing && !atDesk && (
            <button
              type="button"
              disabled={busy || !trimmed || !canFrontOffice}
              onClick={() => save(false)}
              className="cursor-pointer rounded-[14px] border border-edge-warm px-[18px] py-[14px] text-[14px] font-semibold text-fg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add only
            </button>
          )}
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
      <div className="flex flex-col gap-[16px]">
        <Field label="Name" hint={editing ? undefined : "First and last name together"}>
          <input
            autoFocus={!editing}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fatima Noor"
            className="w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] text-[16px] outline-none placeholder:text-fg-faint focus:border-accent/50"
          />
        </Field>

        {editing && (
          <Field label="Confirmation no." hint="From the exam provider">
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] font-mono text-[16px] outline-none placeholder:text-fg-faint focus:border-accent/50"
            />
          </Field>
        )}

        <Field label="Part">
          <div className="flex flex-wrap gap-[8px]">
            {PARTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPart(part === p ? "" : p)}
                className={`cursor-pointer rounded-[12px] border px-[16px] py-[11px] text-[13px] font-semibold transition-colors ${
                  part === p
                    ? "border-gold/55 bg-gold/12 text-gold-bright"
                    : "border-edge bg-panel-soft text-fg-muted hover:border-edge-warm"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            value={part}
            onChange={(e) => setPart(e.target.value)}
            placeholder="Or type it: Listening, MCQ, Part A…"
            className="w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[11px] text-[14px] outline-none placeholder:text-fg-faint focus:border-accent/50"
          />
        </Field>

        <Field label="Contact number" hint="Leave blank if it is not known yet">
          <input
            value={phone}
            inputMode="tel"
            onChange={(e) => setPhone(e.target.value)}
            placeholder="98470 00000"
            className="w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] font-mono text-[16px] outline-none placeholder:text-fg-faint focus:border-accent/50"
          />
        </Field>

        <Field label="Place">
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="Calicut"
            className="w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] text-[16px] outline-none placeholder:text-fg-faint focus:border-accent/50"
          />
        </Field>

        {editing && onLockerKey && candidate.check_in_at && !["completed", "signed_out", "no_show"].includes(candidate.status) && (
          <div className="flex items-center gap-[12px] rounded-[14px] border border-gold/35 bg-gold/8 px-[14px] py-[11px]">
            <span className="min-w-0 flex-1">
              <span className="block text-[11.5px] font-semibold text-fg-dim">Locker key</span>
              <span className="block font-mono text-[15px] font-semibold text-gold-bright">
                {candidate.locker_key ?? "None yet"}
              </span>
            </span>
            <button
              type="button"
              disabled={!canFrontOffice}
              onClick={onLockerKey}
              className="cursor-pointer rounded-[12px] border border-gold/50 px-[14px] py-[9px] text-[13px] font-semibold text-gold-bright hover:border-gold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {candidate.locker_key ? "Change key" : "Give a key"}
            </button>
          </div>
        )}

        {!canFrontOffice && (
          <p className="text-[12.5px] text-gold">
            Your role cannot change candidate details.
          </p>
        )}
      </div>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-[8px]">
      <span className="text-[11.5px] font-semibold text-fg-dim">
        {label}
        {hint && <span className="ml-[8px] font-normal text-fg-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
