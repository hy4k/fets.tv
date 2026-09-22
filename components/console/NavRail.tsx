"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConsole } from "@/lib/console-data";

type Item = { href: string; n?: string; label: string; short: string; badge: number };
type Group = { key: string; title: string; items: Item[] };

/**
 * The rail follows the working day from the top down, but grouped by the room
 * the work happens in: the desk that receives people, the rooms that move them
 * through, the floor that runs the clock. Staff learn where they sit and then
 * only ever look at their own group.
 *
 * On a phone or tablet the same list becomes a scrollable bar under the
 * content, where a thumb can reach it; from md up it is the side rail.
 */
export function NavRail() {
  const pathname = usePathname();
  const { candidates, call, notice, openBreaks } = useConsole();

  const waiting = candidates.filter((c) => c.status === "waiting" && !c.called_at).length;
  const testing = candidates.filter((c) => c.exam_started_at && !c.exam_finished_at).length;

  const groups: Group[] = [
    {
      key: "front",
      title: "Front of house",
      items: [
        { href: "/roster", n: "1", label: "Roster", short: "Roster", badge: 0 },
        { href: "/candidates", n: "2", label: "Candidates", short: "List", badge: candidates.length },
        {
          href: "/front-office",
          n: "3",
          label: "Front Office",
          short: "Front",
          badge: call?.candidate_id ? 1 : 0,
        },
      ],
    },
    {
      key: "inside",
      title: "Inside",
      items: [
        { href: "/admin", n: "4", label: "Admin Room", short: "Admin", badge: waiting },
        { href: "/lab", n: "5", label: "Lab", short: "Lab", badge: 0 },
      ],
    },
    {
      key: "floor",
      title: "Running",
      items: [
        {
          href: "/floor",
          n: "6",
          label: "Live Floor",
          short: "Floor",
          badge: testing + openBreaks.length,
        },
      ],
    },
    {
      key: "aside",
      title: "Elsewhere",
      items: [
        { href: "/history", label: "Past days", short: "Past", badge: 0 },
        { href: "/tv", label: "TV screen", short: "TV", badge: 0 },
        { href: "/notices", label: "Messages", short: "Message", badge: notice ? 1 : 0 },
        { href: "/settings/center", label: "Setup", short: "Setup", badge: 0 },
      ],
    },
  ];

  const isActive = (href: string) => (href === "/tv" ? pathname === href : pathname.startsWith(href));

  return (
    <nav
      className="flex shrink-0 gap-[6px] overflow-x-auto overflow-y-hidden rounded-[18px] border border-edge-soft rail-bg p-[8px] md:w-[212px] md:flex-col md:self-stretch md:overflow-x-hidden md:overflow-y-auto md:rounded-[22px] md:p-[12px]"
      aria-label="Console sections"
    >
      <div className="mb-[10px] hidden items-center gap-[10px] px-[4px] md:flex">
        <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[13px] gold-bg font-serif text-[21px] text-[#1a1512]">
          F
        </span>
        <span className="font-mono text-[11px] tracking-[0.14em] text-fg-dim">FETS</span>
      </div>

      {groups.map((group, i) => (
        <div key={group.key} className="contents md:block">
          {/* The heading only earns its space on the rail; in the phone bar the
              gap between groups says the same thing in less room. */}
          <span
            className={`hidden px-[6px] pb-[5px] text-[9.5px] font-bold tracking-[0.16em] text-fg-faint uppercase md:block ${
              i > 0 ? "pt-[14px]" : ""
            }`}
          >
            {group.title}
          </span>

          {i > 0 && (
            <span className="mx-[3px] w-px shrink-0 self-stretch bg-edge-soft md:hidden" aria-hidden />
          )}

          <span className="contents md:block md:space-y-[4px]">
            {group.items.map((item) => (
              <RailLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
                muted={group.key === "aside"}
              />
            ))}
          </span>
        </div>
      ))}
    </nav>
  );
}

function RailLink({ item, active, muted = false }: { item: Item; active: boolean; muted?: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-[46px] shrink-0 flex-col items-center justify-center gap-[3px] rounded-[13px] border px-[13px] py-[8px] transition-colors md:min-h-0 md:flex-row md:justify-start md:gap-[10px] md:rounded-[14px] md:px-[11px] md:py-[11px] ${
        active
          ? "border-gold/55 bg-gold/10 text-fg"
          : "border-transparent text-fg-dim hover:border-edge-warm hover:bg-panel-soft hover:text-fg"
      }`}
    >
      <span
        className={`hidden h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] font-mono text-[11px] font-semibold md:flex ${
          !item.n ? "opacity-0" : active ? "bg-gold text-[#1a1512]" : "bg-panel-soft text-fg-faint"
        }`}
      >
        {item.n ?? "·"}
      </span>

      <span
        className={`whitespace-nowrap md:min-w-0 md:flex-1 md:truncate ${
          muted ? "text-[12px] md:text-[12.5px]" : "text-[12px] font-semibold md:text-[13.5px]"
        }`}
      >
        <span className="md:hidden">{item.short}</span>
        <span className="hidden md:inline">{item.label}</span>
      </span>

      {item.badge > 0 && (
        <span className="absolute top-[4px] right-[5px] flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-gold px-[4px] font-mono text-[9.5px] font-semibold text-[#1a1512] md:static md:h-[19px] md:min-w-[19px] md:px-[5px] md:text-[10px]">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
    </Link>
  );
}
