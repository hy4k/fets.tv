"use client";

import { usePathname } from "next/navigation";
import { useConsole } from "@/lib/console-data";
import { initials } from "@/lib/format";
import { locate } from "@/lib/nav";
import { useClock } from "@/lib/use-clock";

export function Header() {
  const pathname = usePathname();
  const { center, profile } = useConsole();
  const clock = useClock(center.timezone);
  const { place } = locate(pathname);

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-[10px] rounded-[18px] border border-edge-soft header-bg px-[12px] py-[10px] md:rounded-[20px] md:px-[14px] md:py-[11px]">
      <span className="hidden items-center gap-[9px] rounded-[13px] border border-edge-strong bg-[#221d19] py-[7px] pr-[12px] pl-[9px] sm:flex">
        <span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-mint" />
        <span className="font-mono text-[11.5px] font-semibold">
          {center.site_code} · {center.name.replace(/^FETS\s+/i, "").toUpperCase()}
        </span>
      </span>

      <span className="font-serif text-[21px] leading-none md:text-[25px]">{place?.title ?? "Console"}</span>
      <span className="min-w-[12px] flex-1" />

      <span className="font-mono text-[15px] font-semibold tabular-nums md:text-[18px]">{clock}</span>
      <span
        title={`${profile.display_name} · ${profile.role.replace("_", " ")}`}
        className="hidden h-[38px] w-[38px] items-center justify-center rounded-full sm:flex bg-[linear-gradient(145deg,oklch(0.78_0.14_268),oklch(0.5_0.12_290))] text-[12px] font-bold text-[#0f0d0c]"
      >
        {initials(profile.display_name)}
      </span>
    </header>
  );
}
