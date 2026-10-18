"use client";

import { useMemo } from "react";
import { useConsole } from "@/lib/console-data";
import { clockAt, fullName, refOf } from "@/lib/format";
import { namesClash, nameTwins } from "@/lib/safeguards";
import type { Candidate } from "@/lib/types";

/**
 * Today's name twins, worked out from the roster the console already holds.
 * Staff screens only: the hall TV never imports this.
 */
export function useNameTwins() {
  const { candidates } = useConsole();
  // An empty booked slot has no name of its own to confuse.
  return useMemo(() => nameTwins(candidates.filter((c) => !c.placeholder)), [candidates]);
}

/** The red tag beside a name that could be mistaken for another on today's list. */
export function TwinBadge({ candidate }: { candidate: Candidate }) {
  const { center } = useConsole();
  const twins = useNameTwins().get(candidate.id);
  if (!twins) return null;
  const others = twins
    .map((t) => `${fullName(t)} · ${t.scheduled_at ? clockAt(t.scheduled_at, center.timezone) : "no time"} · ${refOf(t)}`)
    .join("\n");
  return (
    <span
      title={`Look-alike name on today's list:\n${others}`}
      className="shrink-0 rounded-[7px] border border-rust/60 bg-rust/15 px-[6px] py-[1px] text-[9.5px] font-bold tracking-[0.08em] text-rust uppercase"
    >
      Name twin
    </span>
  );
}

/**
 * While a booked slot is being filled in: the names on today's list that look
 * like the one being typed, so the desk notices before saving.
 */
export function DraftTwinWarning({ name, exceptId }: { name: string; exceptId: string }) {
  const { candidates, center } = useConsole();
  const typed = name.trim();
  const twins = useMemo(
    () =>
      typed.length < 3
        ? []
        : candidates.filter(
            (c) => c.id !== exceptId && !c.placeholder && namesClash({ first_name: typed, last_name: "" }, c),
          ),
    [candidates, exceptId, typed],
  );
  if (twins.length === 0) return null;
  return (
    <div className="flex flex-col gap-[8px] rounded-[16px] border border-rust/50 bg-rust/10 p-[12px]">
      <span className="text-[13px] font-bold text-rust">
        Name twin — a look-alike name is already on today&rsquo;s list
      </span>
      {twins.map((t) => (
        <div key={t.id} className="rounded-[12px] border border-edge-soft bg-black/20 px-[11px] py-[9px]">
          <span className="block text-[14px] font-semibold break-words">{fullName(t)}</span>
          <span className="block font-mono text-[12px] text-fg-muted">
            {t.scheduled_at ? clockAt(t.scheduled_at, center.timezone) : "no time"} · {refOf(t)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The twins spelled out in full, for the check-in pop-up, so the person at the
 * desk compares the whole name, the session time and the confirmation number
 * before pressing anything.
 */
export function TwinWarning({ candidate }: { candidate: Candidate }) {
  const { center } = useConsole();
  const twins = useNameTwins().get(candidate.id);
  if (!twins) return null;
  const row = (c: Candidate, label: string) => (
    <div key={c.id} className="rounded-[12px] border border-edge-soft bg-black/20 px-[11px] py-[9px]">
      <span className="block font-mono text-[9.5px] tracking-[0.12em] text-fg-faint uppercase">{label}</span>
      <span className="block text-[14px] font-semibold break-words">{fullName(c)}</span>
      <span className="block font-mono text-[12px] text-fg-muted">
        {c.scheduled_at ? clockAt(c.scheduled_at, center.timezone) : "no time"} · {refOf(c)}
      </span>
    </div>
  );
  return (
    <div className="flex flex-col gap-[8px] rounded-[16px] border border-rust/50 bg-rust/10 p-[12px]">
      <span className="text-[13px] font-bold text-rust">
        Name twin — check the confirmation number and session time on their ID or booking
      </span>
      {row(candidate, "Checking in")}
      {twins.map((t) => row(t, "Not to be confused with"))}
    </div>
  );
}
