"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { useDrawers } from "@/lib/drawer-store";
import { useConsole } from "@/lib/console-data";
import { STAGE_LABELS, clockAt, fullName, initials, statusChip } from "@/lib/format";
import type { Candidate } from "@/lib/types";

/** Physical locker bank at the front desk. */
const LOCKER_BANK = 24;

export function FrontOfficeScreen() {
  const { candidates, center, call, rpc, canFrontOffice, session } = useConsole();
  const { open, toggle } = useDrawers("front-office", { lockers: false, recent: false });
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates
      .filter(
        (c) =>
          !q ||
          fullName(c).toLowerCase().includes(q) ||
          c.roster_number.toLowerCase().includes(q) ||
          c.public_token.toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [candidates, query]);

  const selected = candidates.find((c) => c.id === pickedId) ?? results[0] ?? null;
  const called = candidates.find((c) => c.id === call?.candidate_id) ?? null;
  const recent = candidates
    .filter((c) => c.check_in_at)
    .sort((a, b) => (a.check_in_at! < b.check_in_at! ? 1 : -1))
    .slice(0, 8);

  const lockersInUse = new Map(
    candidates
      .filter((c) => c.locker_key && !["signed_out", "no_show"].includes(c.status))
      .map((c) => [c.locker_key!, c.public_token]),
  );

  if (!session) return <EmptyRoster />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto md:overflow-visible">
      {called && (
        <div className="flex shrink-0 flex-wrap items-center gap-[14px] rounded-[20px] mint-bg px-[18px] py-[16px] text-[#0c1711]">
          <span className="text-[11px] font-extrabold tracking-[0.18em] uppercase">Send in</span>
          <span className="font-mono text-[26px] font-semibold whitespace-nowrap">{called.public_token}</span>
          <span className="font-serif text-[25px]">{fullName(called)}</span>
          <span className="flex-1" />
          <span className="rounded-[12px] bg-[#0c1711] px-[14px] py-[9px] text-[13px] font-extrabold tracking-[0.06em] text-mint uppercase">
            {call?.room_label ?? "Frisking"}
          </span>
          <button
            type="button"
            disabled={!canFrontOffice}
            onClick={() => rpc("fets_mark_entered", { p_center: center.id }, `${called.public_token} entered`)}
            className="cursor-pointer rounded-[13px] bg-[#0c1711] px-[18px] py-[12px] text-[13px] font-bold text-[#eafaf1] disabled:opacity-50"
          >
            Entered
          </button>
        </div>
      )}

      <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-stretch gap-[14px] md:min-h-0 md:flex-1">
        <div className="flex min-h-0 flex-col rounded-[20px] border border-edge-mid panel-bg p-[14px]">
          <div className="flex shrink-0 items-center gap-[10px] rounded-[16px] border border-edge-strong bg-panel-soft px-[14px] py-[13px]">
            <span className="font-mono text-[14px] text-fg-dim">⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Roster no · name"
              className="min-w-0 flex-1 border-0 bg-transparent text-[15px] outline-none placeholder:text-fg-faint"
            />
          </div>

          <div className="mt-[12px] flex max-h-[340px] min-h-0 flex-col gap-[8px] overflow-x-hidden overflow-y-auto md:max-h-none md:flex-1">
            {results.map((c) => {
              const chip = statusChip(c);
              const active = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPickedId(c.id)}
                  className={`flex shrink-0 cursor-pointer items-center gap-[10px] rounded-[15px] border p-[11px] text-left text-fg ${
                    active ? "border-gold/50 bg-gold/10" : "border-edge bg-panel-soft hover:border-edge-warm"
                  }`}
                >
                  <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] border border-edge-strong bg-[#251f1b] font-mono text-[11px] font-semibold">
                    {initials(fullName(c))}
                  </span>
                  <span className="block min-w-0 flex-1">
                    <span className="block overflow-hidden text-[13.5px] font-semibold text-ellipsis whitespace-nowrap">
                      {fullName(c)}
                    </span>
                    <span className="block overflow-hidden font-mono text-[10px] text-fg-faint text-ellipsis whitespace-nowrap">
                      {c.roster_number}
                      {c.part ? ` · ${c.part}` : ""}
                    </span>
                  </span>
                  <span
                    className={`rounded-[8px] px-[8px] py-[5px] text-[9.5px] font-bold tracking-[0.07em] whitespace-nowrap uppercase ${chip.className}`}
                  >
                    {chip.label}
                  </span>
                </button>
              );
            })}
            {results.length === 0 && (
              <p className="rounded-[15px] border border-dashed border-[#38302a] p-[22px] text-center font-mono text-[11px] text-fg-faint">
                No candidate matches “{query}”
              </p>
            )}
          </div>
        </div>

        {selected ? (
          <CandidateCard
            candidate={selected}
            lockersInUse={lockersInUse}
            lockersOpen={open.lockers}
            onToggleLockers={toggle("lockers")}
          />
        ) : (
          <div className="rounded-[20px] border border-edge-mid panel-bg p-[16px] text-[13px] text-fg-muted">
            Search for a candidate to begin check-in.
          </div>
        )}
      </div>

      <Drawer
        label="Recent check-ins"
        meta={recent.length}
        open={open.recent}
        onToggle={toggle("recent")}
      >
        <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-[10px]">
          {recent.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-[10px] rounded-[14px] border border-edge bg-panel-soft p-[11px]"
            >
              <span className="font-mono text-[12px] font-semibold whitespace-nowrap">{c.public_token}</span>
              <span className="min-w-0 flex-1 overflow-hidden text-[12px] text-fg-muted text-ellipsis whitespace-nowrap">
                {fullName(c)}
              </span>
              <span className="font-mono text-[10px] text-fg-faint">
                {clockAt(c.check_in_at, center.timezone)}
              </span>
            </div>
          ))}
          {recent.length === 0 && (
            <p className="font-mono text-[11px] text-fg-faint">Nobody has checked in yet.</p>
          )}
        </div>
      </Drawer>
    </div>
  );
}

function CandidateCard({
  candidate,
  lockersInUse,
  lockersOpen,
  onToggleLockers,
}: {
  candidate: Candidate;
  lockersInUse: Map<string, string>;
  lockersOpen: boolean;
  onToggleLockers: () => void;
}) {
  const { center, rules, rpc, canFrontOffice } = useConsole();

  const idDone = !!candidate.id_verified_at;
  const keyDone = !!candidate.locker_key;
  const checkedIn = !!candidate.check_in_at;
  const keyNeeded = rules.locker_key_required;
  const armed = idDone && (keyDone || !keyNeeded) && candidate.status === "id_checked";

  const steps = [
    {
      label: "ID cross-verified",
      done: idDone,
      value: idDone ? clockAt(candidate.id_verified_at, center.timezone) : "pending",
      onClick: () =>
        rpc("fets_verify_id", { p_candidate: candidate.id }, `ID verified · ${candidate.public_token}`),
      enabled: canFrontOffice && !idDone,
    },
    {
      label: "Locker key issued",
      done: keyDone,
      value: candidate.locker_key ?? "select",
      onClick: onToggleLockers,
      enabled: canFrontOffice,
    },
    {
      label: "Checked in on roster",
      done: checkedIn,
      value: checkedIn ? clockAt(candidate.check_in_at, center.timezone) : "—",
      onClick: () => {},
      enabled: false,
    },
  ];

  const primaryLabel = checkedIn
    ? candidate.status === "waiting"
      ? "Checked in · waiting for call"
      : `Inside · ${STAGE_LABELS[candidate.status]}`
    : armed
      ? `Check in ${candidate.public_token}`
      : keyNeeded
        ? "Complete ID + locker key"
        : "Complete ID check";

  return (
    <div className="min-h-0 overflow-x-hidden overflow-y-auto rounded-[20px] border border-edge-warm bg-[linear-gradient(160deg,oklch(0.3_0.05_82/0.32),#161311)] px-[16px] pt-[16px] pb-[20px]">
      <div className="flex items-center gap-[12px]">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[17px] gold-bg font-serif text-[21px] text-[#1a1512]">
          {initials(fullName(candidate))}
        </span>
        <span className="block min-w-0 flex-1">
          <span className="block overflow-hidden font-serif text-[27px] leading-[1.1] text-ellipsis whitespace-nowrap">
            {fullName(candidate)}
          </span>
          <span className="block overflow-hidden font-mono text-[10.5px] text-fg-muted text-ellipsis whitespace-nowrap">
            {[candidate.roster_number, candidate.part, candidate.place]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="block shrink-0 pr-[2px] text-right">
          <span className="block font-mono text-[19px] font-semibold whitespace-nowrap text-gold">
            {candidate.public_token}
          </span>
          <span className="block text-[9px] tracking-[0.12em] text-fg-dim uppercase">token</span>
        </span>
      </div>

      <div className="mt-[14px] flex flex-col gap-[8px]">
        {steps.map((step) => (
          <button
            key={step.label}
            type="button"
            disabled={!step.enabled}
            onClick={step.onClick}
            className={`flex items-center gap-[11px] rounded-[15px] border p-[12px] text-left ${
              step.done ? "border-mint/45 bg-mint/6" : "border-edge bg-panel-soft"
            } ${step.enabled ? "cursor-pointer hover:border-edge-warm" : "cursor-default"}`}
          >
            <span
              className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full border font-mono text-[10px] ${
                step.done ? "border-mint/45 bg-mint text-[#0c1711]" : "border-edge bg-panel-soft text-fg-faint"
              }`}
            >
              {step.done ? "✓" : "·"}
            </span>
            <span
              className={`min-w-0 flex-1 text-[13px] font-semibold ${step.done ? "text-fg" : "text-fg-muted"}`}
            >
              {step.label}
            </span>
            <span className="font-mono text-[11px] whitespace-nowrap text-fg-dim">{step.value}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onToggleLockers}
        className="mt-[10px] flex w-full cursor-pointer items-center gap-[10px] rounded-[14px] border border-edge bg-panel-soft px-[12px] py-[11px] text-fg"
      >
        <span className="min-w-0 flex-1 text-left text-[11px] font-bold tracking-[0.11em] text-fg-dim uppercase">
          Locker keys
        </span>
        <span className="font-mono text-[12px] text-gold">{candidate.locker_key ?? "—"}</span>
        <span className="font-mono text-[11px] text-fg-dim">{lockersOpen ? "－" : "＋"}</span>
      </button>

      {lockersOpen && (
        <div className="mt-[8px] grid grid-cols-[repeat(auto-fit,minmax(54px,1fr))] gap-[8px]">
          {Array.from({ length: LOCKER_BANK }, (_, i) => {
            const code = `K-${String(i + 1).padStart(2, "0")}`;
            const holder = lockersInUse.get(code);
            const mine = candidate.locker_key === code;
            const taken = !!holder && !mine;
            return (
              <button
                key={code}
                type="button"
                disabled={taken || !canFrontOffice}
                title={taken ? `Issued to ${holder}` : undefined}
                onClick={() =>
                  rpc("fets_assign_locker", { p_candidate: candidate.id, p_key: code }, `Locker ${code} issued`)
                }
                className={`aspect-square cursor-pointer rounded-[13px] border font-mono text-[12px] font-semibold ${
                  mine
                    ? "border-gold/60 bg-gold/20 text-gold-bright"
                    : taken
                      ? "cursor-not-allowed border-edge bg-panel-soft text-fg-faint/50"
                      : "border-edge bg-panel-soft text-fg-muted hover:border-edge-warm"
                }`}
              >
                {code}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        disabled={!armed || !canFrontOffice}
        onClick={() =>
          rpc("fets_check_in", { p_candidate: candidate.id }, `${candidate.public_token} checked in`)
        }
        className={`mt-[14px] w-full rounded-[15px] p-[15px] text-[14px] font-bold ${
          armed && canFrontOffice
            ? "cursor-pointer bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] text-[#0c1711]"
            : "cursor-default bg-[#221d19] text-fg-dim"
        }`}
      >
        {primaryLabel}
      </button>

      {canFrontOffice && !checkedIn && candidate.status !== "no_show" && (
        <button
          type="button"
          onClick={() =>
            rpc(
              "fets_mark_no_show",
              { p_candidate: candidate.id, p_note: "Marked at front office" },
              `${candidate.public_token} marked no show`,
            )
          }
          className="mt-[8px] w-full cursor-pointer rounded-[13px] border border-edge px-[12px] py-[9px] text-[11px] font-bold tracking-[0.1em] text-fg-faint uppercase hover:border-rust/50 hover:text-rust"
        >
          Mark no show
        </button>
      )}
    </div>
  );
}

function EmptyRoster() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-[20px] border border-edge-mid panel-bg p-[24px] text-center">
      <p className="max-w-[360px] text-[13.5px] text-fg-muted">
        No active roster for this center. Import one from{" "}
        <span className="font-semibold text-gold">Roster</span> to start checking candidates in.
      </p>
    </div>
  );
}
