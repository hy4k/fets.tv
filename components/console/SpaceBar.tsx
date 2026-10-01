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
 * The console is laid out like the building, in three groups on one rail: the
 * front desk (the Lobby, the Check-in), the exam rooms (the Admin, the Lab),
 * and the rest (the Hall TV, the Office) — all the same kind of pill.
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
    <header className="relative z-20 flex shrink-0 flex-wrap items-center gap-x-[18px] gap-y-[10px] border-b border-edge-soft bg-ink/85 px-[14px] py-[10px] backdrop-blur-md md:min-h-[72px] md:px-[24px] xl:flex-nowrap">
      {/* Who we are and where: the mark, the name, and the centre, plain for
          everyone to see — the switch is only a switch for staff. */}
      <span className="flex min-w-0 items-center gap-[12px]">
        <Link
          href="/"
          aria-label="FETS.online home"
          className="flex shrink-0 items-center gap-[10px] rounded-[14px] py-[2px] pr-[4px]"
        >
          <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[12px] border border-edge-strong bg-[linear-gradient(160deg,#1d1b22,#121116)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <LogoMark size={30} tone={look.tone} className="text-fg" />
          </span>
          <span className="hidden leading-none sm:block">
            <span className="block font-serif text-[22px] tracking-[0.02em]">
              FETS
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(90deg, ${look.tone[0]}, ${look.tone[1]})` }}
              >
                .online
              </span>
            </span>
            <span className="mt-[4px] block font-mono text-[9px] tracking-[0.18em] text-fg-faint uppercase">
              Exam-day console
            </span>
          </span>
        </Link>
        <span aria-hidden className="hidden h-[34px] w-px bg-edge-strong sm:block" />
        <CentreSwitcher size="lg" />
      </span>

      <nav
        aria-label="Spaces"
        className="order-last -mx-[14px] w-[calc(100%+28px)] overflow-x-auto px-[14px] md:flex md:justify-center xl:order-none xl:mx-0 xl:w-auto xl:flex-1 xl:overflow-visible xl:px-0"
      >
        <span className="inline-flex items-center gap-[4px] rounded-full border border-edge-mid bg-panel-deep p-[4px]">
          {front.map((p) => (
            <SpacePill key={p.key} place={p} active={here === p.key} badge={urgent(p)} />
          ))}
          <span aria-hidden className="mx-[6px] h-[22px] w-px shrink-0 bg-edge-strong" />
          {hall.map((p) => (
            <SpacePill key={p.key} place={p} active={here === p.key} badge={urgent(p)} />
          ))}
          <span aria-hidden className="mx-[6px] h-[22px] w-px shrink-0 bg-edge-strong" />
          {more.map((p) => (
            <SpacePill key={p.key} place={p} active={here === p.key} badge={urgent(p)} />
          ))}
        </span>
      </nav>

      <span className="ml-auto flex items-center gap-[4px] xl:ml-0">
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
      className={`relative inline-flex shrink-0 items-center gap-[7px] rounded-full px-[14px] py-[8px] text-[13.5px] whitespace-nowrap transition-all duration-200 lg:px-[18px] ${
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
