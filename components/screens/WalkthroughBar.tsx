"use client";

import { useState } from "react";
import { useConsole } from "@/lib/console-data";
import { clockAt } from "@/lib/format";
import { useNow } from "@/lib/use-clock";

/**
 * The ten-minute walk.
 *
 * The board's question after a bad day is not whether there was a policy but
 * when the hall was last walked, so this is a countdown and one button. It
 * reads green while there is time, gold in the last two minutes and rust once
 * the interval has passed — and it never hides, because a walk that is quietly
 * overdue is the failure it exists to prevent.
 *
 * Anybody can press it. Tying the button to whoever formally holds the Floor
 * post would mean a walk that really happened going unrecorded because the rota
 * was out of date, which is the worse of the two wrongs.
 */
export function WalkthroughBar() {
  const { center, rules, walkthroughs, rpc, canLab, canFrontOffice } = useConsole();
  const now = useNow();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const may = canLab || canFrontOffice;
  const every = rules.walkthrough_minutes * 60000;

  const last = walkthroughs[0] ?? null;
  const lastAt = last ? new Date(last.walked_at).getTime() : null;
  const due = lastAt === null ? null : lastAt + every;
  const live = now > 0;

  const over = live && due !== null && now >= due;
  const soon = live && due !== null && !over && due - now <= 2 * 60000;

  const tone = over
    ? "border-rust bg-rust/12 text-rust"
    : soon
      ? "border-gold/60 bg-gold/12 text-gold-bright"
      : lastAt === null
        ? "border-edge-warm bg-panel-soft text-fg-muted"
        : "border-mint/35 bg-mint/6 text-mint";

  const countdown = () => {
    if (!live || due === null) return "—";
    const ms = due - now;
    const mins = Math.floor(Math.abs(ms) / 60000);
    const secs = Math.floor((Math.abs(ms) % 60000) / 1000);
    const body = `${mins}:${String(secs).padStart(2, "0")}`;
    return ms <= 0 ? `+${body}` : body;
  };

  async function record() {
    const ok = await rpc(
      "fets_record_walkthrough",
      { p_center: center.id, p_note: note.trim() || null },
      "Walk recorded",
    );
    if (ok) {
      setNote("");
      setOpen(false);
    }
  }

  return (
    <div className={`shrink-0 rounded-[15px] border-2 px-[14px] py-[11px] ${tone}`}>
      <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[8px]">
        <span className="text-[11px] font-bold tracking-[0.13em] uppercase">Floor walk</span>

        <span className="font-mono text-[20px] leading-none font-semibold">{countdown()}</span>

        <span className="min-w-0 flex-1 text-[12.5px]">
          {lastAt === null
            ? `Nobody has walked the floor yet today. Every ${rules.walkthrough_minutes} minutes.`
            : over
              ? `Overdue — last walked ${clockAt(last!.walked_at, center.timezone)} by ${last!.walked_by_name}`
              : `Last ${clockAt(last!.walked_at, center.timezone)} by ${last!.walked_by_name}`}
        </span>

        <button
          type="button"
          disabled={!may}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 cursor-pointer rounded-[11px] border border-current/40 px-[11px] py-[8px] text-[11.5px] font-semibold disabled:opacity-40"
        >
          {open ? "Cancel" : "Add a note"}
        </button>

        <button
          type="button"
          disabled={!may}
          onClick={record}
          className="shrink-0 cursor-pointer rounded-[12px] gold-bg px-[16px] py-[9px] text-[13px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Walked it
        </button>
      </div>

      {open && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          autoFocus
          placeholder="Anything seen on the walk"
          onKeyDown={(e) => {
            if (e.key === "Enter") void record();
          }}
          className="mt-[9px] w-full rounded-[11px] border border-edge-strong bg-panel-soft px-[11px] py-[9px] text-[13px] text-fg outline-none placeholder:text-fg-faint focus:border-gold/50"
        />
      )}
    </div>
  );
}
