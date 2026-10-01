"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { MaterialsPanel } from "@/components/screens/MaterialsPanel";
import { useConsole } from "@/lib/console-data";
import { SeatGrid } from "@/components/screens/SeatGrid";
import { MAX_ON_THE_WAY, STAGE_LABELS, STAGE_ORDER, fullName, refOf } from "@/lib/format";
import { type Candidate, type CandidateStatus, stillHeld } from "@/lib/types";

/** Everyone who has walked in from the desk but has nowhere to sit yet. */
const UNSEATED = ["frisking", "biometrics", "assigned"];

/** Where a called candidate goes first. */
const GATE = "Security & Biometrics";

/**
 * The admin room, as one page and one flow: call the next person, watch them
 * walk to the frisking gate, then seat them — all from here.
 *
 * The call button stays at the top. Once pressed, the person called is held in
 * a banner at the foot — "Security & Biometrics" — until the front desk marks them
 * in; then the same place becomes their seat: press, pick the seat, confirm.
 */
export function AdminRoomScreen() {
  const { candidates, center, rpc, isAdmin, canCall, canLab, session, rules, materials, workstations } =
    useConsole();
  const [issuing, setIssuing] = useState<Candidate | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [seatingId, setSeatingId] = useState<string | null>(null);
  // Called forward only with a locker key or Nil; the database refuses
  // otherwise, and the button says why before anybody presses it.
  const needsKey = (c: Candidate) => rules.locker_key_required && !c.locker_key;

  // The order people are called in is the order they were checked in, so the
  // numbers on screen are the numbers the hall is waiting on.
  const pending = useMemo(
    () =>
      candidates
        .filter((c) => c.status === "waiting" && !c.called_at)
        .sort((a, b) => (a.check_in_at ?? "").localeCompare(b.check_in_at ?? "")),
    [candidates],
  );

  const toSeat = useMemo(
    () =>
      candidates
        .filter((c) => UNSEATED.includes(c.status) && !c.workstation_id)
        .sort((a, b) => (a.frisked_at ?? a.check_in_at ?? "").localeCompare(b.frisked_at ?? b.check_in_at ?? "")),
    [candidates],
  );


  // Called and not yet marked in by the front office, newest first. Up to five
  // may be on their way; the newest is the big name on the TV.
  const onTheWay = useMemo(
    () =>
      candidates
        .filter((c) => c.status === "waiting" && c.called_at)
        .sort((a, b) => (b.called_at ?? "").localeCompare(a.called_at ?? "")),
    [candidates],
  );
  // Up to five may be called back to back; the sixth waits for one to go in.
  const full = onTheWay.length >= MAX_ON_THE_WAY;
  const awaitingEntry = full;
  // The next person who can actually go: somebody still waiting on a locker
  // key keeps their place in the list but does not hold up everyone behind.
  const next = pending.find((c) => !needsKey(c)) ?? null;
  const keyless = pending.filter(needsKey).length;
  const seating = toSeat.find((c) => c.id === seatingId) ?? null;
  const freeSeats = workstations.filter((w) => w.lab_id && w.status === "free").length;

  if (!session) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-[20px] border border-edge-mid panel-bg p-[24px] text-center">
        <p className="max-w-[360px] text-[13.5px] text-fg-muted">
          No active roster for this center. Bring one in from{" "}
          <span className="font-semibold text-gold">Roster</span> to start calling.
        </p>
      </div>
    );
  }

  const unitsOut = (c: Candidate) =>
    materials.filter((m) => m.candidate_id === c.id).reduce((sum, m) => sum + stillHeld(m), 0);

  return (
    // Four stages, four colours, in the order a candidate moves through them:
    // gold to call, sky while waiting, violet at the gate, mint to seat. On a
    // wide screen the first two stand on the left and the last two on the
    // right, so the room reads at a glance.
    <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-[14px] overflow-y-auto lg:grid-cols-2 lg:items-start">
      <div className="flex min-w-0 flex-col gap-[14px]">
      {/* The call, always here. */}
      <Stage n={1} hue={80} title="The call" right={isAdmin && (
            <button
              type="button"
              onClick={() => setOverriding(true)}
              className="cursor-pointer rounded-[10px] border border-edge px-[10px] py-[6px] text-[11px] font-semibold text-fg-dim hover:border-rust/50 hover:text-rust"
            >
              Override
            </button>
          )}>
        <button
          type="button"
          disabled={!canCall || !next || awaitingEntry}
          onClick={() =>
            next && rpc("fets_call_candidate", { p_candidate: next.id }, `Calling ${refOf(next)}`)
          }
          className={`w-full rounded-[16px] px-[22px] py-[18px] text-[16px] font-bold ${
            canCall && next && !awaitingEntry
              ? "cursor-pointer gold-bg text-[#1a1512]"
              : "cursor-not-allowed bg-[#1d1d25] text-fg-dim"
          }`}
        >
          {full
            ? `${MAX_ON_THE_WAY} on their way — the front office sends one in first`
            : next
              ? `Call ${fullName(next)} · ${refOf(next)}`
              : keyless > 0
                ? `${keyless === 1 ? "The one waiting needs" : `All ${keyless} waiting need`} a locker key first`
                : "Nobody is waiting to be called"}
        </button>
        <p className="mt-[9px] text-center text-[12px] text-fg-faint">
          {pending.length > 0
            ? `${pending.length} waiting${keyless ? ` · ${keyless} without a locker key` : ""}`
            : "Everyone checked in has been called."}
        </p>
      </Stage>

      {/* The queue, numbered the way the hall counts it. */}
      <Stage n={2} hue={225} title="Waiting to be called" right={<Count n={pending.length} hue={225} />} flush>
        <div className="max-h-[56vh] overflow-x-hidden overflow-y-auto">
          {pending.map((c, i) => (
            <div key={c.id} className="flex items-center gap-[11px] border-b border-edge-soft/60 px-[14px] py-[11px] md:px-[16px]">
              <span
                className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] font-mono text-[12px] font-bold ${
                  i === 0 ? "bg-[oklch(0.8_0.11_225)] text-[#0d1420]" : "bg-panel-soft text-fg-dim"
                }`}
              >
                {i + 1}
              </span>
              <span className="block min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{fullName(c)}</span>
                <span className="block truncate font-mono text-[10.5px] text-fg-faint">
                  {refOf(c)} ·{" "}
                  {c.locker_key ? (
                    `KEY ${c.locker_key === "NIL" ? "Nil" : c.locker_key}`
                  ) : (
                    <span className="font-semibold text-rust">NO KEY</span>
                  )}
                </span>
              </span>
              {/* Materials are handed over here, in the hold, not at the desk. */}
              <button
                type="button"
                onClick={() => setIssuing(c)}
                className="shrink-0 cursor-pointer rounded-[12px] border border-edge px-[12px] py-[9px] text-[12px] font-semibold text-fg-muted hover:border-edge-warm hover:text-fg"
              >
                Materials
                {unitsOut(c) > 0 && <span className="ml-[6px] font-mono text-accent">{unitsOut(c)}</span>}
              </button>
              <button
                type="button"
                disabled={!canCall || awaitingEntry || needsKey(c)}
                title={
                  needsKey(c)
                    ? "Issue a locker key or Nil first"
                    : awaitingEntry
                      ? `${MAX_ON_THE_WAY} already on their way`
                      : undefined
                }
                onClick={() => rpc("fets_call_candidate", { p_candidate: c.id }, `Calling ${refOf(c)}`)}
                className="shrink-0 cursor-pointer rounded-[12px] gold-bg px-[15px] py-[10px] text-[12.5px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Call
              </button>
            </div>
          ))}
          {pending.length === 0 && (
            <p className="p-[26px] text-center text-[13px] text-fg-faint">
              Nobody is waiting. The front office checks people in.
            </p>
          )}
        </div>
      </Stage>
      </div>

      <div className="flex min-w-0 flex-col gap-[14px]">

      {/* Called: on the way to the gate. The front desk marks each one in. */}
      <Stage
        n={3}
        hue={290}
        title={GATE}
        live={onTheWay.length > 0}
        right={<span className="font-mono text-[12px] text-fg-dim">{onTheWay.length} of {MAX_ON_THE_WAY} on their way</span>}
      >
        {onTheWay.length === 0 ? (
          <p className="py-[10px] text-center text-[12.5px] text-fg-faint">Nobody called yet. Call from the list on the left.</p>
        ) : (
        <>
          <div className="flex flex-col gap-[8px]">
            {onTheWay.map((c, i) => (
              <div key={c.id} className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px] rounded-[16px] border border-edge-soft bg-ink/35 px-[14px] py-[10px]">
                <span className={`min-w-0 truncate font-display leading-none ${i === 0 ? "text-[26px]" : "text-[20px] text-fg-muted"}`}>
                  {fullName(c)}
                </span>
                <span className="font-mono text-[12.5px] leading-none text-fg-dim">{refOf(c)}</span>
                <span className="flex-1" />
                <span className="flex flex-wrap gap-[8px]">
                  <button
                    type="button"
                    onClick={() => setIssuing(c)}
                    className="cursor-pointer rounded-[12px] border border-edge-warm bg-ink/40 px-[12px] py-[9px] text-[12px] font-semibold"
                  >
                    Materials
                  </button>
                  <button
                    type="button"
                    disabled={!canCall}
                    onClick={() => rpc("fets_recall", { p_center: center.id, p_candidate: c.id })}
                    className="cursor-pointer rounded-[12px] border border-edge-warm bg-ink/40 px-[12px] py-[9px] text-[12px] font-semibold disabled:opacity-40"
                  >
                    Call again
                  </button>
                  <button
                    type="button"
                    disabled={!canCall}
                    onClick={() => rpc("fets_clear_call", { p_center: center.id, p_candidate: c.id }, `${refOf(c)} call cancelled`)}
                    className="cursor-pointer rounded-[12px] border border-edge px-[12px] py-[9px] text-[12px] font-semibold text-fg-muted disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-[10px] text-[12px] text-fg-dim">The front office sends each one in; then they can be seated below.</p>
        </>
        )}
      </Stage>

      {/* In: the same place becomes their seat. */}
      <Stage
        n={4}
        hue={160}
        title="Assign a seat"
        right={<span className="font-mono text-[12px] text-fg-dim">{toSeat.length} to seat · {freeSeats} free</span>}
      >
        {toSeat.length === 0 ? (
          <p className="py-[10px] text-center text-[12.5px] text-fg-faint">Nobody to seat. They appear here once sent in.</p>
        ) : (
          <div className="flex flex-col gap-[8px]">
            {toSeat.map((c) => (
              <div key={c.id} className="rounded-[16px] border border-edge-soft bg-ink/35 p-[12px]">
                <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[8px]">
                  <span className="min-w-0 truncate text-[16px] font-semibold">{fullName(c)}</span>
                  <span className="font-mono text-[11px] text-fg-faint">
                    {[refOf(c), c.part, c.locker_key && `KEY ${c.locker_key === "NIL" ? "Nil" : c.locker_key}`].filter(Boolean).join(" · ")}
                  </span>
                  <span className="flex-1" />
                  {seating?.id !== c.id && (
                    <button
                      type="button"
                      disabled={!canLab || freeSeats === 0}
                      onClick={() => setSeatingId(c.id)}
                      className="cursor-pointer rounded-[13px] bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] px-[18px] py-[11px] text-[13.5px] font-bold text-[#0c1711] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {freeSeats === 0 ? "No seat free" : "Assign seat"}
                    </button>
                  )}
                </div>
                {seating?.id === c.id && (
                  <div className="mt-[12px] border-t border-edge-soft pt-[12px]">
                    <SeatGrid candidate={c} onDone={() => setSeatingId(null)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Stage>
      </div>

      {issuing && (
        <Dialog
          open
          title={`Materials · ${refOf(issuing)}`}
          subtitle={`${fullName(issuing)} · what goes into the hall with them`}
          onClose={() => setIssuing(null)}
          width={480}
        >
          <MaterialsPanel candidate={candidates.find((c) => c.id === issuing.id) ?? issuing} mode="issue" />
        </Dialog>
      )}

      {overriding && (
        <Dialog open title="Admin override" subtitle="Move somebody to another stage, with a reason" onClose={() => setOverriding(false)} width={620}>
          <OverridePanel />
        </Dialog>
      )}
    </div>
  );
}

function OverridePanel() {
  const { candidates, rpc } = useConsole();
  const [candidateId, setCandidateId] = useState("");
  const [status, setStatus] = useState<CandidateStatus>("waiting");
  const [note, setNote] = useState("");

  const selectable = candidates.filter((c) => c.status !== "scheduled");

  return (
    <div className="flex flex-wrap items-end gap-[10px]">
      <label className="flex min-w-[200px] flex-1 flex-col gap-[6px]">
        <span className="text-[9.5px] font-bold tracking-[0.12em] text-fg-dim uppercase">Candidate</span>
        <select
          value={candidateId}
          onChange={(e) => setCandidateId(e.target.value)}
          className="rounded-[12px] border border-edge-strong bg-panel-soft px-[11px] py-[11px] text-[12.5px] outline-none"
        >
          <option value="">Select…</option>
          {selectable.map((c) => (
            <option key={c.id} value={c.id}>
              {refOf(c)} · {fullName(c)} · {STAGE_LABELS[c.status]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-[150px] flex-col gap-[6px]">
        <span className="text-[9.5px] font-bold tracking-[0.12em] text-fg-dim uppercase">Move to</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as CandidateStatus)}
          className="rounded-[12px] border border-edge-strong bg-panel-soft px-[11px] py-[11px] text-[12.5px] outline-none"
        >
          {[...STAGE_ORDER, "no_show" as const].map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-[220px] flex-[2] flex-col gap-[6px]">
        <span className="text-[9.5px] font-bold tracking-[0.12em] text-fg-dim uppercase">Reason</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why is this being changed?"
          className="rounded-[12px] border border-edge-strong bg-panel-soft px-[11px] py-[11px] text-[12.5px] outline-none placeholder:text-fg-faint"
        />
      </label>

      <button
        type="button"
        disabled={!candidateId || note.trim().length === 0}
        onClick={async () => {
          const ok = await rpc(
            "fets_admin_override",
            { p_candidate: candidateId, p_status: status, p_note: note.trim() },
            "Override recorded",
          );
          if (ok) setNote("");
        }}
        className="cursor-pointer rounded-[12px] border border-rust/50 bg-rust/15 px-[16px] py-[12px] text-[12px] font-bold text-rust disabled:opacity-40"
      >
        Apply override
      </button>
    </div>
  );
}

/**
 * One stage of the admin room: a numbered, coloured card. The hue runs through
 * the border, the wash behind it and the number, so the four never blur into
 * one grey list.
 */
function Stage({
  n,
  hue,
  title,
  right,
  live = false,
  flush = false,
  children,
}: {
  n: number;
  hue: number;
  title: string;
  right?: React.ReactNode;
  /** Something is happening here now: the number pulses. */
  live?: boolean;
  /** The body runs edge to edge, for a list. */
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        borderColor: `oklch(0.72 0.12 ${hue} / 0.45)`,
        background: `linear-gradient(160deg, oklch(0.32 0.07 ${hue} / 0.5), oklch(0.17 0.02 ${hue} / 0.8) 55%)`,
        boxShadow: `0 20px 50px -30px oklch(0.6 0.14 ${hue} / 0.7), inset 0 1px 0 oklch(0.9 0.05 ${hue} / 0.12)`,
      }}
      className="relative flex min-w-0 flex-col overflow-hidden rounded-[22px] border"
    >
      <div
        style={{ borderColor: `oklch(0.72 0.12 ${hue} / 0.25)` }}
        className="flex shrink-0 items-center gap-[10px] border-b px-[16px] py-[12px] md:px-[18px]"
      >
        <span
          style={{ background: `oklch(0.8 0.12 ${hue})` }}
          className={`relative flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[9px] font-mono text-[12.5px] font-bold text-[#101015] ${
            live ? "motion-safe:animate-pulse" : ""
          }`}
        >
          {n}
        </span>
        <span style={{ color: `oklch(0.86 0.1 ${hue})` }} className="text-[12px] font-bold tracking-[0.16em] uppercase">
          {title}
        </span>
        <span className="flex-1" />
        {right}
      </div>
      <div className={flush ? "" : "p-[14px] md:px-[18px]"}>{children}</div>
    </section>
  );
}

function Count({ n, hue }: { n: number; hue: number }) {
  return (
    <span style={{ color: `oklch(0.86 0.1 ${hue})` }} className="font-mono text-[15px] font-semibold">
      {n}
    </span>
  );
}

