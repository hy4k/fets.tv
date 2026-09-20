"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConsole } from "@/lib/console-data";

/**
 * The rail follows the working day from the top down: import the roster, look
 * at who is coming, check them in, call them, seat them, run the clock. Staff
 * move down the list as the day goes on and never have to go back up it.
 */
export function NavRail() {
  const pathname = usePathname();
  const { candidates, call, notice, openBreaks } = useConsole();

  const waiting = candidates.filter((c) => c.status === "waiting" && !c.called_at).length;
  const testing = candidates.filter((c) => c.exam_started_at && !c.exam_finished_at).length;

  const day = [
    { href: "/roster", n: "1", label: "Roster", badge: 0 },
    { href: "/candidates", n: "2", label: "Candidates", badge: candidates.length },
    { href: "/front-office", n: "3", label: "Front Office", badge: call?.candidate_id ? 1 : 0 },
    { href: "/admin", n: "4", label: "Admin Room", badge: waiting },
    { href: "/lab", n: "5", label: "Lab", badge: 0 },
    { href: "/floor", n: "6", label: "Live Floor", badge: testing + openBreaks.length },
  ];

  const aside = [
    { href: "/tv", label: "TV screen", badge: 0 },
    { href: "/notices", label: "Messages", badge: notice ? 1 : 0 },
    { href: "/settings/center", label: "Setup", badge: 0 },
  ];

  return (
    <nav className="flex w-[212px] shrink-0 flex-col gap-[6px] self-stretch overflow-x-hidden overflow-y-auto rounded-[22px] border border-edge-soft rail-bg p-[12px]">
      <div className="mb-[10px] flex items-center gap-[10px] px-[4px]">
        <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[13px] gold-bg font-serif text-[21px] text-[#1a1512]">
          F
        </span>
        <span className="font-mono text-[11px] tracking-[0.14em] text-fg-dim">FETS</span>
      </div>

      {day.map((item) => (
        <RailLink key={item.href} item={item} active={pathname === item.href} />
      ))}

      <span className="mx-[4px] my-[10px] h-px shrink-0 bg-edge-soft" />

      {aside.map((item) => (
        <RailLink key={item.href} item={item} active={pathname.startsWith(item.href)} muted />
      ))}
    </nav>
  );
}

function RailLink({
  item,
  active,
  muted = false,
}: {
  item: { href: string; n?: string; label: string; badge: number };
  active: boolean;
  muted?: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={`relative flex shrink-0 items-center gap-[10px] rounded-[14px] border px-[11px] py-[11px] transition-colors ${
        active
          ? "border-gold/55 bg-gold/10 text-fg"
          : "border-transparent text-fg-dim hover:border-edge-warm hover:bg-panel-soft hover:text-fg"
      }`}
    >
      {item.n ? (
        <span
          className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] font-mono text-[11px] font-semibold ${
            active ? "bg-gold text-[#1a1512]" : "bg-panel-soft text-fg-faint"
          }`}
        >
          {item.n}
        </span>
      ) : (
        <span className="h-[22px] w-[22px] shrink-0" />
      )}

      <span className={`min-w-0 flex-1 truncate ${muted ? "text-[12.5px]" : "text-[13.5px] font-semibold"}`}>
        {item.label}
      </span>

      {item.badge > 0 && (
        <span className="flex h-[19px] min-w-[19px] shrink-0 items-center justify-center rounded-full bg-gold px-[5px] font-mono text-[10px] font-semibold text-[#1a1512]">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
    </Link>
  );
}
