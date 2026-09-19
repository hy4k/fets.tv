"use client";

import { useClock } from "@/lib/use-clock";

export type BoardCall = {
  token: string;
  name: string | null;
  room: string | null;
  instruction: string | null;
} | null;

export type BoardNext = { token: string; name: string | null };

/**
 * The hall TV. Read from three to ten metres by people who are anxious and are
 * scanning for one thing: their own token. So the board has two distinct
 * states — calm while idle, unmissable while calling — rather than one layout
 * that shouts either way. Nothing internal (roster numbers, phone, place,
 * stage names) reaches this screen; it renders only what the display
 * projection hands it.
 */
export function DisplayBoard({
  hallLabel,
  timezone,
  call,
  next,
  nonce = 0,
  siteLabel,
  className = "",
}: {
  hallLabel: string;
  timezone: string;
  call: BoardCall;
  next: BoardNext[];
  nonce?: number;
  siteLabel?: string;
  className?: string;
}) {
  const clock = useClock(timezone);

  return (
    <div
      className={`flex min-h-0 flex-col gap-[2vh] overflow-hidden rounded-[24px] border border-edge-mid bg-[radial-gradient(900px_420px_at_50%_-8%,oklch(0.32_0.06_82/0.38),transparent_68%),linear-gradient(170deg,#17130f,#100e0c)] p-[clamp(16px,2.2vw,34px)] ${className}`}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-[12px]">
        <span className="flex h-[clamp(34px,3.4vw,48px)] w-[clamp(34px,3.4vw,48px)] items-center justify-center rounded-[13px] gold-bg font-serif text-[clamp(19px,2vw,27px)] text-[#1a1512]">
          F
        </span>
        <span className="font-mono text-[clamp(12px,1.25vw,18px)] tracking-[0.16em] text-fg-muted">
          {siteLabel ? `${siteLabel} · ${hallLabel}` : hallLabel}
        </span>
        <span className="min-w-[12px] flex-1" />
        <span className="font-mono text-[clamp(20px,2.4vw,36px)] font-semibold tabular-nums">{clock}</span>
      </header>

      {call ? (
        // Keying on the nonce remounts the panel, so the announce animation
        // replays on every re-call without any timer to get wrong.
        <section
          key={`${call.token}#${nonce}`}
          aria-live="assertive"
          className="flex min-h-0 flex-1 animate-announce flex-col items-center justify-center gap-[1.4vh] rounded-[22px] gold-bg px-[clamp(18px,3vw,48px)] py-[clamp(16px,2.6vh,40px)] text-center text-[#191309] motion-reduce:animate-none"
        >
          <span className="text-[clamp(12px,1.35vw,20px)] font-extrabold tracking-[0.24em] uppercase opacity-80">
            Now calling
          </span>

          <span className="overflow-hidden font-mono text-[clamp(52px,12.5vw,230px)] leading-[0.92] font-semibold tracking-[-0.035em] text-ellipsis whitespace-nowrap">
            {call.token}
          </span>

          {call.name && (
            <span className="overflow-hidden font-serif text-[clamp(26px,4.6vw,76px)] leading-[1.05] text-ellipsis whitespace-nowrap">
              {call.name}
            </span>
          )}

          <span className="mt-[0.6vh] flex flex-wrap items-center gap-[10px]">
            {call.room && (
              <span className="rounded-[14px] bg-[#191309] px-[clamp(13px,1.5vw,24px)] py-[clamp(9px,1vw,15px)] text-[clamp(13px,1.5vw,24px)] font-extrabold tracking-[0.07em] text-gold-bright uppercase">
                {call.room}
              </span>
            )}
            <span className="rounded-[14px] bg-[oklch(0.96_0.05_82/0.5)] px-[clamp(13px,1.5vw,24px)] py-[clamp(9px,1vw,15px)] text-[clamp(13px,1.5vw,24px)] font-extrabold tracking-[0.07em] uppercase">
              {call.instruction ?? "Proceed now"}
            </span>
          </span>
        </section>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[1.2vh] rounded-[22px] border border-edge bg-[linear-gradient(165deg,#1a1613,#141110)] px-[clamp(18px,3vw,48px)] py-[clamp(16px,2.6vh,40px)] text-center">
          <span className="font-serif text-[clamp(30px,5.2vw,84px)] leading-[1.05] text-fg">
            Please take a seat
          </span>
          <span className="max-w-[34ch] text-[clamp(14px,1.8vw,28px)] leading-[1.35] text-fg-muted">
            You will be called by your token number
          </span>
          <span className="mt-[1vh] flex items-center gap-[9px] font-mono text-[clamp(11px,1.15vw,16px)] tracking-[0.16em] text-fg-faint uppercase">
            <span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-mint motion-reduce:animate-none" />
            Board active
          </span>
        </section>
      )}

      {next.length > 0 && (
        <section className="shrink-0">
          <span className="block pb-[0.9vh] text-[clamp(10px,1.05vw,15px)] font-bold tracking-[0.2em] text-fg-dim uppercase">
            Next up
          </span>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(clamp(130px,15vw,230px),1fr))] gap-[clamp(8px,0.9vw,14px)]">
            {next.map((t) => (
              <div
                key={t.token}
                className="rounded-[18px] border border-edge-mid bg-panel px-[clamp(11px,1.2vw,18px)] py-[clamp(9px,1.1vh,16px)]"
              >
                <span className="block overflow-hidden font-mono text-[clamp(18px,2.6vw,40px)] leading-[1.1] font-semibold text-ellipsis whitespace-nowrap">
                  {t.token}
                </span>
                {t.name && (
                  <span className="block overflow-hidden font-serif text-[clamp(14px,1.5vw,24px)] leading-[1.2] text-fg-muted text-ellipsis whitespace-nowrap">
                    {t.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
