"use client";

import { useMemo, useState } from "react";
import { useConsole } from "@/lib/console-data";
import {
  coverageWeek,
  listDays,
  mondayOf,
  nextState,
  shiftWeeks,
  shortDays,
  thinDays,
} from "@/lib/coverage";
import type { DayState } from "@/lib/coverage";
import { todayInZone } from "@/lib/format";
import { useNow } from "@/lib/use-clock";

/**
 * Who is in, which day.
 *
 * The rotation needs one person per post, and whether there will be that many
 * next Tuesday was not a question the console could answer — so nobody found
 * out until Tuesday. Three names down the side, the week across, and a count
 * under each day that goes red when it is short.
 *
 * Tapping a cell cycles in → off → half → in. There is no save button because
 * there is nothing to save: each tap is the whole edit, and the next person's
 * console sees it.
 */
export function CoverageScreen() {
  const { center, dutyPosts, operators, staffDays, rpc, canCall } = useConsole();
  const now = useNow();

  // Before the clock starts on the client it reads zero, which would put the
  // week in 1970. The centre's own today is the anchor once it does.
  const live = now > 0;
  const today = live ? todayInZone(center.timezone, new Date(now)) : null;

  const [offset, setOffset] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);

  const staff = useMemo(
    () =>
      Object.entries(operators)
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [operators],
  );

  const needs = dutyPosts.filter((p) => p.active).length;

  const week = useMemo(() => {
    if (!today) return [];
    return coverageWeek({
      staff,
      staffDays,
      needs,
      timezone: center.timezone,
      weekOf: shiftWeeks(mondayOf(today), offset),
      now,
    });
  }, [staff, staffDays, needs, center.timezone, today, offset, now]);

  const short = shortDays(week);
  const thin = thinDays(week);

  async function cycle(profileId: string, date: string, from: DayState) {
    const key = `${profileId}|${date}`;
    if (saving) return;
    setSaving(key);
    await rpc("fets_set_staff_day", {
      p_profile: profileId,
      p_date: date,
      p_state: nextState(from),
    });
    setSaving(null);
  }

  if (!today) {
    return <p className="p-[14px] text-[13px] text-fg-faint">Reading the week…</p>;
  }

  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${week[0].date}T00:00:00Z`));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[11px]">
      <div className="flex shrink-0 flex-wrap items-center gap-[10px]">
        <span className="text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">
          Who is in
        </span>
        <span className="font-serif text-[17px]">{monthLabel}</span>
        {offset !== 0 && (
          <button
            type="button"
            onClick={() => setOffset(0)}
            className="cursor-pointer rounded-[10px] border border-edge px-[10px] py-[6px] font-mono text-[10.5px] text-fg-muted hover:border-edge-warm"
          >
            back to this week
          </button>
        )}

        <span className="h-px min-w-[12px] flex-1 bg-edge-soft" />

        {/* The arrows stay together at any width; the sentence beside them is
            the first thing to go, since the grid says the same. */}
        <span className="hidden text-[12px] text-fg-faint sm:inline">
          {needs === 0 ? "No posts set up" : `${needs} needed each day`}
        </span>
        <span className="flex shrink-0 gap-[6px]">
          <button
            type="button"
            onClick={() => setOffset((o) => o - 1)}
            aria-label="The week before"
            className="cursor-pointer rounded-[11px] border border-edge-warm px-[13px] py-[8px] text-[13px] font-semibold hover:bg-panel"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setOffset((o) => o + 1)}
            aria-label="The week after"
            className="cursor-pointer rounded-[11px] border border-edge-warm px-[13px] py-[8px] text-[13px] font-semibold hover:bg-panel"
          >
            →
          </button>
        </span>
      </div>

      {/* The sentence the screen exists to say, before the grid that proves it. */}
      <div
        className={`shrink-0 rounded-[15px] border-2 px-[15px] py-[11px] text-[13.5px] font-semibold ${
          short.length > 0
            ? "border-rust bg-rust/12 text-rust"
            : thin.length > 0
              ? "border-gold/55 bg-gold/10 text-gold-bright"
              : "border-mint/35 bg-mint/6 text-mint"
        }`}
      >
        {needs === 0 ? (
          "Add the posts under Setup and this will tell you when a day is short."
        ) : (
          <>
            {short.length > 0 && (
              <span className="block">
                {listDays(short)} {short.length === 1 ? "is" : "are"} short —{" "}
                {short.map((d) => `${d.inCount} of ${d.needs}`).join(", ")}.
              </span>
            )}
            {thin.length > 0 && (
              <span className={`block ${short.length > 0 ? "mt-[3px] text-gold-bright" : ""}`}>
                {listDays(thin)} {thin.length === 1 ? "is" : "are"} covered only with a half day.
              </span>
            )}
            {short.length === 0 &&
              thin.length === 0 &&
              (offset < 0 ? "Nothing outstanding in this week." : "Every day this week is covered.")}
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-[4px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-[64px] bg-shell text-left text-[10px] font-bold tracking-[0.1em] text-fg-dim uppercase sm:w-[92px] sm:text-[10.5px]">
                Staff
              </th>
              {week.map((d) => (
                <th key={d.date} className="min-w-[38px] sm:min-w-[58px]">
                  <span
                    className={`block rounded-[10px] py-[5px] text-center ${
                      d.isToday ? "bg-gold/15 text-gold-bright" : "text-fg-faint"
                    }`}
                  >
                    <span className="block font-mono text-[10px] tracking-[0.08em] uppercase">
                      {d.weekday}
                    </span>
                    <span className="block font-mono text-[14px] font-semibold">
                      {d.dayOfMonth}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {staff.map((person) => (
              <tr key={person.id}>
                <th className="sticky left-0 z-10 max-w-[64px] truncate bg-shell pr-[4px] text-left text-[12px] font-semibold sm:max-w-none sm:text-[13px]">
                  {person.name}
                </th>
                {week.map((d) => {
                  const state = d.states[person.id] ?? "in";
                  const key = `${person.id}|${d.date}`;
                  return (
                    <td key={d.date}>
                      <button
                        type="button"
                        disabled={!canCall || saving !== null}
                        onClick={() => cycle(person.id, d.date, state)}
                        title={`${person.name}, ${d.weekday} ${d.dayOfMonth}`}
                        className={`w-full cursor-pointer rounded-[11px] border py-[10px] text-center font-mono text-[10px] font-semibold sm:text-[11px] disabled:cursor-not-allowed disabled:opacity-50 ${CELL[state]} ${
                          d.isPast ? "opacity-55" : ""
                        } ${saving === key ? "animate-pulse" : ""}`}
                      >
                        {LABEL[state]}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}

            {staff.length === 0 && (
              <tr>
                <td colSpan={8} className="py-[14px] text-[13px] text-fg-faint">
                  Nobody is set up at this centre yet.
                </td>
              </tr>
            )}
          </tbody>

          <tfoot>
            <tr>
              <th className="sticky left-0 z-10 bg-shell text-left text-[10px] font-bold tracking-[0.1em] text-fg-dim uppercase sm:text-[10.5px]">
                In
              </th>
              {week.map((d) => (
                <td key={d.date}>
                  <span
                    className={`block rounded-[10px] py-[7px] text-center font-mono text-[13px] font-semibold sm:text-[14px] ${
                      d.isPast
                        ? "text-fg-faint"
                        : d.tone === "ok"
                          ? "text-mint"
                          : d.tone === "thin"
                            ? "text-gold-bright"
                            : "bg-rust/12 text-rust"
                    }`}
                  >
                    {d.inCount}
                    {d.halfCount > 0 && (
                      <span className="ml-[2px] text-[11px] font-normal">
                        {d.halfCount > 1 && d.halfCount}+½
                      </span>
                    )}
                  </span>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="shrink-0 font-mono text-[10.5px] text-fg-faint">
        Tap a day to change it: in → off → half → in.
        {!canCall && " You can read this; a TCA or admin changes it."}
      </p>
    </div>
  );
}

const CELL: Record<DayState, string> = {
  in: "border-edge bg-panel-soft text-fg-muted hover:border-edge-warm",
  off: "border-rust/45 bg-rust/12 text-rust",
  half: "border-gold/50 bg-gold/12 text-gold-bright",
};

const LABEL: Record<DayState, string> = { in: "in", off: "off", half: "half" };
