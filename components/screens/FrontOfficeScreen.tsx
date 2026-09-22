"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Drawer } from "@/components/ui/Drawer";
import { useDrawers } from "@/lib/drawer-store";
import { useConsole } from "@/lib/console-data";
import { clockAt, fullName, initials, statusChip } from "@/lib/format";
import type { Candidate } from "@/lib/types";

/** Physical locker bank at the front desk. */
const LOCKER_BANK = 24;

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
  const called = candidates.find((c) => c.id === call?.candidate_id) ?? null;
  const recent = candidates
    .filter((c) => c.check_in_at)
    .sort((a, b) => (a.check_in_at! < b.check_in_at! ? 1 : -1))
    .slice(0, 8);

  const toCheckIn = candidates.filter((c) => WAITING_TO_CHECK_IN.includes(c.status)).length;

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
          <span className="block text-[15px] font-semibold">Roster</span>
          <span className="block text-[12px] text-fg-faint">
            {toCheckIn} still to check in · {recent.length > 0 ? `${candidates.length - toCheckIn} done` : "none done yet"}
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
            <RosterRow key={c.id} candidate={c} onCheckIn={() => setCheckingInId(c.id)} />
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
    </div>
  );
}

/** One person on the roster. The button says what happens next to them. */
function RosterRow({ candidate, onCheckIn }: { candidate: Candidate; onCheckIn: () => void }) {
  const { canFrontOffice } = useConsole();
  const chip = statusChip(candidate);
  const pending = WAITING_TO_CHECK_IN.includes(candidate.status);

  return (
    <div className="flex items-center gap-[12px] border-b border-edge-soft/60 px-[14px] py-[11px] md:px-[18px] md:py-[12px]">
      <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[12px] border border-edge-strong bg-[#251f1b] font-mono text-[11px] font-semibold">
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
    </div>
  );
}

/**
 * The check-in itself: ID, key, done. The ID tick only turns green when the
 * tick is pressed, so nobody clears it by tapping the row while scrolling, and
 * the locker bank opens over the top rather than pushing the steps around.
 */
function CheckInDialog({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const { candidates, center, rules, rpc, canFrontOffice } = useConsole();
  const [lockerOpen, setLockerOpen] = useState(false);

  const idDone = !!candidate.id_verified_at;
  const keyDone = !!candidate.locker_key;
  const keyNeeded = rules.locker_key_required;
  const ready = idDone && (keyDone || !keyNeeded) && candidate.status === "id_checked";

  const lockersInUse = new Map(
    candidates
      .filter((c) => c.locker_key && !["signed_out", "no_show"].includes(c.status))
      .map((c) => [c.locker_key!, c.public_token]),
  );

  async function checkIn() {
    const ok = await rpc(
      "fets_check_in",
      { p_candidate: candidate.id },
      `${candidate.public_token} checked in`,
    );
    if (ok) onClose();
  }

  return (
    <>
      <Dialog
        open
        title={fullName(candidate)}
        subtitle={[candidate.public_token, candidate.roster_number, candidate.part, candidate.place]
          .filter(Boolean)
          .join(" · ")}
        onClose={onClose}
        footer={
          <>
            <button
              type="button"
              disabled={!ready || !canFrontOffice}
              onClick={checkIn}
              className={`flex-1 rounded-[14px] px-[22px] py-[15px] text-[14.5px] font-bold ${
                ready && canFrontOffice
                  ? "cursor-pointer bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] text-[#0c1711]"
                  : "cursor-not-allowed bg-[#221d19] text-fg-dim"
              }`}
            >
              {ready
                ? `Check in ${candidate.public_token}`
                : keyNeeded && !keyDone && idDone
                  ? "Issue a locker key first"
                  : "Tick the ID check first"}
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
          <Step
            n="1"
            label="ID cross-verified"
            note={idDone ? clockAt(candidate.id_verified_at, center.timezone) : "Tap the circle when the ID matches"}
            done={idDone}
            onTick={
              canFrontOffice && !idDone
                ? () =>
                    rpc(
                      "fets_verify_id",
                      { p_candidate: candidate.id },
                      `ID verified · ${candidate.public_token}`,
                    )
                : undefined
            }
          />

          <Step
            n="2"
            label={keyNeeded ? "Locker key issued" : "Locker key (not required today)"}
            note={candidate.locker_key ?? "No key issued"}
            done={keyDone}
            action={
              canFrontOffice
                ? { label: keyDone ? "Change key" : "Choose a key", onClick: () => setLockerOpen(true) }
                : undefined
            }
          />

          <Step
            n="3"
            label="Checked in"
            note={
              candidate.check_in_at
                ? clockAt(candidate.check_in_at, center.timezone)
                : "The button below finishes it"
            }
            done={!!candidate.check_in_at}
          />

          {canFrontOffice && !candidate.check_in_at && candidate.status !== "no_show" && (
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
              className="mt-[4px] cursor-pointer rounded-[13px] border border-edge px-[12px] py-[11px] text-[11.5px] font-bold tracking-[0.1em] text-fg-faint uppercase hover:border-rust/50 hover:text-rust"
            >
              Mark no show
            </button>
          )}
        </div>
      </Dialog>

      {/* Rendered after the check-in dialog, so it sits over it. */}
      <Dialog
        open={lockerOpen}
        title="Locker keys"
        subtitle={`For ${fullName(candidate)} · a greyed key is already out`}
        onClose={() => setLockerOpen(false)}
        width={460}
      >
        <div className="grid grid-cols-[repeat(auto-fit,minmax(62px,1fr))] gap-[9px]">
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
                onClick={async () => {
                  const ok = await rpc(
                    "fets_assign_locker",
                    { p_candidate: candidate.id, p_key: code },
                    `Locker ${code} issued`,
                  );
                  if (ok) setLockerOpen(false);
                }}
                className={`aspect-square rounded-[13px] border font-mono text-[12px] font-semibold ${
                  mine
                    ? "border-gold/60 bg-gold/20 text-gold-bright"
                    : taken
                      ? "cursor-not-allowed border-edge bg-panel-soft text-fg-faint/40"
                      : "cursor-pointer border-edge bg-panel-soft text-fg-muted hover:border-edge-warm"
                }`}
              >
                {code}
              </button>
            );
          })}
        </div>
      </Dialog>
    </>
  );
}

/**
 * A step with its own tick. The tick is the only thing that completes it —
 * the rest of the row is text, so a stray tap on a busy desk changes nothing.
 */
function Step({
  n,
  label,
  note,
  done,
  onTick,
  action,
}: {
  n: string;
  label: string;
  note: string;
  done: boolean;
  onTick?: () => void;
  action?: { label: string; onClick: () => void };
}) {
  // Done is light green. Waiting to be pressed is gold, the colour every other
  // "do this now" control on the console uses. Inert is flat.
  const tickClass = done
    ? "border-mint bg-mint/25 text-mint"
    : onTick
      ? "cursor-pointer border-gold bg-gold/12 text-gold-bright hover:bg-gold/25"
      : "border-edge bg-panel-soft text-fg-faint";

  return (
    <div
      className={`flex items-center gap-[13px] rounded-[16px] border p-[13px] ${
        done ? "border-mint/35 bg-mint/6" : "border-edge bg-panel-soft"
      }`}
    >
      <button
        type="button"
        disabled={!onTick}
        onClick={onTick}
        aria-label={done ? `${label} — done` : `Mark ${label}`}
        aria-pressed={done}
        className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border-2 text-[16px] transition-colors ${tickClass}`}
      >
        {done ? "✓" : n}
      </button>

      <span className="min-w-0 flex-1">
        <span className={`block text-[14px] font-semibold ${done ? "text-fg" : "text-fg-muted"}`}>
          {label}
        </span>
        <span className="block truncate font-mono text-[11.5px] text-fg-faint">{note}</span>
      </span>

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 cursor-pointer rounded-[12px] border border-edge-warm px-[14px] py-[10px] text-[12.5px] font-semibold hover:bg-panel"
        >
          {action.label}
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
