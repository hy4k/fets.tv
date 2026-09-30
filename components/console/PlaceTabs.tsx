"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { URGENT, useStepBadges } from "@/components/console/badges";
import { useConsole } from "@/lib/console-data";
import { locate } from "@/lib/nav";

/**
 * The steps inside the current space, as a row of tabs under its hero.
 *
 * Numbered steps are the candidate's journey (01 Exams today … 08 Live exams)
 * and keep their numbers across spaces, so "step 04" means check-in wherever it
 * is said. The open one is underlined in the space's colour. Counts are quiet;
 * only a number somebody must act on is red. The next space is offered at the
 * end of the row, so the day reads forward.
 */
export function PlaceTabs() {
  const pathname = usePathname();
  const badges = useStepBadges();
  const { profile } = useConsole();
  const { place, step: here } = locate(pathname);
  // The hall switches between its two pages from its hero instead.
  if (!place || place.key === "hall") return null;
  const steps = place.steps.filter((s) => !s.staffOnly || profile.role !== "viewer");
  const onward = place.key === "lobby" ? { href: "/candidates", label: "Arrivals" } : place.key === "arrivals" ? { href: "/admin", label: "The Exam Hall" } : null;

  return (
    <nav
      className="flex shrink-0 items-stretch gap-[6px] overflow-x-auto border-b border-edge-soft md:gap-[26px]"
      aria-label={`${place.title} steps`}
    >
      {steps.map((step) => {
        const active = step.key === here?.key;
        const badge = badges[step.key] ?? 0;
        const urgent = URGENT.includes(step.key);
        return (
          <Link
            key={step.key}
            href={step.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-[9px] border-b-2 px-[6px] py-[12px] text-[14px] transition-colors md:px-[2px] md:text-[14.5px] ${
              active ? "border-accent font-semibold text-fg" : "border-transparent font-medium text-fg-dim hover:text-fg"
            }`}
          >
            {step.n && (
              <span className={`font-mono text-[11px] ${active ? "text-accent" : "text-fg-faint"}`}>
                {String(step.n).padStart(2, "0")}
              </span>
            )}
            {step.label}
            {badge > 0 && (
              <span
                className={`flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-[5px] font-mono text-[10px] font-bold ${
                  urgent ? "bg-rust text-[#141418]" : "bg-fg/10 text-fg-muted"
                }`}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        );
      })}
      <span className="min-w-[12px] flex-1" />
      {onward && (
        <Link href={onward.href} className="hidden shrink-0 items-center py-[12px] text-[13px] text-accent hover:text-fg sm:flex">
          Next: {onward.label} →
        </Link>
      )}
    </nav>
  );
}
