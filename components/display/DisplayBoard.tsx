"use client";

import { useClock } from "@/lib/use-clock";

export type BoardCall = {
  token: string;
  name: string | null;
  room: string | null;
  instruction: string | null;
} | null;

export type BoardNext = { token: string; name: string | null };

export function DisplayBoard({
  hallLabel,
  timezone,
  call,
  next,
  className = "",
}: {
  hallLabel: string;
  timezone: string;
  call: BoardCall;
  next: BoardNext[];
  className?: string;
}) {
  const clock = useClock(timezone);

  return (
    <div
      className={`flex min-h-0 flex-col gap-[20px] overflow-hidden rounded-[24px] border border-edge-mid bg-[radial-gradient(760px_380px_at_50%_0%,oklch(0.32_0.06_82/0.4),transparent_66%),linear-gradient(170deg,#17130f,#100e0c)] p-[26px] ${className}`}
    >
      <div className="flex flex-wrap items-center gap-[12px]">
        <span className="rounded-[12px] border border-edge-strong bg-[#221d19] px-[13px] py-[8px] font-mono text-[12px] tracking-[0.14em]">
          {hallLabel}
        </span>
        <span className="flex-1" />
        <span className="flex items-center gap-[8px] font-mono text-[12px] text-mint">
          <span className="h-[8px] w-[8px] animate-pulse-dot rounded-full bg-mint" />
          LIVE
        </span>
        <span className="font-mono text-[21px] font-semibold tabular-nums">{clock}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-[12px] rounded-[22px] bg-[linear-gradient(150deg,oklch(0.83_0.16_82),oklch(0.72_0.15_62))] p-[26px] text-[#191309]">
        <span className="text-[12px] font-extrabold tracking-[0.2em] uppercase">Now calling</span>
        <span className="font-mono text-[clamp(40px,10vw,120px)] leading-[0.95] font-semibold tracking-[-0.03em] whitespace-nowrap">
          {call ? call.token : "NO CALL"}
        </span>
        <span className="overflow-hidden font-serif text-[clamp(26px,4.5vw,52px)] leading-[1.05] text-ellipsis whitespace-nowrap">
          {call ? (call.name ?? "Token only") : "Idle"}
        </span>
        <span className="mt-[4px] flex flex-wrap gap-[9px]">
          <span className="rounded-[13px] bg-[#191309] px-[16px] py-[11px] text-[14px] font-extrabold tracking-[0.07em] text-gold-bright uppercase">
            {call?.room ?? "Waiting for call"}
          </span>
          {call && (
            <span className="rounded-[13px] bg-[oklch(0.9_0.08_82/0.45)] px-[16px] py-[11px] text-[14px] font-extrabold tracking-[0.07em] uppercase">
              {call.instruction ?? "Proceed now"}
            </span>
          )}
        </span>
      </div>

      <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(168px,1fr))] gap-[12px]">
        {next.map((t) => (
          <div
            key={t.token}
            className="flex flex-col gap-[6px] rounded-[18px] border border-edge-mid bg-panel p-[15px]"
          >
            <span className="font-mono text-[clamp(18px,3vw,28px)] font-semibold whitespace-nowrap">
              {t.token}
            </span>
            <span className="overflow-hidden font-serif text-[19px] text-ellipsis whitespace-nowrap">
              {t.name ?? "—"}
            </span>
            <span className="text-[10px] font-bold tracking-[0.12em] text-fg-dim uppercase">Next</span>
          </div>
        ))}
      </div>
    </div>
  );
}
