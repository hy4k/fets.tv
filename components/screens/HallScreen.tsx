"use client";

import Link from "next/link";
import { WalkthroughBar } from "@/components/screens/WalkthroughBar";
import { useConsole } from "@/lib/console-data";
import { fullName } from "@/lib/format";
import { useNow } from "@/lib/use-clock";
import type { WorkstationStatus } from "@/lib/types";

const SEAT: Record<WorkstationStatus, string> = {
  free: "border-edge bg-panel-soft/60",
  assigned: "border-accent/40 bg-accent/10",
  active: "border-accent/60 bg-accent/25",
  cleaning: "border-gold/40 bg-gold/10",
  fault: "border-rust/60 bg-rust/15",
};

/**
 * The whole Exam Hall on one page: who is waiting at security, which seats are
 * taken, and who is testing — with the floor-walk clock over all three.
 *
 * Each column is a view; the work itself (calling, seating, transfers) happens
 * in the full-size step, one press away, so nothing here can be done half.
 */
export function HallScreen() {
  const { candidates, call, labs, workstations, openBreaks, rules } = useConsole();
  const now = useNow();

  const called = call?.candidate_id ? candidates.find((c) => c.id === call.candidate_id) : undefined;
  // The one called forward is shown on its own, not again in the queue.
  const waiting = candidates.filter((c) => c.status === "waiting" && !c.called_at && c.id !== called?.id);
  const testing = candidates
    .filter((c) => c.exam_started_at && !c.exam_finished_at)
    .sort((a, b) => (a.exam_expected_end ?? "~").localeCompare(b.exam_expected_end ?? "~"));
  const onBreak = new Set(openBreaks.map((b) => b.candidate_id));
  const seatOf = new Map(workstations.map((w) => [w.id, w.seat_code]));
  const rooms = labs
    .map((lab) => ({ lab, seats: workstations.filter((w) => w.lab_id === lab.id) }))
    .filter((r) => r.seats.length > 0);

  const left = (iso: string | null) => {
    if (!iso || now === 0) return "—";
    const m = Math.round((Date.parse(iso) - now) / 60000);
    if (m <= 0) return "due";
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} left`;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto">
      <WalkthroughBar />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-[14px] lg:grid-cols-3">
        <Pane n={6} title="Security & ID" count={`${waiting.length + (called ? 1 : 0)} waiting`} href="/admin">
          {called && (
            <div className="rounded-[16px] border border-accent/45 bg-accent/10 px-[16px] py-[14px]">
              <span className="block font-mono text-[10px] tracking-[0.14em] text-accent uppercase">Called now</span>
              <span className="mt-[4px] block text-[16px] font-semibold">
                {called.public_token} · {fullName(called)}
              </span>
              <span className="mt-[2px] block font-mono text-[11px] text-fg-dim">
                {called.locker_key ? `Key ${called.locker_key === "NIL" ? "Nil" : called.locker_key}` : "No key"}
              </span>
            </div>
          )}
          {waiting.slice(0, 8).map((c) => (
            <Row key={c.id} code={c.public_token} name={fullName(c)}>
              {c.locker_key ? (
                <span className="font-mono text-[11px] text-fg-dim">{c.locker_key === "NIL" ? "Nil" : c.locker_key}</span>
              ) : rules.locker_key_required ? (
                <span className="font-mono text-[11px] text-rust">no key</span>
              ) : null}
            </Row>
          ))}
          {waiting.length > 8 && <More n={waiting.length - 8} href="/admin" />}
          {!called && waiting.length === 0 && <Quiet>Nobody waiting at security.</Quiet>}
        </Pane>

        <Pane n={7} title="Seating" count={`${workstations.filter((w) => w.current_candidate_id).length} seated`} href="/lab">
          {rooms.map(({ lab, seats }) => (
            <div key={lab.id} className="flex flex-col gap-[8px]">
              <span className="font-mono text-[10px] tracking-[0.14em] text-fg-faint uppercase">{lab.name}</span>
              <div className="grid grid-cols-6 gap-[6px] xl:grid-cols-8">
                {seats.map((w) => (
                  <span
                    key={w.id}
                    title={`${w.seat_code} · ${w.status}`}
                    className={`flex h-[34px] items-center justify-center rounded-[9px] border font-mono text-[9.5px] text-fg-dim ${SEAT[w.status]}`}
                  >
                    {w.seat_code.replace(/^.*?(\d+)$/, "$1")}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {rooms.length === 0 && <Quiet>No labs set up yet.</Quiet>}
        </Pane>

        <Pane n={8} title="Live floor" count={`${testing.length} testing`} href="/floor">
          {testing.slice(0, 10).map((c) => (
            <Row key={c.id} code={(c.workstation_id && seatOf.get(c.workstation_id)) || c.public_token} name={c.part ?? fullName(c)}>
              {onBreak.has(c.id) ? (
                <span className="font-mono text-[11px] text-gold-bright">break</span>
              ) : (
                <span className="font-mono text-[11px] text-accent">{left(c.exam_expected_end)}</span>
              )}
            </Row>
          ))}
          {testing.length > 10 && <More n={testing.length - 10} href="/floor" />}
          {testing.length === 0 && <Quiet>Nobody testing yet.</Quiet>}
        </Pane>
      </div>
    </div>
  );
}

function Pane({ n, title, count, href, children }: { n: number; title: string; count: string; href: string; children: React.ReactNode }) {
  return (
    <section className="flex min-h-[260px] flex-col overflow-hidden rounded-[22px] border border-edge-mid panel-bg">
      <div className="flex items-baseline gap-[10px] border-b border-edge-soft px-[18px] py-[14px]">
        <span className="font-mono text-[11px] text-accent">{String(n).padStart(2, "0")}</span>
        <span className="font-display text-[25px] leading-none">{title}</span>
        <span className="flex-1" />
        <span className="font-mono text-[11.5px] text-fg-dim">{count}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[8px] overflow-y-auto px-[16px] py-[14px]">{children}</div>
      <Link href={href} className="border-t border-edge-soft px-[18px] py-[11px] text-[12.5px] font-semibold text-accent hover:text-fg">
        Open {title} →
      </Link>
    </section>
  );
}

function Row({ code, name, children }: { code: string; name: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-[12px] rounded-[13px] border border-edge-soft px-[14px] py-[10px]">
      <span className="w-[56px] shrink-0 font-mono text-[12px] font-semibold">{code}</span>
      <span className="min-w-0 flex-1 truncate text-[13.5px]">{name}</span>
      {children}
    </div>
  );
}

function More({ n, href }: { n: number; href: string }) {
  return (
    <Link href={href} className="px-[4px] font-mono text-[11px] text-fg-dim hover:text-fg">
      and {n} more →
    </Link>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="m-auto py-[18px] text-center text-[13px] text-fg-faint">{children}</p>;
}
