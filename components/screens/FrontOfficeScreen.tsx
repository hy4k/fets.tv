"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { MaterialsPanel } from "@/components/screens/MaterialsPanel";
import { Drawer } from "@/components/ui/Drawer";
import { useDrawers } from "@/lib/drawer-store";
import { useConsole } from "@/lib/console-data";
import { clockAt, fullName, initials, statusChip } from "@/lib/format";
import { type Candidate, stillHeld } from "@/lib/types";

const WAITING_TO_CHECK_IN = ["scheduled", "arrived", "id_checked"];

/**
 * The desk, as one flow rather than a page of controls. The roster is the page;
 * checking somebody in starts from their own row and finishes in a pop-up that
 * closes behind you. Nothing is parked at the bottom waiting to be noticed.
 */
export function FrontOfficeScreen() {
  const { candidates, center, call, rpc, canFrontOffice, session } = useConsole();
  const { open, toggle } = useDrawers("front-office", { recent: false });
  const [query, setQuery] = useState("");
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [signingOutId, setSigningOutId] = useState<string | null>(null);

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
      .slice(0, 120);
  }, [candidates, query]);

  const checkingIn = candidates.find((c) => c.id === checkingInId) ?? null;
  const signingOut = candidates.find((c) => c.id === signingOutId) ?? null;
  const called = candidates.find((c) => c.id === call?.candidate_id) ?? null;
  const recent = candidates
    .filter((c) => c.check_in_at)
    .sort((a, b) => (a.check_in_at! < b.check_in_at! ? 1 : -1))
    .slice(0, 8);

  const toCheckIn = candidates.filter((c) => WAITING_TO_CHECK_IN.includes(c.status)).length;
  const toSignOut = candidates.filter((c) => c.status === "completed").length;

  if (!session) return <EmptyRoster />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px]">
      {/* Somebody has been called and the hall is expecting them. This is the
          one thing on the page that is not about the roster, so it sits above
          it rather than inside it. */}
      {called && (
        <div className="flex shrink-0 flex-wrap items-center gap-[14px] rounded-[20px] mint-bg px-[18px] py-[16px] text-[#0c1711]">
          <span className="text-[11px] font-extrabold tracking-[0.18em] uppercase">Send in</span>
          <span className="font-mono text-[26px] font-semibold whitespace-nowrap">
            {called.public_token}
          </span>
          <span className="font-serif text-[25px]">{fullName(called)}</span>
          <span className="flex-1" />
          <span className="rounded-[12px] bg-[#0c1711] px-[14px] py-[9px] text-[13px] font-extrabold tracking-[0.06em] text-mint uppercase">
            {call?.room_label ?? "Frisking"}
          </span>
          <button
            type="button"
            disabled={!canFrontOffice}
            onClick={() =>
              rpc("fets_mark_entered", { p_center: center.id }, `${called.public_token} entered`)
            }
            className="cursor-pointer rounded-[13px] bg-[#0c1711] px-[18px] py-[12px] text-[13px] font-bold text-[#eafaf1] disabled:opacity-50"
          >
            Entered
          </button>
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center gap-[12px]">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">Check-in &amp; sign-out</span>
          <span className="block text-[12px] text-fg-faint">
            {toCheckIn} still to check in
            {toSignOut > 0 && ` · ${toSignOut} waiting to sign out`}
            {` · ${candidates.filter((c) => c.status === "signed_out").length} gone home`}
          </span>
        </span>
        <span className="flex-1" />
        <div className="flex w-full min-w-0 items-center gap-[10px] rounded-[14px] border border-edge-strong bg-panel-soft px-[14px] py-[12px] md:w-[300px]">
          <span className="font-mono text-[14px] text-fg-dim">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Roster no · name · token"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] outline-none placeholder:text-fg-faint"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-edge-mid panel-bg">
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {results.map((c) => (
            <RosterRow
              key={c.id}
              candidate={c}
              onCheckIn={() => setCheckingInId(c.id)}
              onSignOut={() => setSigningOutId(c.id)}
            />
          ))}
          {results.length === 0 && (
            <p className="p-[28px] text-center text-[13px] text-fg-faint">
              Nobody matches “{query}”
            </p>
          )}
        </div>
      </div>

      <Drawer label="Recent check-ins" meta={recent.length} open={open.recent} onToggle={toggle("recent")}>
        <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-[10px]">
          {recent.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-[10px] rounded-[14px] border border-edge bg-panel-soft p-[11px]"
            >
              <span className="font-mono text-[12px] font-semibold whitespace-nowrap">
                {c.public_token}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-fg-muted">{fullName(c)}</span>
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

      {checkingIn && (
        <CheckInDialog
          key={checkingIn.id}
          candidate={checkingIn}
          onClose={() => setCheckingInId(null)}
        />
      )}

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

/** One person on the roster. The button says what happens next to them. */
function RosterRow({
  candidate,
  onCheckIn,
  onSignOut,
}: {
  candidate: Candidate;
  onCheckIn: () => void;
  onSignOut: () => void;
}) {
  const { canFrontOffice, materials } = useConsole();
  const chip = statusChip(candidate);
  const pending = WAITING_TO_CHECK_IN.includes(candidate.status);
  const leaving = candidate.status === "completed";
  const holding = materials
    .filter((m) => m.candidate_id === candidate.id)
    .reduce((n, m) => n + stillHeld(m), 0);

  return (
    <div className="flex items-center gap-[12px] border-b border-edge-soft/60 px-[14px] py-[11px] md:px-[18px] md:py-[12px]">
      <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[12px] border border-edge-strong bg-[#1f1f27] font-mono text-[11px] font-semibold">
        {initials(fullName(candidate))}
      </span>

      <span className="block min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{fullName(candidate)}</span>
        <span className="block truncate font-mono text-[10.5px] text-fg-faint">
          {[candidate.public_token, candidate.roster_number, candidate.part].filter(Boolean).join(" · ")}
        </span>
      </span>

      <span
        className={`shrink-0 rounded-[9px] px-[10px] py-[6px] text-[10.5px] font-bold tracking-[0.06em] uppercase ${chip.className}`}
      >
        {chip.label}
      </span>

      {holding > 0 && !pending && (
        <span
          title="Still holding something"
          className="hidden shrink-0 rounded-[9px] border border-gold/40 bg-gold/10 px-[9px] py-[5px] font-mono text-[10.5px] font-semibold text-gold-bright sm:block"
        >
          {holding} out
        </span>
      )}

      {pending && (
        <button
          type="button"
          disabled={!canFrontOffice}
          onClick={onCheckIn}
          className="shrink-0 cursor-pointer rounded-[12px] gold-bg px-[16px] py-[10px] text-[13px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Check in
        </button>
      )}

      {leaving && (
        <button
          type="button"
          disabled={!canFrontOffice}
          onClick={onSignOut}
          className="shrink-0 cursor-pointer rounded-[12px] bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] px-[16px] py-[10px] text-[13px] font-bold text-[#0c1711] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Sign out
        </button>
      )}
    </div>
  );
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
function CheckInDialog({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
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
        ? `${candidate.public_token} checked in · name note saved for the report`
        : `${candidate.public_token} checked in`,
    );
    setBusy(false);
    if (ok) onClose();
  }

  const details: [string, string | null][] = [
    ["Token", candidate.public_token],
    ["Roster no.", candidate.roster_number],
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
                `${candidate.public_token} marked no show`,
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
        candidate.public_token,
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
                `${candidate.public_token} signed out`,
              );
              if (ok) onClose();
            }}
            className={`flex-1 rounded-[14px] px-[22px] py-[15px] text-[14.5px] font-bold ${
              ready && canFrontOffice
                ? "cursor-pointer bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] text-[#0c1711]"
                : "cursor-not-allowed bg-[#1d1d25] text-fg-dim"
            }`}
          >
            {ready ? `Sign out ${candidate.public_token}` : "Take everything back first"}
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
