"use client";

import { usePathname } from "next/navigation";
import { CentreSwitcher } from "@/components/console/CentreSwitcher";
import { useConsole } from "@/lib/console-data";
import { initials } from "@/lib/format";
import { locate } from "@/lib/nav";
import { useClock, useNow } from "@/lib/use-clock";

/**
 * Where you are and what time it is.
 *
 * The place is named in its own colour with the step beside it, so the
 * header alone answers "which screen is this" — the thing a person walking up
 * to someone else's desk needs first.
 */
export function Header() {
  const pathname = usePathname();
  const { center, profile } = useConsole();
  const clock = useClock(center.timezone);
  const now = useNow();
  const { place, step } = locate(pathname);
  const date =
    now === 0
      ? ""
      : new Intl.DateTimeFormat("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: center.timezone,
        }).format(new Date(now));

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-[12px] rounded-[18px] border border-edge-soft header-bg px-[12px] py-[10px] md:rounded-[20px] md:px-[16px] md:py-[12px]">
      <span className="flex min-w-0 items-center gap-[12px]">
        <span aria-hidden className="hidden h-[34px] w-[4px] shrink-0 rounded-full gold-bg sm:block" />
        <span className="min-w-0">
          <span className="flex items-baseline gap-[9px]">
            <span className="font-serif text-[22px] leading-none text-accent md:text-[27px]">
              {place?.title ?? "Console"}
            </span>
            {step && (
              <span className="truncate text-[14px] font-semibold text-fg md:text-[16px]">
                <span className="mr-[8px] text-fg-faint">/</span>
                {step.label}
              </span>
            )}
          </span>
          <span className="mt-[5px] flex items-center gap-[8px] font-mono text-[10.5px] text-fg-dim">
            <CentreSwitcher />
            {step && <span className="hidden text-fg-faint sm:inline">{step.sub}</span>}
          </span>
        </span>
      </span>

      <span className="min-w-[12px] flex-1" />

      <span className="text-right">
        <span className="block font-mono text-[17px] leading-none font-semibold tabular-nums md:text-[22px]">
          {clock}
        </span>
        <span className="mt-[3px] hidden font-mono text-[10px] tracking-[0.06em] text-fg-faint uppercase sm:block">
          {date}
        </span>
      </span>
      <span className="hidden h-[34px] w-px bg-edge-strong sm:block" aria-hidden />
      <span className="hidden items-center gap-[10px] sm:flex">
        <span
          title={`${profile.display_name} · ${profile.role.replace("_", " ")}`}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full gold-bg text-[12px] font-bold text-[#141418]"
        >
          {initials(profile.display_name)}
        </span>
        <span className="hidden leading-tight lg:block">
          <span className="block text-[13px] font-semibold">{profile.display_name}</span>
          <span className="block font-mono text-[10px] text-fg-faint capitalize">{profile.role.replace("_", " ")}</span>
        </span>
      </span>
    </header>
  );
}
