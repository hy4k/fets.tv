"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { basePath } from "@/lib/base-path";
import { shortName } from "@/lib/centres";
import { useConsole } from "@/lib/console-data";
import type { DayTotals } from "@/lib/fets-live";
import { clockAt, isTesting, todayInZone } from "@/lib/format";
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
  return <Band place={place} />;
}

const OVERLINE: Record<Place["key"], string> = {
  lobby: "Front of house",
  arrivals: "Front of house · the desk",
  hall: "Quiet please · exams in progress",
  duty: "On duty",
  screen: "What the hall sees",
  office: "The office",
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

function Band({ place }: { place: Place }) {
  const { center, candidates, rules } = useConsole();
  const clock = useClock(center.timezone);

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
    stats.push(["Testing", String(candidates.filter(isTesting).length)]);
  }

  return (
    <section className="relative flex shrink-0 flex-wrap items-end gap-x-[28px] gap-y-[14px] overflow-hidden rounded-[24px] border border-edge-soft hero-bg px-[22px] pt-[18px] pb-[16px] md:px-[40px] md:pt-[22px] md:pb-[18px]">
      <div className="min-w-0 flex-1">
        <span className="font-mono text-[10.5px] tracking-[0.22em] text-accent/80 uppercase">{OVERLINE[place.key]}</span>
        <h1
          className={`mt-[4px] font-display text-[44px] leading-[0.95] font-light display-ink md:text-[64px] ${
            place.key === "arrivals" ? "italic" : ""
          }`}
        >
          {place.title}
        </h1>
      </div>
      {stats.length > 0 && (
        <div className="flex gap-[10px]">
          {stats.map(([label, value]) => (
            <span key={label} className="min-w-[104px] rounded-[16px] border border-accent/20 bg-ink/50 px-[14px] py-[10px]">
              <span className="block font-mono text-[9.5px] tracking-[0.12em] text-fg-faint uppercase">{label}</span>
              <span className="mt-[2px] block font-display text-[32px] leading-none">{value}</span>
            </span>
          ))}
        </div>
      )}
      {place.key === "hall" && (
        <span className="font-mono text-[38px] leading-none font-medium tabular-nums md:text-[48px]">{clock}</span>
      )}
    </section>
  );
}
