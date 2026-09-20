"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConsole } from "@/lib/console-data";

const AUX = [
  { href: "/floor", short: "Floor" },
  { href: "/admin/roster", short: "Roster" },
  { href: "/lab", short: "Lab" },
  { href: "/settings/center", short: "Setup" },
];

export function NavRail() {
  const pathname = usePathname();
  const { candidates, call, notice } = useConsole();

  const waiting = candidates.filter((c) => c.status === "waiting" && !c.called_at).length;

  const main = [
    { href: "/front-office", n: "01", short: "Front", badge: call?.candidate_id ? 1 : 0 },
    { href: "/admin", n: "02", short: "Admin", badge: waiting },
    { href: "/tv", n: "03", short: "TV", badge: 0 },
    { href: "/notices", n: "04", short: "Notice", badge: notice ? 1 : 0 },
  ];

  return (
    <nav className="flex shrink-0 basis-[72px] flex-col gap-[8px] self-stretch overflow-x-hidden overflow-y-auto rounded-[22px] border border-edge-soft rail-bg px-[9px] py-[13px]">
      <div className="mx-auto mb-[8px] flex h-[44px] w-[44px] items-center justify-center rounded-[14px] gold-bg font-serif text-[23px] text-[#1a1512]">
        F
      </div>

      {main.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex aspect-square w-full flex-col items-center justify-center gap-[3px] rounded-[16px] border bg-panel-soft transition-colors ${
              active ? "border-gold/55 text-fg" : "border-edge text-fg-dim hover:border-edge-warm hover:text-fg"
            }`}
          >
            {active && (
              <span className="pointer-events-none absolute inset-0 rounded-[16px] bg-[linear-gradient(150deg,oklch(0.83_0.16_82/0.22),oklch(0.83_0.16_82/0.04))]" />
            )}
            <span className="relative font-mono text-[9px] text-fg-faint">{item.n}</span>
            <span className="relative text-[9px] font-bold tracking-[0.07em] uppercase">{item.short}</span>
            {item.badge > 0 && (
              <span className="absolute top-[7px] right-[7px] flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-gold px-[4px] font-mono text-[9px] font-semibold text-[#1a1512]">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}

      <span className="mx-[4px] my-[6px] h-px bg-edge-soft" />

      {AUX.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-[13px] border border-[#241f1b] py-[9px] text-center text-[8.5px] font-bold tracking-[0.07em] uppercase transition-colors hover:border-edge-warm hover:text-fg ${
              active ? "text-gold" : "text-fg-faint"
            }`}
          >
            {item.short}
          </Link>
        );
      })}
    </nav>
  );
}
