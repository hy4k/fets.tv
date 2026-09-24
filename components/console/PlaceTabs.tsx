"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { URGENT, useStepBadges } from "@/components/console/NavRail";
import { useConsole } from "@/lib/console-data";
import { locate } from "@/lib/nav";

/**
 * The steps inside the current place, across the top of the page.
 *
 * Numbered steps are drawn as a journey — joined by a line, in the order a
 * candidate goes through them — because that is what they are. The current
 * step is lit in the place's colour. Counts are quiet; only a number somebody
 * must act on is red, the same rule the rail follows.
 */
export function PlaceTabs() {
  const pathname = usePathname();
  const badges = useStepBadges();
  const { profile } = useConsole();
  const { place, step: here } = locate(pathname);
  if (!place) return null;
  const steps = place.steps.filter((s) => !s.staffOnly || profile.role !== "viewer");

  return (
    <nav
      className="relative flex shrink-0 items-stretch gap-[4px] overflow-x-auto rounded-[18px] border border-edge-soft header-bg p-[5px] md:rounded-[20px] md:p-[6px]"
      aria-label={`${place.title} steps`}
    >
      {steps.map((step, i) => {
        const active = step.key === here?.key;
        const passed = !!step.n && (here?.n ?? 0) >= step.n;
        const badge = badges[step.key] ?? 0;
        const urgent = URGENT.includes(step.key);
        return (
          <div
            key={step.key}
            className={`flex min-w-0 shrink-0 items-center gap-[4px] ${step.n && !active ? "sm:flex-1" : "flex-1"}`}
          >
            {i > 0 && step.n && (
              <span
                aria-hidden
                className={`hidden h-[2px] w-[20px] shrink-0 rounded-full md:block ${passed ? "bg-accent/70" : "bg-edge-strong"}`}
              />
            )}
            <Link
              href={step.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 items-center gap-[11px] rounded-[14px] border px-[11px] py-[8px] transition-all duration-200 md:px-[14px] md:py-[10px] ${
                active
                  ? "border-accent/45 bg-[linear-gradient(120deg,color-mix(in_oklab,var(--place-accent)_18%,transparent),color-mix(in_oklab,var(--place-accent-2)_6%,transparent))] text-fg accent-glow"
                  : "border-transparent text-fg-dim hover:bg-panel-soft/80 hover:text-fg"
              }`}
            >
              {step.n && (
                <span
                  className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full font-mono text-[11.5px] font-bold ${
                    active
                      ? "gold-bg text-[#141418]"
                      : passed
                        ? "border border-accent/50 text-accent"
                        : "border border-edge-strong text-fg-faint"
                  }`}
                >
                  {step.n}
                </span>
              )}
              {/* On a phone a numbered step that is not open shows only its
                  number, so the open one has room for its whole name. */}
              <span className={`min-w-0 ${step.n && !active ? "hidden sm:block" : ""}`}>
                <span className="block truncate text-[13px] font-semibold md:text-[14.5px]">{step.label}</span>
                <span className={`hidden truncate font-mono text-[10px] sm:block ${active ? "text-accent" : "text-fg-faint"}`}>
                  {step.sub}
                </span>
              </span>
              {badge > 0 && (
                <span
                  className={`ml-auto flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full px-[6px] font-mono text-[10.5px] font-bold ${
                    urgent ? "bg-rust text-[#141418]" : "bg-fg/10 text-fg-muted"
                  }`}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
