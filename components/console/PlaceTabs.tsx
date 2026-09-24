"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStepBadges } from "@/components/console/NavRail";
import { useConsole } from "@/lib/console-data";
import { locate } from "@/lib/nav";

/**
 * The steps inside the current place, across the top of the page.
 *
 * Numbered steps are drawn as a journey — joined by a line, in the order a
 * candidate goes through them — because that is what they are. The rest are
 * plain tabs. The gold left edge is where the rail's tongue meets it.
 */
export function PlaceTabs() {
  const pathname = usePathname();
  const badges = useStepBadges();
  const { profile } = useConsole();
  const { place, step: here } = locate(pathname);
  if (!place) return null;
  const steps = place.steps.filter((s) => !s.staffOnly || profile.role !== "viewer");
  // Three steps share the width; five would be squeezed to "Problem r…", so
  // they keep their natural width and the bar scrolls instead.
  const fill = steps.length <= 3;

  return (
    <div
      className="relative flex shrink-0 items-stretch gap-[4px] overflow-x-auto rounded-[18px] border border-edge-soft header-bg p-[6px] md:rounded-[20px] md:border-l-[3px] md:border-l-gold/70"
      role="tablist"
      aria-label={place.title}
    >
      {steps.map((step, i) => {
        const active = step.key === here?.key;
        const badge = badges[step.key] ?? 0;
        return (
          <div key={step.key} className={`flex shrink-0 items-center gap-[4px] ${fill ? "min-w-0 md:flex-1" : ""}`}>
            {i > 0 && step.n && (
              <span aria-hidden className={`hidden h-px w-[18px] shrink-0 md:block ${active || (here?.n ?? 0) >= step.n ? "bg-gold/60" : "bg-edge-strong"}`} />
            )}
            <Link
              href={step.href}
              role="tab"
              aria-selected={active}
              className={`flex min-w-0 flex-1 items-center gap-[10px] rounded-[13px] border px-[11px] py-[8px] transition-colors md:px-[13px] md:py-[9px] ${
                active
                  ? "border-gold/55 bg-gold/10 text-fg"
                  : "border-transparent text-fg-dim hover:bg-panel-soft hover:text-fg"
              }`}
            >
              {step.n && (
                <span
                  className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold ${
                    active ? "bg-gold text-[#1a1512]" : "bg-panel-soft text-fg-dim"
                  }`}
                >
                  {step.n}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold md:text-[14px]">{step.label}</span>
                <span className="hidden truncate font-mono text-[10px] text-fg-faint sm:block">{step.sub}</span>
              </span>
              {badge > 0 && (
                <span className="ml-auto flex h-[19px] min-w-[19px] shrink-0 items-center justify-center rounded-full bg-gold px-[5px] font-mono text-[10px] font-semibold text-[#1a1512]">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
