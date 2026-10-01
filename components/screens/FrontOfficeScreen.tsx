"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { LockerKeyDialog } from "@/components/screens/LockersScreen";
import { MaterialsPanel } from "@/components/screens/MaterialsPanel";
import { CandidateDetailsDialog } from "@/components/screens/CandidateDetailsDialog";
import { useConsole } from "@/lib/console-data";
import {
  WAITING_TO_CHECK_IN,
  clockAt,
  fullName,
  joinedLate,
  lateFirst,
  statusChip,
  refOf,
} from "@/lib/format";
import { type Candidate, stillHeld } from "@/lib/types";

const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "waiting", label: "To check in" },
  { key: "inside", label: "Inside" },
  { key: "done", label: "Finished" },
  { key: "no_show", label: "No show" },
  { key: "incomplete", label: "Missing details" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function matches(c: Candidate, filter: FilterKey) {
  if (filter === "all") return true;
  if (filter === "incomplete") return !c.part || !c.phone || !c.place;
  if (filter === "waiting") return WAITING_TO_CHECK_IN.includes(c.status);
  if (filter === "inside")
    return ["waiting", "frisking", "biometrics", "assigned", "lab_entry", "testing"].includes(c.status);
  if (filter === "done") return ["completed", "signed_out"].includes(c.status);
  return c.status === "no_show";
}

/** The columns from md up: action first, so the button is the first thing seen. */
const COLUMNS = "112px minmax(0,1.5fr) minmax(0,1.1fr) 64px 124px 76px 112px 40px";

/**
 * The Check-in: everyone booked today, every detail about them, and the one
 * button that matters at the front of each row.
 *
 * This used to be three pages — the list, the check-in, the locker key. Now
 * the list is the check-in: press Check in, look at the ID, and the key board
 * opens by itself. Any detail, including the key, stays editable all day from
 * the row's own edit button.
 */
export function FrontOfficeScreen() {
  const { candidates, canFrontOffice, session } = useConsole();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [signingOutId, setSigningOutId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Opened by itself the moment a check-in lands, and from the key chip.
  const [keyForId, setKeyForId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const out = {} as Record<FilterKey, number>;
    for (const f of FILTERS) out[f.key] = candidates.filter((c) => matches(c, f.key)).length;
    return out;
  }, [candidates]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Walk-ins and late bookings first while they wait, so none is missed.
    return lateFirst(candidates, session)
      .filter((c) => matches(c, filter))
      .filter(
        (c) =>
          !q ||
          fullName(c).toLowerCase().includes(q) ||
          c.roster_number.toLowerCase().includes(q) ||
          (c.phone ?? "").includes(q) ||
          (c.locker_key ?? "").toLowerCase().includes(q),
      );
  }, [candidates, filter, query, session]);

  const lateWaiting = useMemo(
    () => lateFirst(candidates, session).filter((c) => WAITING_TO_CHECK_IN.includes(c.status) && joinedLate(c, session)),
    [candidates, session],
  );

  const checkingIn = candidates.find((c) => c.id === checkingInId) ?? null;
  const signingOut = candidates.find((c) => c.id === signingOutId) ?? null;
  const editing = candidates.find((c) => c.id === editingId) ?? null;
  const keyFor = candidates.find((c) => c.id === keyForId) ?? null;

  if (!session) return <EmptyRoster />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px]">
      {/* Added after the list was loaded: a walk-in, an emergency, a late
          booking. They are held here until checked in, whatever the list's
          order, so a single late candidate is never lost at the bottom. */}
      {lateWaiting.length > 0 && (
        <div className="flex shrink-0 flex-col gap-[10px] rounded-[20px] border border-gold/45 bg-gold/8 p-[14px] md:flex-row md:items-center md:gap-[14px] md:px-[18px]">
          <span className="flex items-center gap-[10px]">
            <span className="relative flex h-[10px] w-[10px]">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" />
              <span className="relative inline-flex h-[10px] w-[10px] rounded-full bg-gold" />
            </span>
            <span className="text-[13px] font-bold text-gold-bright">
              {lateWaiting.length === 1 ? "Added late · waiting to check in" : `${lateWaiting.length} added late · waiting to check in`}
            </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap gap-[8px]">
            {lateWaiting.slice(0, 6).map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={!canFrontOffice}
                onClick={() => setCheckingInId(c.id)}
                className="flex cursor-pointer items-center gap-[9px] rounded-[12px] border border-gold/50 bg-panel px-[12px] py-[8px] text-left hover:border-gold disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="max-w-[180px] truncate text-[13px] font-semibold">{fullName(c)}</span>
                <span className="font-mono text-[11px] text-gold">{refOf(c)}</span>
                <span className="rounded-[8px] gold-bg px-[8px] py-[3px] text-[11px] font-bold text-[#1a1512]">Check in</span>
              </button>
            ))}
            {lateWaiting.length > 6 && (
              <span className="self-center text-[12px] text-gold">+{lateWaiting.length - 6} more at the top of the list</span>
            )}
          </span>
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center gap-[12px]">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">{session.exam_name}</span>
          <span className="block text-[12px] text-fg-faint">
            {candidates.length} booked · {counts.waiting} still to check in
            {` · ${candidates.filter((c) => c.status === "completed").length} to sign out`}
          </span>
        </span>
        <span className="flex-1" />
        <div className="flex w-full min-w-0 items-center gap-[10px] rounded-[14px] border border-edge-strong bg-panel-soft px-[14px] py-[12px] md:w-[300px]">
          <span className="font-mono text-[14px] text-fg-dim">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name · confirmation no · phone · key"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] outline-none placeholder:text-fg-faint"
          />
        </div>
        <button
          type="button"
          disabled={!canFrontOffice}
          onClick={() => setAdding(true)}
          className="shrink-0 cursor-pointer rounded-[14px] border border-edge-warm px-[16px] py-[12px] text-[13px] font-semibold text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Walk-in candidate
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap gap-[8px]">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`cursor-pointer rounded-[12px] border px-[13px] py-[8px] text-[12.5px] font-semibold transition-colors ${
              filter === f.key
                ? "border-accent/50 bg-accent/10 text-fg"
                : "border-edge bg-panel-soft text-fg-muted hover:border-edge-warm"
            }`}
          >
            {f.label}
            <span className="ml-[7px] font-mono text-[11.5px] text-fg-faint">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-edge-mid panel-bg">
        <div
          style={{ gridTemplateColumns: COLUMNS }}
          className="hidden shrink-0 gap-[12px] border-b border-edge-soft px-[16px] py-[12px] text-[11px] font-semibold text-fg-dim lg:grid"
        >
          <span />
          <span>Name · confirmation no.</span>
          <span>Exam · part</span>
          <span>Time</span>
          <span>Contact</span>
          <span>Locker</span>
          <span>Status</span>
          <span />
        </div>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {results.map((c) => (
            <RosterRow
              key={c.id}
              candidate={c}
              onCheckIn={() => setCheckingInId(c.id)}
              onSignOut={() => setSigningOutId(c.id)}
              onEdit={() => setEditingId(c.id)}
              onKey={() => setKeyForId(c.id)}
            />
          ))}
          {results.length === 0 && (
            <p className="p-[28px] text-center text-[13px] text-fg-faint">
              {query ? `Nobody matches “${query}”` : "Nobody in this group."}
            </p>
          )}
        </div>
      </div>

      {checkingIn && (
        <CheckInDialog
          key={checkingIn.id}
          candidate={checkingIn}
          onClose={() => setCheckingInId(null)}
          onCheckedIn={() => {
            setCheckingInId(null);
            // The key board follows at once, unless they already hold one.
            if (!checkingIn.locker_key) setKeyForId(checkingIn.id);
          }}
        />
      )}

      {keyFor && <LockerKeyDialog key={keyFor.id} candidate={keyFor} onClose={() => setKeyForId(null)} />}

      {editing && (
        <CandidateDetailsDialog
          key={editing.id}
          open
          candidate={editing}
          onClose={() => setEditingId(null)}
          onLockerKey={() => {
            setEditingId(null);
            setKeyForId(editing.id);
          }}
        />
      )}

      {adding && <CandidateDetailsDialog open candidate={null} onClose={() => setAdding(false)} />}

      {signingOut && (
        <SignOutDialog
          key={signingOut.id}
          candidate={signingOut}
          onClose={() => setSigningOutId(null)}
        />
      )}
    </div>
  );
}

/** One person: the next action first, then everything known about them. */
function RosterRow({
  candidate,
  onCheckIn,
  onSignOut,
  onEdit,
  onKey,
}: {
  candidate: Candidate;
  onCheckIn: () => void;
  onSignOut: () => void;
  onEdit: () => void;
  onKey: () => void;
}) {
  const { canFrontOffice, materials, session, center, programmes } = useConsole();
  const chip = statusChip(candidate);
  const pending = WAITING_TO_CHECK_IN.includes(candidate.status);
  const late = pending && joinedLate(candidate, session);
  const leaving = candidate.status === "completed";
  const gone = ["signed_out", "no_show"].includes(candidate.status);
  const keyable = !!candidate.check_in_at && !gone && candidate.status !== "completed";
  const holding = materials
    .filter((m) => m.candidate_id === candidate.id)
    .reduce((n, m) => n + stillHeld(m), 0);
  const exam =
    programmes.find((p) => p.id === candidate.programme_id)?.name ?? candidate.live_exam_name ?? null;

  return (
    <div
      style={{ gridTemplateColumns: COLUMNS }}
      className={`flex flex-wrap items-center gap-x-[12px] gap-y-[8px] border-b border-edge-soft/60 px-[14px] py-[11px] lg:grid lg:px-[16px] ${
        late ? "bg-gold/6 shadow-[inset_3px_0_0_var(--color-gold)]" : ""
      } ${gone ? "opacity-60" : ""}`}
    >
      {/* The action, first, so the eye lands on it. */}
      <span className="order-last w-full lg:order-none lg:w-auto">
        {pending ? (
          <button
            type="button"
            disabled={!canFrontOffice}
            onClick={onCheckIn}
            className="w-full cursor-pointer rounded-[12px] gold-bg px-[12px] py-[10px] text-[13px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Check in
          </button>
        ) : leaving ? (
          <button
            type="button"
            disabled={!canFrontOffice}
            onClick={onSignOut}
            className="w-full cursor-pointer rounded-[12px] bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] px-[12px] py-[10px] text-[13px] font-bold text-[#0c1711] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Sign out
          </button>
        ) : (
          <span className="hidden text-center font-mono text-[11px] text-fg-faint lg:block">
            {candidate.check_in_at ? `in ${clockAt(candidate.check_in_at, center.timezone)}` : "—"}
          </span>
        )}
      </span>

      <span className="block min-w-0 flex-1 lg:flex-none">
        <span className="flex min-w-0 items-center gap-[8px]">
          <span className="truncate text-[14.5px] font-semibold">{fullName(candidate)}</span>
          {late && (
            <span className="shrink-0 rounded-[7px] border border-gold/50 px-[6px] py-[1px] text-[9.5px] font-bold tracking-[0.08em] text-gold uppercase">
              Added late
            </span>
          )}
        </span>
        <span className="block truncate font-mono text-[11px] text-fg-faint">{refOf(candidate)}</span>
      </span>

      <span className="hidden min-w-0 lg:block">
        <span className="block truncate text-[12.5px] text-fg-muted">{exam ?? <Blank />}</span>
        <span className="block truncate text-[11px] text-fg-faint">{candidate.part ?? ""}</span>
      </span>

      <span className="hidden font-mono text-[12px] text-fg-muted lg:block">
        {candidate.scheduled_at ? clockAt(candidate.scheduled_at, center.timezone) : <Blank />}
      </span>

      <span className="hidden truncate font-mono text-[12px] text-fg-muted lg:block">{candidate.phone ?? <Blank />}</span>

      <span className="shrink-0">
        {keyable ? (
          <button
            type="button"
            disabled={!canFrontOffice}
            onClick={onKey}
            title="Change the locker key"
            className={`cursor-pointer rounded-[9px] border px-[9px] py-[5px] font-mono text-[11.5px] font-semibold disabled:cursor-not-allowed ${
              candidate.locker_key
                ? "border-gold/40 bg-gold/10 text-gold-bright hover:border-gold"
                : "border-dashed border-rust/50 text-rust hover:border-rust"
            }`}
          >
            {candidate.locker_key ?? "Key?"}
          </button>
        ) : (
          <span className="font-mono text-[11.5px] text-fg-faint">{candidate.locker_key ?? ""}</span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-[6px]">
        <span className={`rounded-[9px] px-[9px] py-[5px] text-[10.5px] font-bold tracking-[0.05em] uppercase ${chip.className}`}>
          {chip.label}
        </span>
        {holding > 0 && !pending && (
          <span title="Still holding something" className="font-mono text-[10.5px] font-semibold text-gold-bright">
            {holding} out
          </span>
        )}
      </span>

      <button
        type="button"
        disabled={!canFrontOffice}
        onClick={onEdit}
        title="Edit details"
        aria-label={`Edit ${fullName(candidate)}`}
        className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-edge text-[14px] text-fg-dim hover:border-edge-warm hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
      >
        ✎
      </button>
    </div>
  );
}

function Blank() {
  return <span className="text-[11.5px] text-fg-faint italic">—</span>;
}

/**
 * The check-in itself: look at the ID against the list, note anything that
 * differs, press one button.
 *
 * A name that does not match is written here, once, by the person holding the
 * ID. It is saved as a reportable note on the candidate, so it appears in the
 * Center Problem Report at the end of the day without anybody copying it over.
 * The locker key is the next step; materials are issued in the admin room.
 */
function CheckInDialog({
  candidate,
  onClose,
  onCheckedIn,
}: {
  candidate: Candidate;
  onClose: () => void;
  onCheckedIn: () => void;
}) {
  const { center, rpc, canFrontOffice } = useConsole();
  const [mismatch, setMismatch] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const done = !!candidate.check_in_at;
  const noteMissing = mismatch && !note.trim();

  async function checkIn() {
    setBusy(true);
    const ok = await rpc(
      "fets_check_in_one",
      { p_candidate: candidate.id, p_name_note: mismatch ? note.trim() : null },
      mismatch
        ? `${refOf(candidate)} checked in · name note saved for the report`
        : `${refOf(candidate)} checked in`,
    );
    setBusy(false);
    if (ok) onCheckedIn();
  }

  const details: [string, string | null][] = [
    ["Confirmation no.", candidate.roster_number],
    ["Exam part", candidate.part],
    ["Scheduled", candidate.scheduled_at ? clockAt(candidate.scheduled_at, center.timezone) : null],
    ["Contact", candidate.phone],
    ["Place", candidate.place],
  ];

  return (
    <Dialog
      open
      title={fullName(candidate)}
      subtitle="Check the ID against this name before checking in"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            disabled={done || busy || noteMissing || !canFrontOffice}
            onClick={checkIn}
            className="flex-1 cursor-pointer rounded-[14px] bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] px-[22px] py-[15px] text-[15px] font-bold text-[#0c1711] disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#1d1d25] disabled:text-fg-dim"
          >
            {done
              ? `Checked in at ${clockAt(candidate.check_in_at, center.timezone)}`
              : noteMissing
                ? "Write what the ID says first"
                : busy
                  ? "Checking in…"
                  : "Checked in"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[14px] border border-edge px-[20px] py-[15px] text-[14px] font-semibold text-fg-muted"
          >
            Close
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-[12px]">
        <dl className="grid grid-cols-2 gap-[8px] sm:grid-cols-3">
          {details.map(([label, value]) => (
            <div key={label} className="rounded-[12px] border border-edge-soft bg-panel-soft/60 px-[11px] py-[9px]">
              <dt className="font-mono text-[9.5px] tracking-[0.12em] text-fg-faint uppercase">{label}</dt>
              <dd className="mt-[3px] truncate text-[13.5px] font-semibold">{value || "—"}</dd>
            </div>
          ))}
        </dl>

        {!done && (
          <div
            className={`rounded-[16px] border p-[13px] transition-colors ${
              mismatch ? "border-gold/50 bg-gold/8" : "border-edge bg-panel-soft/40"
            }`}
          >
            <label className="flex cursor-pointer items-center gap-[11px]">
              <input
                type="checkbox"
                checked={mismatch}
                onChange={(e) => setMismatch(e.target.checked)}
                className="h-[18px] w-[18px] accent-[oklch(0.83_0.16_82)]"
              />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold">Name on the ID differs from the list</span>
                <span className="block text-[11.5px] text-fg-faint">
                  Goes into today&rsquo;s problem report automatically
                </span>
              </span>
            </label>
            {mismatch && (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                rows={2}
                autoFocus
                placeholder="What the ID says, e.g. “ID reads Anjali M. Menon”"
                className="mt-[10px] w-full resize-none rounded-[12px] border border-edge-strong bg-panel-soft px-[12px] py-[10px] text-[13.5px] outline-none placeholder:text-fg-faint focus:border-accent/60"
              />
            )}
          </div>
        )}

        {canFrontOffice && !done && candidate.status !== "no_show" && (
          <button
            type="button"
            onClick={async () => {
              const ok = await rpc(
                "fets_mark_no_show",
                { p_candidate: candidate.id, p_note: "Marked at front office" },
                `${refOf(candidate)} marked no show`,
              );
              if (ok) onClose();
            }}
            className="cursor-pointer self-start rounded-[12px] border border-edge px-[12px] py-[9px] text-[11px] font-bold tracking-[0.1em] text-fg-faint uppercase hover:border-rust/50 hover:text-rust"
          >
            Mark no show
          </button>
        )}
      </div>
    </Dialog>
  );
}

/**
 * The other end of the day. They have finished, and now everything the centre
 * gave them has to come back before they walk out: the key off the board, the
 * sheets off the desk. The button stays shut until it has.
 */
function SignOutDialog({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const { center, materials, materialKinds, rpc, canFrontOffice } = useConsole();

  const mine = materials.filter((m) => m.candidate_id === candidate.id);
  const outstanding = mine.filter((m) => {
    const kind = materialKinds.find((k) => k.code === m.kind);
    return kind?.returnable && stillHeld(m) > 0;
  });
  const ready = outstanding.length === 0;

  return (
    <Dialog
      open
      title={fullName(candidate)}
      subtitle={[
        refOf(candidate),
        candidate.roster_number,
        `finished ${clockAt(candidate.completed_at, center.timezone)}`,
      ]
        .filter(Boolean)
        .join(" · ")}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            disabled={!ready || !canFrontOffice}
            onClick={async () => {
              const ok = await rpc(
                "fets_sign_out",
                { p_candidate: candidate.id, p_note: "Signed out at the front desk" },
                `${refOf(candidate)} signed out`,
              );
              if (ok) onClose();
            }}
            className={`flex-1 rounded-[14px] px-[22px] py-[15px] text-[14.5px] font-bold ${
              ready && canFrontOffice
                ? "cursor-pointer bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] text-[#0c1711]"
                : "cursor-not-allowed bg-[#1d1d25] text-fg-dim"
            }`}
          >
            {ready ? `Sign out ${refOf(candidate)}` : "Take everything back first"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[14px] border border-edge px-[20px] py-[15px] text-[14px] font-semibold text-fg-muted"
          >
            Close
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-[12px]">
        {candidate.locker_key && candidate.locker_key !== "NIL" && (
          <div className="flex items-center gap-[13px] rounded-[16px] border border-gold/40 bg-gold/8 p-[13px]">
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border-2 border-gold bg-gold/12 font-mono text-[12px] font-semibold text-gold-bright">
              K
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">Locker key back</span>
              <span className="block font-mono text-[11.5px] text-fg-faint">
                {candidate.locker_key} — the key frees itself once they are signed out
              </span>
            </span>
          </div>
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
