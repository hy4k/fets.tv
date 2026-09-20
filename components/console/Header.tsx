"use client";

import { usePathname } from "next/navigation";
import { useConsole } from "@/lib/console-data";
import { initials } from "@/lib/format";
import { useClock } from "@/lib/use-clock";

const TITLES: Record<string, string> = {
  "/front-office": "Front Office",
  "/admin": "Admin Room",
  "/tv": "Public Display",
  "/notices": "Hall Messages",
  "/floor": "Live Floor",
  "/admin/roster": "Roster",
  "/lab": "Exam Lab",
  "/settings/center": "Center Setup",
};

export function Header() {
  const pathname = usePathname();
  const { center, profile } = useConsole();
  const clock = useClock(center.timezone);

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-[10px] rounded-[20px] border border-edge-soft header-bg px-[14px] py-[11px]">
      <span className="flex items-center gap-[9px] rounded-[13px] border border-edge-strong bg-[#221d19] py-[7px] pr-[12px] pl-[9px]">
        <span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-mint" />
        <span className="font-mono text-[11.5px] font-semibold">
          {center.site_code} · {center.name.replace(/^FETS\s+/i, "").toUpperCase()}
        </span>
      </span>

      <span className="font-serif text-[25px] leading-none">{TITLES[pathname] ?? "Console"}</span>
      <span className="min-w-[12px] flex-1" />

      <span className="font-mono text-[18px] font-semibold tabular-nums">{clock}</span>
      <span
        title={`${profile.display_name} · ${profile.role.replace("_", " ")}`}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[linear-gradient(145deg,oklch(0.78_0.14_268),oklch(0.5_0.12_290))] text-[12px] font-bold text-[#0f0d0c]"
      >
        {initials(profile.display_name)}
      </span>
    </header>
  );
}
