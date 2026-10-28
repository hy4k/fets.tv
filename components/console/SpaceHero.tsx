"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { basePath } from "@/lib/base-path";
import { shortName } from "@/lib/centres";
import { useConsole } from "@/lib/console-data";
import type { DayTotals } from "@/lib/fets-live";
import { calledNotSeated, clockAt, fullName, isTesting, todayInZone } from "@/lib/format";
import type { Candidate } from "@/lib/types";
import { DutyTimer } from "./DutyTimer";
import { locate, type Place } from "@/lib/nav";
import { useClock, useNow } from "@/lib/use-clock";

/**
 * The top of each space: its name, large, in its own colour.
 *
 * The Lobby gets the full hero — it is the first thing seen after signing in
 * and the front desk lives there all morning. The other spaces get a band:
 * the name, and the two or three numbers that space is about.
 */
export function SpaceHero() {
  const pathname = usePathname();
  const { place } = locate(pathname);
  if (!place) return null;
  if (place.key === "lobby") return <LobbyHero />;
  return <Band place={place} pathname={pathname} />;
}

const OVERLINE: Record<Place["key"], string> = {
  lobby: "Front of house",
  arrivals: "Front of house · the desk",
  hall: "The admin room · call to seat",
  lab: "Quiet please · exams in progress",
  screen: "What the hall sees",
  office: "The office",
  settings: "How the console is set up",
};

function dayLabel(now: number, timezone: string) {
  return now === 0
    ? ""
    : new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: timezone }).format(
        new Date(now),
      );
}

function greeting(now: number, timezone: string) {
  if (now === 0) return "Welcome";
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(new Date(now)));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function LobbyHero() {
  const { center, profile } = useConsole();
  const now = useNow();
  const date = todayInZone(center.timezone);
  const [totals, setTotals] = useState<DayTotals | null>(null);

  useEffect(() => {
    let stale = false;
    fetch(`${basePath}/api/fets-live/day?provider=all&date=${date}`)
      // A refusal (a viewer account) or a dead line is a reason to show, not
      // an endless "reading".
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) return { connected: false, reason: body.error ?? "The calendar could not be read." } as DayTotals;
        return body as DayTotals;
      })
      .then((t) => !stale && setTotals(t))
      .catch(() => !stale && setTotals({ connected: false, reason: "Could not reach the calendar." }));
    return () => {
      stale = true;
    };
  }, [date]);

  const first = profile.display_name.split(/\s+/)[0];
  const place = shortName(center.name);

  return (
    <section className="relative shrink-0 overflow-hidden rounded-[26px] border border-edge-soft hero-bg px-[22px] pt-[26px] pb-[22px] md:px-[48px] md:pt-[40px] md:pb-[30px] [@media(max-height:820px)]:md:pt-[26px] [@media(max-height:820px)]:md:pb-[20px]">
      {/* An arch drawn in hairline gold: the doorway into the day. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-[18px] top-[14px] bottom-[-40px] hidden rounded-t-[220px] border border-b-0 border-accent/15 md:block"
      />
      <div className="relative flex flex-col gap-[22px] lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <span className="font-mono text-[10.5px] tracking-[0.24em] text-accent/80 uppercase">
            {OVERLINE.lobby} · {place}
          </span>
          <h1 className="mt-[8px] font-display text-[56px] leading-[0.92] font-light italic display-ink md:text-[112px] [@media(max-height:820px)]:md:text-[88px]">
            The Lobby
          </h1>
          <p className="mt-[10px] font-display text-[20px] text-fg/85 md:text-[25px]">
            {greeting(now, center.timezone)}, {first}. The day begins here.
          </p>
          <p className="mt-[4px] font-mono text-[12px] text-fg-dim">{dayLabel(now, center.timezone)}</p>
          {/* On a phone the day's card folds into one line, to leave room for the page. */}
          {totals?.connected && (
            <p className="mt-[8px] font-mono text-[12px] text-accent sm:hidden">
              {totals.count} booked
              {totals.first && totals.last && ` · ${clockAt(totals.first, center.timezone)}–${clockAt(totals.last, center.timezone)}`}
            </p>
          )}
        </div>

        <div className="hidden w-full shrink-0 rounded-[22px] border border-accent/25 sm:block bg-[linear-gradient(160deg,color-mix(in_oklab,var(--place-accent)_12%,#16130f),#121115)] px-[22px] py-[18px] lg:w-[340px]">
          <span className="font-mono text-[10px] tracking-[0.16em] text-accent/85 uppercase">Today at {place} · fets.live</span>
          {totals && totals.connected ? (
            <>
              <div className="mt-[8px] flex items-baseline gap-[10px]">
                <span className="font-display text-[60px] leading-[0.9] text-fg">{totals.count}</span>
                <span className="text-[13.5px] text-fg-muted">booked</span>
              </div>
              <div className="mt-[12px] grid grid-cols-3 gap-[10px]">
                <Fig label="Providers" value={String(totals.providers)} />
                <Fig label="First in" value={totals.first ? clockAt(totals.first, center.timezone) : "—"} />
                <Fig label="Last out" value={totals.last ? clockAt(totals.last, center.timezone) : "—"} />
              </div>
            </>
          ) : (
            <p className="mt-[10px] text-[13px] leading-[1.5] text-fg-muted">
              {totals === null ? "Reading the calendar…" : totals.reason}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="block font-mono text-[9.5px] tracking-[0.12em] text-fg-faint uppercase">{label}</span>
      <span className="mt-[3px] block text-[17px] font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function Band({ place, pathname }: { place: Place; pathname: string }) {
  const { center, candidates, rules } = useConsole();
  const clock = useClock(center.timezone);
  const now = useNow();

  const stats: [string, string][] = [];
  if (place.key === "arrivals") {
    const inUse = new Set(candidates.map((c) => c.locker_key).filter((k) => k && k !== "NIL"));
    const bank = center.locker_count ?? 0;
    stats.push(["Booked", String(candidates.length)]);
    stats.push(["Checked in", String(candidates.filter((c) => c.check_in_at).length)]);
    if (rules.locker_key_required || bank) stats.push(["Keys free", `${Math.max(0, bank - inUse.size)}/${bank}`]);
  }
  if (place.key === "hall") {
    stats.push(["Waiting", String(candidates.filter((c) => c.status === "waiting" && !c.called_at).length)]);
    stats.push(["To seat", String(candidates.filter((c) => calledNotSeated(c) || (c.status === "assigned" && !c.workstation_id)).length)]);
  }
  if (place.key === "lab") {
    stats.push(["Testing", String(candidates.filter(isTesting).length)]);
  }
  const cue = nextCue(place.key, candidates, now, center.timezone);

  // One line: the space, what it should do next, its numbers and the time. The
  // page itself starts straight under it.
  return (
    <section className="relative flex shrink-0 flex-wrap items-center gap-x-[22px] gap-y-[10px] overflow-hidden rounded-[22px] border border-edge-soft hero-bg px-[18px] py-[12px] md:px-[28px] md:py-[14px]">
      <div className="min-w-0 flex-1">
        <span className="font-mono text-[10px] tracking-[0.22em] text-accent/80 uppercase">{OVERLINE[place.key]}</span>
        <div className="flex flex-wrap items-baseline gap-x-[16px] gap-y-[2px]">
          <h1
            className={`font-display text-[32px] leading-[1] font-light display-ink md:text-[40px] ${
              place.key === "arrivals" ? "italic" : ""
            }`}
          >
            {place.title}
          </h1>
          {cue && (
            <span className="flex min-w-0 items-center gap-[8px] text-[13.5px] text-fg">
              <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent motion-safe:animate-pulse" />
              <span className="truncate">{cue}</span>
            </span>
          )}
        </div>
      </div>
      {stats.length > 0 && (
        <div className="flex gap-[8px]">
          {stats.map(([label, value]) => (
            <span key={label} className="min-w-[84px] rounded-[14px] border border-accent/20 bg-ink/50 px-[12px] py-[6px]">
              <span className="block font-mono text-[9px] tracking-[0.12em] text-fg-faint uppercase">{label}</span>
              <span className="block font-display text-[24px] leading-none">{value}</span>
            </span>
          ))}
        </div>
      )}
      {(place.key === "hall" || place.key === "lab") && (
        <span className="font-mono text-[26px] leading-none font-medium tabular-nums md:text-[32px]">{clock}</span>
      )}
      {place.key === "lab" && <DutyTimer />}
      {place.key === "screen" && <ScreenSwitch place={place} pathname={pathname} />}
    </section>
  );
}

/**
 * What this space should do next, in one sentence: the cue each page plays
 * its part on. Null when there is nothing to prompt.
 */
function nextCue(key: Place["key"], candidates: Candidate[], now: number, timezone: string): string | null {
  const at = (iso: string | null) => (iso ? clockAt(iso, timezone) : "");
  if (key === "arrivals") {
    const toCome = candidates
      .filter((c) => c.status === "scheduled" && !c.placeholder)
      .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
    if (toCome.length === 0) return candidates.length ? "Everyone booked is in" : null;
    const n = toCome[0];
    return `Next: ${fullName(n)}${n.scheduled_at ? ` at ${at(n.scheduled_at)}` : ""} · ${toCome.length} still to come`;
  }
  if (key === "hall") {
    const waiting = candidates
      .filter((c) => c.status === "waiting" && !c.called_at)
      .sort((a, b) => (a.check_in_at ?? "").localeCompare(b.check_in_at ?? ""));
    const toSeat = candidates.filter((c) => calledNotSeated(c) || (c.status === "assigned" && !c.workstation_id)).length;
    if (toSeat > 0) return `${toSeat} called · assign ${toSeat === 1 ? "a seat" : "seats"}${waiting.length ? ` · next to call: ${fullName(waiting[0])}` : ""}`;
    if (waiting.length) return `Next: call ${fullName(waiting[0])} · ${waiting.length} waiting`;
    return null;
  }
  if (key === "lab") {
    if (now === 0) return null;
    const ending = candidates
      .filter((c) => isTesting(c) && c.exam_expected_end)
      .map((c) => ({ c, end: new Date(c.exam_expected_end!).getTime() }))
      .sort((a, b) => a.end - b.end);
    const soon = ending.filter((x) => x.end - now <= 10 * 60000);
    if (soon.length) return `${soon.length} finishing in 10 min · first: ${fullName(soon[0].c)} at ${at(soon[0].c.exam_expected_end)}`;
    if (ending.length) return `Next to finish: ${fullName(ending[0].c)} at ${at(ending[0].c.exam_expected_end)}`;
    return null;
  }
  return null;
}

/**
 * The Hall TV's three pages as bright pills in the banner itself: what the
 * hall sees now, the home screen, and messages. Rose to violet, so it reads
 * as the TV's own control rather than one more grey tab row.
 */
function ScreenSwitch({ place, pathname }: { place: Place; pathname: string }) {
  const here = locate(pathname).step?.key;
  return (
    <nav aria-label="Hall TV pages" className="flex w-full basis-full flex-wrap gap-[8px]">
      {place.steps.map((s) => {
        const on = s.key === here;
        return (
          <Link
            key={s.key}
            href={s.href}
            aria-current={on ? "page" : undefined}
            className={`flex min-w-[150px] flex-1 flex-col rounded-[16px] border px-[16px] py-[11px] transition-all sm:flex-none ${
              on
                ? "border-transparent bg-[linear-gradient(120deg,oklch(0.72_0.2_355),oklch(0.62_0.22_310)_55%,oklch(0.6_0.2_285))] text-white shadow-[0_14px_34px_-16px_oklch(0.65_0.22_330/0.9)]"
                : "border-[oklch(0.72_0.18_340/0.35)] bg-[oklch(0.3_0.08_340/0.25)] text-fg-muted hover:border-[oklch(0.72_0.18_340/0.7)] hover:text-fg"
            }`}
          >
            <span className="text-[14.5px] font-bold">{s.label}</span>
            <span className={`text-[11.5px] ${on ? "text-white/80" : "text-fg-faint"}`}>{s.sub}</span>
          </Link>
        );
      })}
    </nav>
  );
}

