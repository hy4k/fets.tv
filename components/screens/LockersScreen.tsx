"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useConsole } from "@/lib/console-data";
import { fullName } from "@/lib/format";
import type { Candidate } from "@/lib/types";

// Out of the building. A candidate who has finished but not signed out still
// holds their key, so "completed" is not here.
const GONE = ["signed_out", "no_show"];

/**
 * The locker key, as a step of its own after check-in.
 *
 * Each centre has its own bank — CL-01 to CL-40 at Calicut, CK-01 to CK-35 at
 * Cochin — and "Nil" for somebody with nothing to lock away. Nobody is called
 * forward from the admin room until they have one or the other, so this list
 * is the thing to clear before the hall starts calling.
 */
export function LockersScreen() {
  const { candidates, center, rules, canFrontOffice } = useConsole();
  const [picking, setPicking] = useState<Candidate | null>(null);

  const prefix = center.locker_prefix ?? "K";
  const count = center.locker_count ?? 24;
  const bank = useMemo(
    () => Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`),
    [prefix, count],
  );

  const here = candidates.filter((c) => c.check_in_at && !GONE.includes(c.status));
  // Nobody needs a key once their exam is over.
  const needKey = here.filter((c) => !c.locker_key && c.status !== "completed");
  const withKey = here
    .filter((c) => c.locker_key)
    .sort((a, b) => (a.locker_key ?? "").localeCompare(b.locker_key ?? ""));
  const inUse = new Set(withKey.map((c) => c.locker_key).filter((k) => k && k !== "NIL"));
  const free = bank.filter((k) => !inUse.has(k)).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[12px] overflow-y-auto">
      <div className="flex shrink-0 flex-wrap items-center gap-[12px]">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">Locker keys</span>
          <span className="block text-[12px] text-fg-faint">
            {prefix}-01 to {prefix}-{String(count).padStart(2, "0")} · {free} free · Nil for no belongings
            {!rules.locker_key_required && " · not required today"}
          </span>
        </span>
      </div>

      <section className="shrink-0 overflow-hidden rounded-[20px] border border-edge-mid panel-bg">
        <Head
          label={rules.locker_key_required ? "Needs a key" : "No key yet · optional today"}
          count={needKey.length}
          tone={needKey.length && rules.locker_key_required ? "text-rust" : "text-fg-dim"}
        />
        {needKey.map((c) => (
          <Row key={c.id} c={c}>
            <button
              type="button"
              disabled={!canFrontOffice}
              onClick={() => setPicking(c)}
              className="shrink-0 cursor-pointer rounded-[12px] gold-bg px-[16px] py-[10px] text-[13px] font-bold text-[#141418] disabled:opacity-40"
            >
              Issue key
            </button>
          </Row>
        ))}
        {needKey.length === 0 && (
          <p className="p-[22px] text-center text-[13px] text-fg-faint">
            {here.length ? "Everyone checked in has a key or Nil." : "Nobody is checked in yet."}
          </p>
        )}
      </section>

      <section className="shrink-0 overflow-hidden rounded-[20px] border border-edge-mid panel-bg">
        <Head label="Keys out" count={withKey.length} tone="text-fg-dim" />
        {withKey.map((c) => (
          <Row key={c.id} c={c}>
            <span
              className={`shrink-0 rounded-[10px] px-[11px] py-[6px] font-mono text-[13px] font-bold ${
                c.locker_key === "NIL" ? "bg-panel-soft text-fg-dim" : "bg-accent/15 text-accent"
              }`}
            >
              {c.locker_key === "NIL" ? "Nil" : c.locker_key}
            </span>
            {/* After the exam the key only comes back at sign-out; it cannot be changed. */}
            {c.status !== "completed" ? (
              <button
                type="button"
                disabled={!canFrontOffice}
                onClick={() => setPicking(c)}
                className="shrink-0 cursor-pointer rounded-[11px] border border-edge px-[11px] py-[8px] text-[12px] font-semibold text-fg-muted hover:border-edge-warm disabled:opacity-40"
              >
                Change
              </button>
            ) : (
              <span className="shrink-0 px-[4px] font-mono text-[10.5px] text-fg-faint">finished</span>
            )}
          </Row>
        ))}
        {withKey.length === 0 && <p className="p-[22px] text-center text-[13px] text-fg-faint">No keys out.</p>}
      </section>

      {picking && (
        <KeyPicker
          candidate={candidates.find((c) => c.id === picking.id) ?? picking}
          bank={bank}
          inUse={withKey}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

function Head({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <div className="flex items-center gap-[10px] border-b border-edge-soft px-[16px] py-[11px]">
      <span className="text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">{label}</span>
      <span className="h-px flex-1 bg-edge-soft" />
      <span className={`font-mono text-[13px] font-semibold ${tone}`}>{count}</span>
    </div>
  );
}

function Row({ c, children }: { c: Candidate; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-[12px] border-b border-edge-soft/60 px-[14px] py-[10px] last:border-b-0 md:px-[16px]">
      <span className="w-[64px] shrink-0 font-mono text-[12.5px] font-semibold">{c.public_token}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold">{fullName(c)}</span>
        <span className="block truncate font-mono text-[10.5px] text-fg-faint">
          {c.roster_number}
          {c.part ? ` · ${c.part}` : ""}
        </span>
      </span>
      {children}
    </div>
  );
}

function KeyPicker({
  candidate,
  bank,
  inUse,
  onClose,
}: {
  candidate: Candidate;
  bank: string[];
  inUse: Candidate[];
  onClose: () => void;
}) {
  const { rpc } = useConsole();
  const holders = new Map(inUse.filter((c) => c.locker_key !== "NIL").map((c) => [c.locker_key!, c.public_token]));

  async function give(key: string) {
    const ok = await rpc(
      "fets_assign_locker",
      { p_candidate: candidate.id, p_key: key },
      key === "NIL" ? `${candidate.public_token} · no locker needed` : `${key} to ${candidate.public_token}`,
    );
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      title={`Key for ${candidate.public_token}`}
      subtitle={`${fullName(candidate)} · a dimmed key is already out`}
      onClose={onClose}
      width={520}
    >
      <div className="flex flex-col gap-[14px]">
        <button
          type="button"
          onClick={() => void give("NIL")}
          className={`cursor-pointer rounded-[14px] border px-[16px] py-[13px] text-left ${
            candidate.locker_key === "NIL" ? "border-accent/60 bg-accent/12" : "border-edge bg-panel-soft hover:border-edge-warm"
          }`}
        >
          <span className="block text-[14px] font-bold">Nil</span>
          <span className="block text-[11.5px] text-fg-faint">Nothing to lock away</span>
        </button>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-[8px]">
          {bank.map((key) => {
            const holder = holders.get(key);
            const mine = candidate.locker_key === key;
            const taken = !!holder && !mine;
            return (
              <button
                key={key}
                type="button"
                disabled={taken}
                title={taken ? `With ${holder}` : undefined}
                onClick={() => void give(key)}
                className={`rounded-[12px] border py-[12px] font-mono text-[12.5px] font-semibold ${
                  mine
                    ? "border-accent/60 bg-accent/15 text-accent"
                    : taken
                      ? "cursor-not-allowed border-edge bg-panel-soft text-fg-faint/40"
                      : "cursor-pointer border-edge bg-panel-soft text-fg-muted hover:border-edge-warm hover:text-fg"
                }`}
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
