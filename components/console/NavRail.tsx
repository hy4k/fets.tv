"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import { useConsole } from "@/lib/console-data";
import { locate, PLACES, type PlaceKey, type StepKey } from "@/lib/nav";
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
const URGENT: StepKey[] = ["checkin", "security", "duty", "incidents"];

/**
 * Four places, not thirteen pages.
 *
 * Each tile is a room; the steps inside it are the tabs across the top of the
 * page. The active tile carries a gold tongue on its inner edge that lines up
 * with the gold edge of those tabs, so the eye reads the rail and the tab bar
 * as one piece — this place, and where in it you are.
 *
 * On a phone the four tiles sit in a bar under the content, which a thumb can
 * reach and which now fits without scrolling.
 */
export function NavRail() {
  const pathname = usePathname();
  const badges = useStepBadges();
  const { place: herePlace, step: hereStep } = locate(pathname);
  const here = herePlace?.key;

  return (
    <nav
      className="grid shrink-0 grid-cols-4 gap-[6px] rounded-[18px] border border-edge-soft rail-bg p-[6px] md:flex md:w-[196px] md:flex-col md:gap-[8px] md:self-stretch md:rounded-[22px] md:p-[12px]"
      aria-label="Console places"
    >
      <Link href="/" className="mb-[8px] hidden items-center gap-[10px] px-[4px] md:flex" aria-label="FETS home">
        <LogoMark size={34} className="text-fg" />
        <span className="font-serif text-[20px] leading-none tracking-[0.04em]">FETS</span>
      </Link>

      {PLACES.map((place) => {
        const urgent = place.steps.reduce(
          (n, s) => n + (URGENT.includes(s.key) ? (badges[s.key] ?? 0) : 0),
          0,
        );
        return (
          <PlaceTile
            key={place.key}
            placeKey={place.key}
            title={place.title}
            hint={place.hint}
            href={place.steps[0].href}
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
  records: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7",
};

function PlaceTile({
  placeKey,
  title,
  hint,
  href,
  numbered,
  badge,
  active,
  currentStep,
}: {
  placeKey: PlaceKey;
  title: string;
  hint: string;
  href: string;
  numbered: number[];
  badge: number;
  active: boolean;
  currentStep?: number;
}) {
  const major = numbered.length > 0;
  return (
    <Link
      href={href}
      // "true", not "page": the tile marks the place you are in, but it
      // links to that place's first step, which may not be this page.
      aria-current={active ? "true" : undefined}
      className={`relative flex min-h-[52px] flex-col items-center justify-center gap-[4px] rounded-[14px] border px-[6px] py-[8px] transition-colors md:items-stretch md:gap-[8px] md:rounded-[16px] md:px-[12px] md:py-[12px] ${
        major ? "md:min-h-[104px]" : "md:min-h-0"
      } ${
        active
          ? "border-gold/60 bg-gold/10 text-fg"
          : "border-transparent text-fg-dim hover:border-edge-warm hover:bg-panel-soft hover:text-fg"
      }`}
    >
      {/* The tongue: meets the gold edge of the tab bar on the other side. */}
      {active && (
        <span
          aria-hidden
          className="absolute top-1/2 -right-[13px] hidden h-[34px] w-[6px] -translate-y-1/2 rounded-r-[4px] gold-bg md:block"
        />
      )}

      <span className="flex flex-col items-center gap-[3px] md:flex-row md:gap-[9px]">
        <svg
          viewBox="0 0 24 24"
          className={`h-[19px] w-[19px] shrink-0 ${active ? "text-gold" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d={GLYPH[placeKey]} />
        </svg>
        <span className="whitespace-nowrap text-[11px] font-semibold md:text-[15px]">{title}</span>
      </span>

      {major && (
        <span className="hidden items-center gap-[5px] md:flex" aria-hidden>
          {numbered.map((n, i) => (
            <span key={n} className="flex items-center gap-[5px]">
              {i > 0 && <span className={`h-px w-[12px] ${active ? "bg-gold/60" : "bg-edge-strong"}`} />}
              <span
                className={`flex h-[20px] w-[20px] items-center justify-center rounded-full border font-mono text-[10px] font-semibold ${
                  n === currentStep
                    ? "border-gold bg-gold text-[#1a1512]"
                    : active
                      ? "border-gold/50 text-gold"
                      : "border-transparent bg-panel-soft text-fg-faint"
                }`}
              >
                {n}
              </span>
            </span>
          ))}
        </span>
      )}

      <span className="hidden font-mono text-[10px] leading-[1.35] text-fg-faint md:block">{hint}</span>

      {badge > 0 && (
        <span className="absolute top-[4px] right-[5px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold px-[5px] font-mono text-[10px] font-semibold text-[#1a1512] md:top-[10px] md:right-[10px]">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
