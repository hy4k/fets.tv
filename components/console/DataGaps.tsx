"use client";

import { useConsole } from "@/lib/console-data";
import type { SnapshotTable } from "@/lib/console-data";

/** What to call each load in a sentence somebody on the floor would use. */
const NAMES: Record<SnapshotTable, string> = {
  exam_sessions: "today's exam day",
  candidates: "today's candidates",
  incidents: "incidents",
  candidate_materials: "what has been handed out",
  candidate_breaks: "who is on a break",
  staff_days: "the rota",
  duty_posts: "the posts",
  profiles: "the staff list",
};

/** "the rota", "the rota and the posts", "the rota, the posts and incidents". */
function list(tables: SnapshotTable[]) {
  const names = tables.map((t) => NAMES[t]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The same list, starting a sentence. */
function opens(tables: SnapshotTable[]) {
  const text = list(tables);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * What the console could not read, said once, above everything.
 *
 * A failed load is not a fact about the room, but every screen downstream is
 * about to render it as one — an empty incident list reads as nothing wrong,
 * an empty break list as nobody on one. The snapshot is fetched in one place
 * and fails in one place, so it is said in one place rather than repeated as
 * a caveat on eight screens, and it sits above the nav so it is on whichever
 * screen the failure happens to matter for.
 *
 * Nothing here is alarming on its own. It exists so that the calm, empty
 * screen behind it is not mistaken for a calm, empty room.
 */
export function DataGaps() {
  const { unread, stale } = useConsole();

  if (unread.length === 0 && stale.length === 0) return null;

  return (
    <div
      role="status"
      className={`shrink-0 rounded-[15px] border-2 px-[13px] py-[9px] text-[12.5px] font-semibold ${
        unread.length > 0
          ? "border-rust bg-rust/12 text-rust"
          : "border-gold/55 bg-gold/10 text-gold-bright"
      }`}
    >
      {unread.length > 0 && (
        <span className="block">
          Could not read {list(unread)} — so an empty screen here does not mean an empty room.
          Reload; if it keeps happening the database is refusing the request.
        </span>
      )}
      {stale.length > 0 && (
        <span className={`block ${unread.length > 0 ? "mt-[3px] text-gold-bright" : ""}`}>
          {opens(stale)} could not be re-read just now, so what is shown may be out of date —
          including a change just made.
        </span>
      )}
    </div>
  );
}
