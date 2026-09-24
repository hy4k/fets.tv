"use client";

import { useState } from "react";
import { CoverageScreen } from "@/components/screens/CoverageScreen";
import { DutyScreen } from "@/components/screens/DutyScreen";
import { MonitoringScreen } from "@/components/screens/MonitoringScreen";

/**
 * Two questions about the same three people, kept on one page.
 *
 * "Who is standing where right now" and "will there be three of them on
 * Tuesday" belong together — they are the same rota seen from two distances —
 * but they do not belong on the screen at the same time. The floor walk
 * countdown has no business on a week grid.
 */
export function DutyTabs() {
  const [view, setView] = useState<"watch" | "posts" | "week">("watch");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[11px]">
      <div className="flex shrink-0 gap-[6px] self-start rounded-[13px] border border-edge bg-panel-soft p-[4px]">
        {(
          [
            ["watch", "Today\u2019s clocks"],
            ["posts", "Who is on which post"],
            ["week", "Week rota"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`cursor-pointer rounded-[10px] px-[14px] py-[8px] text-[12.5px] font-semibold ${
              view === key ? "gold-bg text-[#1a1512]" : "text-fg-muted hover:text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "watch" ? <MonitoringScreen /> : view === "posts" ? <DutyScreen /> : <CoverageScreen />}
    </div>
  );
}
