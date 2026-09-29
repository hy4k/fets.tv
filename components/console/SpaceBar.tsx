"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import { URGENT, useStepBadges } from "@/components/console/badges";
import { CentreSwitcher } from "@/components/console/CentreSwitcher";
import { centreLook } from "@/lib/centres";
import { useConsole } from "@/lib/console-data";
import { initials } from "@/lib/format";
import { locate, PLACES, toneVars, type Place } from "@/lib/nav";
import { useClock } from "@/lib/use-clock";

/**
 * The bar across the top: which space you are in, and the way to the others.
 *
 * The console is laid out like the building. Front of house — the Lobby and
 * Arrivals, where the desk team works — sits together; the Exam Hall is set
 * apart, a room of its own; Duty, the hall TV and the office are to one side.
 * Each space is a page of its own with its own colour and hero, so moving
 * between them feels like walking into another room rather than swapping the
 * right half of the same screen.
 */
export function SpaceBar() {
  const pathname = usePathname();
  const badges = useStepBadges();
  const { center, profile } = useConsole();
  const clock = useClock(center.timezone);
  const look = centreLook(center.name);
  const here = locate(pathname).place?.key;

  const urgent = (place: Place) =>
    place.steps.reduce((n, s) => n + (URGENT.includes(s.key) ? (badges[s.key] ?? 0) : 0), 0);
  const front = PLACES.filter((p) => p.wing === "front");
  const hall = PLACES.filter((p) => p.wing === "hall");
  const more = PLACES.filter((p) => p.wing === "more");

  return (
    <header className="relative z-20 flex shrink-0 flex-wrap items-center gap-x-[18px] gap-y-[10px] border-b border-edge-soft bg-ink/85 px-[14px] py-[10px] backdrop-blur-md md:min-h-[68px] md:flex-nowrap md:px-[28px]">
      <span className="flex min-w-0 items-center gap-[11px]">
        <Link href="/" aria-label="FETS home" className="shrink-0">
          <LogoMark size={32} tone={look.tone} className="text-fg" />
        </Link>
        <span className="min-w-0 leading-none">
          <span className="block text-[14.5px] font-semibold tracking-[0.01em]">FETS.online</span>
          <span className="mt-[4px] block font-mono text-[10.5px] text-fg-dim">
            <CentreSwitcher />
          </span>
        </span>
      </span>

      <nav
        aria-label="Spaces"
        className="order-last -mx-[14px] w-[calc(100%+28px)] overflow-x-auto px-[14px] md:order-none md:mx-0 md:flex md:w-auto md:flex-1 md:justify-center md:overflow-visible md:px-0"
      >
        <span className="inline-flex items-center gap-[4px] rounded-full border border-edge-mid bg-panel-deep p-[4px]">
          <span className="hidden pr-[8px] pl-[12px] font-mono text-[9.5px] tracking-[0.16em] text-fg-faint uppercase xl:inline">
            Front of house
          </span>
          {front.map((p) => (
            <SpacePill key={p.key} place={p} active={here === p.key} badge={urgent(p)} />
          ))}
          <span aria-hidden className="mx-[6px] h-[22px] w-px bg-edge-strong" />
          {hall.map((p) => (
            <SpacePill key={p.key} place={p} active={here === p.key} badge={urgent(p)} />
          ))}
          {/* On a phone the side rooms join the row; from md up they sit in the corner. */}
          {more.map((p) => (
            <span key={p.key} className="contents md:hidden">
              <SpacePill place={p} active={here === p.key} badge={urgent(p)} />
            </span>
          ))}
        </span>
      </nav>

      <span className="ml-auto flex items-center gap-[4px] md:ml-0">
        {more.map((p) => {
          const n = urgent(p);
          const on = here === p.key;
          return (
            <Link
              key={p.key}
              href={p.steps[0].href}
              aria-current={on ? "true" : undefined}
              style={toneVars(p) as React.CSSProperties}
              className={`relative hidden rounded-full px-[11px] py-[7px] text-[12.5px] font-medium transition-colors sm:inline-flex ${
                on ? "bg-accent/15 text-accent" : "text-fg-dim hover:text-fg"
              }`}
            >
              {p.title}
              {n > 0 && (
                <span className="ml-[6px] flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-rust px-[4px] font-mono text-[9.5px] font-bold text-[#141418]">
                  {n > 99 ? "99+" : n}
                </span>
              )}
            </Link>
          );
        })}
        <span aria-hidden className="mx-[8px] hidden h-[26px] w-px bg-edge-strong sm:block" />
        <span className="font-mono text-[16px] font-semibold tabular-nums md:text-[18px]">{clock}</span>
        <span
          title={`${profile.display_name} · ${profile.role.replace("_", " ")}`}
          className="ml-[10px] flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-edge-warm text-[11.5px] font-bold"
        >
          {initials(profile.display_name)}
        </span>
      </span>
    </header>
  );
}

function SpacePill({ place, active, badge }: { place: Place; active: boolean; badge: number }) {
  return (
    <Link
      href={place.steps[0].href}
      // "true", not "page": the pill marks the space you are in, but links to
      // its first step, which may not be this page.
      aria-current={active ? "true" : undefined}
      style={toneVars(place) as React.CSSProperties}
      className={`relative inline-flex shrink-0 items-center gap-[7px] rounded-full px-[16px] py-[8px] text-[13.5px] whitespace-nowrap transition-all duration-200 md:px-[20px] ${
        active ? "gold-bg font-semibold text-[#141418]" : "font-medium text-fg-muted hover:bg-panel-soft hover:text-fg"
      }`}
    >
      {place.title}
      {badge > 0 && (
        <span
          className={`flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-[4px] font-mono text-[9.5px] font-bold ${
            active ? "bg-[#141418]/80 text-accent" : "bg-rust text-[#141418]"
          }`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
