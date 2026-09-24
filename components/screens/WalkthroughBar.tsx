"use client";

import { useMemo, useState } from "react";
import { useConsole } from "@/lib/console-data";
import { clockAt } from "@/lib/format";
import { countdown, dayBounds, monitoringDay } from "@/lib/monitoring";
import { useNow } from "@/lib/use-clock";

/**
 * The ten-minute walk, on the Live exams page.
 *
 * Same clock as Duty → Floor walk & DVR: it starts with the first exam clock,
 * and counts down to the end of the current ten-minute window rather than
 * from the last walk, so the two pages always say the same thing. Green once
 * this window has a walk, gold in its last two minutes without one.
 *
 * Anybody can press it. Tying the button to whoever formally holds the Floor
 * post would mean a walk that really happened going unrecorded because the rota
 * was out of date, which is the worse of the two wrongs.
 */
export function WalkthroughBar() {
  const { center, rules, walkthroughs, candidates, rpc, canLab, canFrontOffice } = useConsole();
  const now = useNow();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const may = canLab || canFrontOffice;
  const live = now > 0;

  const { anchor, finishedAt } = useMemo(() => dayBounds(candidates), [candidates]);
  const day = monitoringDay({
    anchor,
    finishedAt,
    now: live ? now : (anchor ?? 0),
    checks: walkthroughs.map((w) => ({
      kind: w.kind ?? "floor",
      walked_at: w.walked_at,
      walked_by_name: w.walked_by_name,
      note: w.note,
    })),
    walkMinutes: rules.walkthrough_minutes,
    shiftMinutes: rules.duty_block_minutes,
  });

  const w = day.floor.current;
  const done = w?.status === "done";
  const soon = live && !!w && !done && w.end - now <= 2 * 60000;
  const missedLast = day.floor.windows.length > 1 && day.floor.windows.at(-2)!.status === "missed";

  const tone = !w
    ? "border-edge-warm bg-panel-soft text-fg-muted"
    : done
      ? "border-mint/35 bg-mint/6 text-mint"
      : soon || missedLast
        ? "border-gold/60 bg-gold/12 text-gold-bright"
        : "border-edge-warm bg-panel-soft text-fg";

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

        <span className="font-mono text-[20px] leading-none font-semibold tabular-nums">
          {w && live ? countdown(w.end - now) : "—"}
        </span>

        <span className="min-w-0 flex-1 text-[12.5px]">
          {!w
            ? day.finishedAt !== null
              ? "The day's exams have finished."
              : `Starts with the first exam clock. Every ${rules.walkthrough_minutes} minutes.`
            : done
              ? `Walked ${clockAt(w.checks[0].walked_at, center.timezone)} by ${w.checks[0].walked_by_name}`
              : missedLast
                ? "The last window was missed — walk now"
                : `Due by ${clockAt(new Date(w.end).toISOString(), center.timezone)}`}
        </span>

        <button
          type="button"
          disabled={!may || !w}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 cursor-pointer rounded-[11px] border border-current/40 px-[11px] py-[8px] text-[11.5px] font-semibold disabled:opacity-40"
        >
          {open ? "Cancel" : "Add a note"}
        </button>

        <button
          type="button"
          disabled={!may || !w}
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
