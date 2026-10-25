"use client";

import { useMemo, useState } from "react";
import { TwinBadge } from "@/components/console/NameTwin";
import { Dialog } from "@/components/ui/Dialog";
import { MaterialsPanel } from "@/components/screens/MaterialsPanel";
import { useConsole } from "@/lib/console-data";
import { SeatGrid } from "@/components/screens/SeatGrid";
import { MAX_ON_THE_WAY, STAGE_LABELS, STAGE_ORDER, calledNotSeated, clockAt, fullName, refOf } from "@/lib/format";
import { seatNumber } from "@/lib/seats";
import { type Candidate, type CandidateStatus, type Workstation, stillHeld } from "@/lib/types";


/**
 * The admin room, as one page and one flow: everyone checked in at the desk
 * lands here by themselves; call the next person, then seat them. Two taps,
 * Call and Seat, and nothing for the front desk to press.
 *
 * Across the top, the day at a glance: who is still to come, who is waiting,
 * called and to be seated, in the lab and done. At the foot, everybody
 * who came today and where each of them is now.
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

  // Called and not seated yet: the only step left is the seat. First called,
  // first seated; anybody left from the old two-step flow comes after.
  const toSeat = useMemo(
    () =>
      candidates
        .filter((c) => calledNotSeated(c) || (c.status === "assigned" && !c.workstation_id))
        .sort((a, b) => (a.called_at ?? a.frisked_at ?? "9").localeCompare(b.called_at ?? b.frisked_at ?? "9")),
    [candidates],
  );
  // Up to five may be called and not yet seated; the sixth waits for a seat to be given.
  const onTheWay = toSeat.filter(calledNotSeated);

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
    // Three stages, three colours, in the order a candidate moves through them:
    // gold to call, sky while waiting, mint to seat. On a wide screen the first
    // two stand on the left and the seat on the right, so the room reads at a
    // glance.
    <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-[14px] overflow-y-auto lg:grid-cols-2 lg:items-start">
      <Glance candidates={candidates} />
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
            ? `${MAX_ON_THE_WAY} called and not seated — seat one first`
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
                <span className="flex min-w-0 items-center gap-[7px]">
                  <span className="block truncate text-[14px] font-semibold">{fullName(c)}</span>
                  <TwinBadge candidate={c} />
                  {c.id === next?.id && (
                    <span className="shrink-0 rounded-full bg-[oklch(0.8_0.11_225)] px-[8px] py-[1px] text-[10px] font-extrabold tracking-[0.12em] text-[#0d1420] uppercase">
                      Next
                    </span>
                  )}
                </span>
                <span className="block truncate font-mono text-[10.5px] text-fg-faint">
                  {refOf(c)} · in {clockAt(c.check_in_at, center.timezone)} ·{" "}
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
                      ? `${MAX_ON_THE_WAY} called and not seated yet`
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

      {/* Called: the next and only step is the seat. */}
      <Stage
        n={3}
        hue={160}
        title="Called · assign a seat"
        live={onTheWay.length > 0}
        right={
          <span className="font-mono text-[12px] text-fg-dim">
            {toSeat.length} to seat · {freeSeats} free
          </span>
        }
      >
        {toSeat.length === 0 ? (
          <p className="py-[10px] text-center text-[12.5px] text-fg-faint">Nobody to seat. Whoever you call appears here; press Assign seat and pick the desk.</p>
        ) : (
          <div className="flex flex-col gap-[8px]">
            {toSeat.map((c) => (
              <div key={c.id} className="rounded-[16px] border border-edge-soft bg-ink/35 p-[12px]">
                <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[8px]">
                  <span className="min-w-0 truncate text-[16px] font-semibold">{fullName(c)}</span>
                  <TwinBadge candidate={c} />
                  <span className="font-mono text-[11px] text-fg-faint">
                    {[refOf(c), c.part, c.locker_key && `KEY ${c.locker_key === "NIL" ? "Nil" : c.locker_key}`].filter(Boolean).join(" · ")}
                  </span>
                  {c.status === "waiting" && (
                    <span className="rounded-full border border-gold/50 bg-gold/10 px-[8px] py-[1px] text-[10.5px] font-bold text-gold">
                      On the TV
                    </span>
                  )}
                  <span className="flex-1" />
                  {seating?.id !== c.id && (
                    <button
                      type="button"
                      disabled={!canLab || freeSeats === 0}
                      onClick={() => setSeatingId(c.id)}
                      className="min-h-[44px] cursor-pointer rounded-[13px] bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] px-[20px] py-[10px] text-[14px] font-bold text-[#0c1711] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {freeSeats === 0 ? "No seat free" : "Assign seat"}
                    </button>
                  )}
                </div>
                <div className="mt-[8px] flex flex-wrap gap-[6px]">
                  <SmallAction onClick={() => setIssuing(c)}>Materials</SmallAction>
                  {c.status === "waiting" && (
                    <>
                      <SmallAction disabled={!canCall} onClick={() => rpc("fets_recall", { p_center: center.id, p_candidate: c.id })}>
                        Call again
                      </SmallAction>
                      <SmallAction
                        disabled={!canCall}
                        onClick={() => rpc("fets_clear_call", { p_center: center.id, p_candidate: c.id }, `${refOf(c)} call cancelled`)}
                      >
                        Cancel call
                      </SmallAction>
                    </>
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

      <Everyone candidates={candidates} workstations={workstations} timezone={center.timezone} />

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
  wide = false,
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
  /** Across both columns on a wide screen. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        borderColor: `oklch(0.72 0.12 ${hue} / 0.45)`,
        background: `linear-gradient(160deg, oklch(0.32 0.07 ${hue} / 0.5), oklch(0.17 0.02 ${hue} / 0.8) 55%)`,
        boxShadow: `0 20px 50px -30px oklch(0.6 0.14 ${hue} / 0.7), inset 0 1px 0 oklch(0.9 0.05 ${hue} / 0.12)`,
      }}
      className={`relative flex min-w-0 flex-col overflow-hidden rounded-[22px] border ${wide ? "lg:col-span-2" : ""}`}
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


type Where = "expected" | "desk" | "waiting" | "seat" | "lab" | "done" | "no_show";

/** Where somebody is in the day, in the words the room uses. */
function whereIs(c: Candidate): Where {
  if (c.status === "no_show") return "no_show";
  if (c.status === "scheduled") return "expected";
  if (c.status === "arrived" || c.status === "id_checked") return "desk";
  if (c.status === "completed" || c.status === "signed_out") return "done";
  if (calledNotSeated(c)) return "seat";
  if (c.status === "waiting") return "waiting";
  if (c.status === "assigned" && !c.workstation_id) return "seat";
  return "lab";
}

const WHERE: Record<Where, { label: string; hue: number }> = {
  expected: { label: "Still to come", hue: 260 },
  desk: { label: "At the desk", hue: 60 },
  waiting: { label: "Checked in · waiting", hue: 225 },
  seat: { label: "Called · to seat", hue: 160 },
  lab: { label: "In the lab", hue: 85 },
  done: { label: "Finished", hue: 140 },
  no_show: { label: "No-show", hue: 25 },
};

/** The day in one line of numbers, from the door to the way out. */
function Glance({ candidates }: { candidates: Candidate[] }) {
  const count = new Map<Where, number>();
  for (const c of candidates) count.set(whereIs(c), (count.get(whereIs(c)) ?? 0) + 1);
  const came = candidates.filter((c) => !["expected", "no_show"].includes(whereIs(c))).length;
  return (
    <section className="flex flex-wrap gap-[8px] lg:col-span-2">
      <span className="flex min-w-[110px] flex-col justify-center rounded-[16px] border border-edge-mid bg-panel-soft px-[14px] py-[9px]">
        <span className="font-serif text-[26px] leading-none tabular-nums">{came}</span>
        <span className="text-[11px] font-semibold text-fg-dim">came today</span>
      </span>
      {(Object.keys(WHERE) as Where[]).map((w) => (
        <span
          key={w}
          style={{
            borderColor: `oklch(0.72 0.12 ${WHERE[w].hue} / 0.45)`,
            background: `oklch(0.3 0.06 ${WHERE[w].hue} / 0.35)`,
          }}
          className={`flex min-w-[110px] flex-1 flex-col justify-center rounded-[16px] border px-[14px] py-[9px] ${
            (count.get(w) ?? 0) === 0 ? "opacity-45" : ""
          }`}
        >
          <span style={{ color: `oklch(0.88 0.1 ${WHERE[w].hue})` }} className="font-serif text-[26px] leading-none tabular-nums">
            {count.get(w) ?? 0}
          </span>
          <span className="text-[11px] font-semibold text-fg-muted">{WHERE[w].label}</span>
        </span>
      ))}
    </section>
  );
}

/**
 * Everybody who came today and where each of them is now, in the order they
 * checked in — the answer to "has she been through security yet?" without
 * opening anything.
 */
function Everyone({
  candidates,
  workstations,
  timezone,
}: {
  candidates: Candidate[];
  workstations: Workstation[];
  timezone: string;
}) {
  const [all, setAll] = useState(false);
  const queue = candidates
    .filter((c) => whereIs(c) === "waiting")
    .sort((a, b) => (a.check_in_at ?? "").localeCompare(b.check_in_at ?? ""))
    .map((c) => c.id);
  const rows = candidates
    .filter((c) => all || !["expected", "no_show"].includes(whereIs(c)))
    .sort(
      (a, b) =>
        (a.check_in_at ?? "9").localeCompare(b.check_in_at ?? "9") ||
        (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "") ||
        fullName(a).localeCompare(fullName(b)),
    );
  const hidden = candidates.filter((c) => ["expected", "no_show"].includes(whereIs(c))).length;

  const detail = (c: Candidate) => {
    const w = whereIs(c);
    if (w === "waiting") return `Waiting · ${queue.indexOf(c.id) + 1} in line`;
    if (w === "lab") {
      const ws = workstations.find((x) => x.id === c.workstation_id);
      return ws ? `Seat ${seatNumber(ws)} · ${ws.lab_name ?? "lab"}` : WHERE.lab.label;
    }
    return WHERE[w].label;
  };

  return (
    <Stage
      n={4}
      hue={250}
      title="Everyone today"
      flush
      right={
        hidden > 0 ? (
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            className="cursor-pointer rounded-[10px] border border-edge px-[10px] py-[5px] text-[11px] font-semibold text-fg-dim hover:text-fg"
          >
            {all ? "Only who came" : `Show still to come and no-shows (${hidden})`}
          </button>
        ) : null
      }
      wide
    >
      <div className="max-h-[48vh] overflow-y-auto">
        {rows.map((c) => {
          const w = whereIs(c);
          return (
            <div
              key={c.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[12px] gap-y-[4px] border-b border-edge-soft/60 px-[16px] py-[9px] sm:grid-cols-[minmax(0,1fr)_110px_92px_210px]"
            >
              <span className="flex min-w-0 items-center gap-[7px]">
                <span className="truncate text-[13.5px] font-semibold">{c.placeholder ? "Booked slot" : fullName(c)}</span>
                <TwinBadge candidate={c} />
              </span>
              <span className="hidden font-mono text-[11px] text-fg-faint sm:block">{refOf(c)}</span>
              <span className="hidden font-mono text-[11px] text-fg-dim sm:block">
                {c.check_in_at ? `in ${clockAt(c.check_in_at, timezone)}` : "—"}
              </span>
              <span
                style={{
                  color: `oklch(0.88 0.1 ${WHERE[w].hue})`,
                  borderColor: `oklch(0.72 0.12 ${WHERE[w].hue} / 0.5)`,
                  background: `oklch(0.32 0.06 ${WHERE[w].hue} / 0.35)`,
                }}
                className="justify-self-end truncate rounded-full border px-[10px] py-[3px] text-[11.5px] font-semibold sm:justify-self-start"
              >
                {detail(c)}
              </span>
            </div>
          );
        })}
        {rows.length === 0 && <p className="p-[22px] text-center text-[12.5px] text-fg-faint">Nobody has checked in yet today.</p>}
      </div>
    </Stage>
  );
}

function SmallAction({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded-[10px] border border-edge px-[10px] py-[5px] text-[11.5px] font-semibold text-fg-dim hover:text-fg disabled:opacity-40"
    >
      {children}
    </button>
  );
}
