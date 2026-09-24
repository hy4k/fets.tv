"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import { centreLook, shortName } from "@/lib/centres";
import { useConsole } from "@/lib/console-data";
import { locate, PLACES, toneVars, type Place, type PlaceKey, type StepKey } from "@/lib/nav";
import { useNow } from "@/lib/use-clock";

/**
 * How many things want attention, per step. Shared by the rail (summed per
 * place) and the tabs across the top (one each), so the two never disagree.
 */
export function useStepBadges(): Partial<Record<StepKey, number>> {
  const now = useNow();
  const { candidates, call, notice, openBreaks, incidents, dutyBlocks } = useConsole();

  const waiting = candidates.filter((c) => c.status === "waiting" && !c.called_at).length;
  const testing = candidates.filter((c) => c.exam_started_at && !c.exam_finished_at).length;
  const openIncidents = incidents.filter((i) => !i.resolved_at).length;
  const pastBlock = dutyBlocks.filter(
    (b) => !b.ended_at && now > 0 && new Date(b.started_at).getTime() + b.minutes * 60000 <= now,
  ).length;

  return {
    candidates: candidates.length,
    checkin: call?.candidate_id ? 1 : 0,
    security: waiting,
    live: testing + openBreaks.length,
    duty: pastBlock,
    incidents: openIncidents,
    messages: notice ? 1 : 0,
  };
}

/** Only these count toward the number on a place: things somebody must act on. */
export const URGENT: StepKey[] = ["checkin", "security", "duty", "incidents"];

/**
 * Five places, each in its own colour.
 *
 * Every tile always wears its place's colour — a small lit badge for the icon
 * — so the rail reads as a set of rooms rather than a list. The one you are
 * in glows in that colour, and the same colour washes the header, the step
 * bar, the primary buttons and the light behind the page (see PlaceShell), so
 * the whole screen says where you are.
 *
 * On a phone the five tiles sit in a bar under the content, where a thumb can
 * reach them.
 */
export function NavRail() {
  const pathname = usePathname();
  const badges = useStepBadges();
  const { place: herePlace, step: hereStep } = locate(pathname);
  const here = herePlace?.key;
  const { center } = useConsole();
  const look = centreLook(center.name);

  return (
    <nav
      className="grid shrink-0 grid-cols-5 gap-[4px] rounded-[18px] border border-edge-soft rail-bg p-[5px] md:flex md:w-[204px] md:flex-col md:gap-[6px] md:self-stretch md:rounded-[24px] md:p-[12px]"
      aria-label="Console places"
    >
      {/* The mark in the centre's own metal, and the centre under the name:
          gold for Calicut, pearl and harbour blue for Cochin. */}
      <Link href="/" className="mb-[10px] hidden items-center gap-[11px] px-[6px] pt-[4px] md:flex" aria-label="FETS home">
        <LogoMark size={34} tone={look.tone} className="text-fg" />
        <span className="leading-none">
          <span className="block font-serif text-[21px] tracking-[0.04em]">FETS</span>
          <span
            className="mt-[4px] block bg-clip-text font-mono text-[9.5px] font-semibold tracking-[0.2em] text-transparent uppercase"
            style={{ backgroundImage: `linear-gradient(90deg, ${look.tone[0]}, ${look.tone[1]})` }}
          >
            {shortName(center.name)}
          </span>
        </span>
      </Link>

      {PLACES.map((place) => {
        const urgent = place.steps.reduce(
          (n, s) => n + (URGENT.includes(s.key) ? (badges[s.key] ?? 0) : 0),
          0,
        );
        return (
          <PlaceTile
            key={place.key}
            place={place}
            numbered={place.steps.filter((s) => s.n).map((s) => s.n!)}
            badge={urgent}
            active={here === place.key}
            currentStep={here === place.key ? hereStep?.n : undefined}
          />
        );
      })}
    </nav>
  );
}

const GLYPH: Record<PlaceKey, string> = {
  arrivals: "M4 20V9l8-5 8 5v11M9 20v-6h6v6",
  hall: "M3 7h18M3 12h18M3 17h18M7 4v16M17 4v16",
  duty: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 2",
  screen: "M3 5h18v11H3zM8 20h8M12 16v4",
  office: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7",
};

function PlaceTile({
  place,
  numbered,
  badge,
  active,
  currentStep,
}: {
  place: Place;
  numbered: number[];
  badge: number;
  active: boolean;
  currentStep?: number;
}) {
  const major = numbered.length > 0;
  return (
    <Link
      href={place.steps[0].href}
      // "true", not "page": the tile marks the place you are in, but it
      // links to that place's first step, which may not be this page.
      aria-current={active ? "true" : undefined}
      // Each tile carries its own colour, whatever page is open.
      style={toneVars(place) as React.CSSProperties}
      className={`group relative flex min-h-[54px] flex-col items-center justify-center gap-[4px] rounded-[14px] border px-[4px] py-[7px] transition-all duration-200 md:items-stretch md:gap-[9px] md:rounded-[17px] md:px-[11px] md:py-[11px] ${
        major ? "md:min-h-[100px]" : "md:min-h-0"
      } ${
        active
          ? "border-accent/50 bg-[linear-gradient(150deg,color-mix(in_oklab,var(--place-accent)_16%,transparent),transparent_75%)] text-fg accent-glow"
          : "border-transparent text-fg-dim hover:border-edge-warm hover:bg-panel-soft/70 hover:text-fg"
      }`}
    >
      <span className="flex flex-col items-center gap-[4px] md:flex-row md:gap-[10px]">
        <span
          className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[9px] transition-all md:h-[30px] md:w-[30px] md:rounded-[10px] ${
            active
              ? "gold-bg text-[#141418]"
              : "bg-[color-mix(in_oklab,var(--place-accent)_14%,transparent)] text-accent group-hover:bg-[color-mix(in_oklab,var(--place-accent)_22%,transparent)]"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[15px] w-[15px] md:h-[17px] md:w-[17px]"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d={GLYPH[place.key]} />
          </svg>
        </span>
        <span className="text-center text-[10.5px] leading-tight font-semibold whitespace-nowrap md:text-left md:text-[15px]">
          {place.title}
        </span>
      </span>

      {major && (
        <span className="hidden items-center gap-[5px] md:flex" aria-hidden>
          {numbered.map((n, i) => (
            <span key={n} className="flex items-center gap-[5px]">
              {i > 0 && <span className={`h-px w-[12px] ${active ? "bg-accent/60" : "bg-edge-strong"}`} />}
              <span
                className={`flex h-[20px] w-[20px] items-center justify-center rounded-full border font-mono text-[10px] font-semibold ${
                  n === currentStep
                    ? "border-transparent gold-bg text-[#141418]"
                    : active
                      ? "border-accent/50 text-accent"
                      : "border-transparent bg-panel-soft text-fg-faint"
                }`}
              >
                {n}
              </span>
            </span>
          ))}
        </span>
      )}

      <span className="hidden font-mono text-[10px] leading-[1.35] text-fg-faint md:block">{place.hint}</span>

      {badge > 0 && (
        <span className="absolute top-[3px] right-[4px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rust px-[5px] font-mono text-[10px] font-bold text-[#141418] shadow-[0_0_0_2px_var(--color-shell)] md:top-[10px] md:right-[10px]">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
