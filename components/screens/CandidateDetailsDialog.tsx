"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useConsole } from "@/lib/console-data";
import { fullName } from "@/lib/format";
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
}: {
  open: boolean;
  /** Null means a new candidate. */
  candidate: Candidate | null;
  onClose: () => void;
}) {
  const { center, rpc, canFrontOffice } = useConsole();
  const editing = candidate !== null;

  const [name, setName] = useState(candidate ? fullName(candidate) : "");
  const [part, setPart] = useState(candidate?.part ?? "");
  const [phone, setPhone] = useState(candidate?.phone ?? "");
  const [place, setPlace] = useState(candidate?.place ?? "");
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();

  async function save() {
    if (!trimmed) return;
    setBusy(true);

    // The database keeps a first and a last name, so the single box is split on
    // its first space: "Fatima Noor Rahman" becomes "Fatima" and "Noor Rahman",
    // which joins back to exactly what was typed.
    const cut = trimmed.indexOf(" ");
    const first = cut === -1 ? trimmed : trimmed.slice(0, cut);
    const last = cut === -1 ? "" : trimmed.slice(cut + 1).trim();

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
    if (ok) onClose();
  }

  return (
    <Dialog
      open={open}
      title={editing ? "Edit details" : "Add a candidate"}
      subtitle={
        editing
          ? `${candidate.public_token} · ${candidate.roster_number}`
          : "For somebody who is not on the uploaded list"
      }
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            disabled={busy || !trimmed || !canFrontOffice}
            onClick={save}
            className="flex-1 cursor-pointer rounded-[14px] gold-bg px-[22px] py-[14px] text-[14px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Add to today's list"}
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
      <div className="flex flex-col gap-[16px]">
        <Field label="Name" hint={editing ? undefined : "First and last name together"}>
          <input
            autoFocus={!editing}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fatima Noor"
            className="w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] text-[16px] outline-none placeholder:text-fg-faint focus:border-gold/50"
          />
        </Field>

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
            {part !== "" && !PARTS.includes(part) && (
              <span className="rounded-[12px] border border-edge-warm bg-panel-soft px-[16px] py-[11px] text-[13px]">
                {part}
              </span>
            )}
          </div>
        </Field>

        <Field label="Contact number" hint="Leave blank if it is not known yet">
          <input
            value={phone}
            inputMode="tel"
            onChange={(e) => setPhone(e.target.value)}
            placeholder="98470 00000"
            className="w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] font-mono text-[16px] outline-none placeholder:text-fg-faint focus:border-gold/50"
          />
        </Field>

        <Field label="Place">
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="Calicut"
            className="w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] text-[16px] outline-none placeholder:text-fg-faint focus:border-gold/50"
          />
        </Field>

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
