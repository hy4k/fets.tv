"use client";

import { useClock } from "@/lib/use-clock";
import { LogoMark } from "@/components/brand/Logo";
import { centreLook, shortName } from "@/lib/centres";

export type BoardCall = {
  token: string;
  name: string | null;
  room: string | null;
  instruction: string | null;
} | null;

export type BoardNext = { token: string; name: string | null };

export type BoardNotice = {
  body: string;
  tone: "info" | "warning" | "urgent";
  /** A signed link by the time it reaches here; the bucket itself stays private. */
  mediaUrl?: string | null;
  mediaKind?: "image" | "video" | "file" | null;
} | null;

/** Notice colours. Urgent earns the alarm tone; info must not compete with a call. */
const NOTICE_TONE = {
  info: { band: "border-iris/45 bg-iris/12 text-fg", accent: "text-iris", eyebrow: "Notice" },
  warning: { band: "border-gold/50 bg-gold/12 text-fg", accent: "text-gold", eyebrow: "Please note" },
  urgent: { band: "border-rust/55 bg-rust/15 text-fg", accent: "text-rust", eyebrow: "Important" },
} as const;

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
  notice = null,
  nonce = 0,
  siteLabel,
  centre,
  className = "",
}: {
  hallLabel: string;
  timezone: string;
  call: BoardCall;
  next: BoardNext[];
  notice?: BoardNotice;
  nonce?: number;
  siteLabel?: string;
  /** Which centre this board is in; sets the mark's metal and the name. */
  centre?: string | null;
  className?: string;
}) {
  const tone = notice ? NOTICE_TONE[notice.tone] : null;
  const clock = useClock(timezone);
  const look = centreLook(centre);

  return (
    <div
      // The light behind the board is the centre's metal: a warm gold glow
      // in Calicut, a cool harbour blue in Cochin.
      style={{
        background: `radial-gradient(900px 420px at 50% -8%, color-mix(in oklab, ${look.tone[1]} 30%, transparent), transparent 68%), linear-gradient(170deg, #15151a, #0e0e12)`,
      }}
      className={`@container flex min-h-0 flex-col gap-[2cqh] overflow-hidden rounded-[24px] border border-edge-mid [container-type:size] p-[clamp(9px,2.2cqw,34px)] ${className}`}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-[12px]">
        <span className="h-[clamp(18px,3.4cqw,48px)] w-[clamp(18px,3.4cqw,48px)] shrink-0">
          <LogoMark size={48} tone={look.tone} className="h-full w-full text-fg" />
        </span>
        <span className="font-mono text-[clamp(7px,1.25cqw,18px)] tracking-[0.16em] text-fg-muted">
          {centre && (
            <span
              className="bg-clip-text font-semibold text-transparent"
              style={{ backgroundImage: `linear-gradient(90deg, ${look.tone[0]}, ${look.tone[1]})` }}
            >
              {shortName(centre).toUpperCase()} ·{" "}
            </span>
          )}
          {siteLabel ? `${siteLabel} · ${hallLabel}` : hallLabel}
        </span>
        <span className="min-w-[12px] flex-1" />
        <span className="font-mono text-[clamp(11px,2.4cqw,36px)] font-semibold tabular-nums">{clock}</span>
      </header>

      {call ? (
        // Keying on the nonce remounts the panel, so the announce animation
        // replays on every re-call without any timer to get wrong.
        <section
          key={`${call.token}#${nonce}`}
          aria-live="assertive"
          className="flex min-h-0 flex-1 animate-announce flex-col items-center justify-center gap-[1.4cqh] rounded-[22px] gold-bg px-[clamp(10px,3cqw,48px)] py-[clamp(9px,2.6cqh,40px)] text-center text-[#191309] motion-reduce:animate-none"
        >
          <span className="text-[clamp(7px,1.35cqw,20px)] font-extrabold tracking-[0.24em] uppercase opacity-80">
            Now calling
          </span>

          <span className="shrink-0 overflow-hidden font-mono text-[clamp(20px,min(12.5cqw,17cqh),230px)] leading-[0.92] font-semibold tracking-[-0.035em] text-ellipsis whitespace-nowrap">
            {call.token}
          </span>

          {call.name && (
            <span className="shrink-0 overflow-hidden font-serif text-[clamp(12px,min(4.6cqw,6.5cqh),76px)] leading-[1.05] text-ellipsis whitespace-nowrap">
              {call.name}
            </span>
          )}

          <span className="mt-[0.6cqh] flex flex-wrap items-center gap-[10px]">
            {call.room && (
              <span className="rounded-[14px] bg-[#191309] px-[clamp(8px,1.5cqw,24px)] py-[clamp(5px,1cqw,15px)] text-[clamp(8px,1.5cqw,24px)] font-extrabold tracking-[0.07em] text-gold-bright uppercase">
                {call.room}
              </span>
            )}
            <span className="rounded-[14px] bg-[oklch(0.96_0.05_82/0.5)] px-[clamp(8px,1.5cqw,24px)] py-[clamp(5px,1cqw,15px)] text-[clamp(8px,1.5cqw,24px)] font-extrabold tracking-[0.07em] uppercase">
              {call.instruction ?? "Proceed now"}
            </span>
          </span>
        </section>
      ) : (
        <section
          className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-[1.4cqh] rounded-[22px] border px-[clamp(10px,3cqw,48px)] py-[clamp(9px,2.6cqh,40px)] text-center ${
            notice && tone ? tone.band : "border-edge bg-[linear-gradient(165deg,#1a1613,#141110)]"
          }`}
        >
          {notice && tone ? (
            <>
              <span
                className={`text-[clamp(7px,1.35cqw,20px)] font-extrabold tracking-[0.24em] uppercase ${tone.accent}`}
              >
                {tone.eyebrow}
              </span>

              {/* A picture carries further across a hall than a sentence does,
                  so when there is one it takes the room and the words sit under
                  it at a size that still reads from the back. */}
              {notice.mediaUrl && notice.mediaKind === "image" && (
                // next/image cannot optimise a signed URL from a private bucket
                // whose host is not known at build time, and this is one image
                // on a television, not a page of thumbnails.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={notice.mediaUrl}
                  alt=""
                  className="max-h-[60cqh] min-h-0 w-auto max-w-full flex-1 rounded-[16px] object-contain"
                />
              )}
              {notice.mediaUrl && notice.mediaKind === "video" && (
                <video
                  src={notice.mediaUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="max-h-[60cqh] min-h-0 w-auto max-w-full flex-1 rounded-[16px] object-contain"
                />
              )}

              {notice.body && (
                <span
                  className={`max-w-[26ch] shrink-0 font-serif leading-[1.08] text-fg ${
                    notice.mediaUrl
                      ? "text-[clamp(11px,min(3.2cqw,5cqh),48px)]"
                      : "text-[clamp(14px,min(5.4cqw,8cqh),88px)]"
                  }`}
                >
                  {notice.body}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="shrink-0 font-serif text-[clamp(14px,min(5.2cqw,7.5cqh),84px)] leading-[1.05] text-fg">
                Please take a seat
              </span>
              <span className="max-w-[34ch] text-[clamp(8px,min(1.8cqw,3.2cqh),28px)] leading-[1.35] text-fg-muted">
                You will be called by your token number
              </span>
            </>
          )}
          <span className="mt-[1cqh] flex items-center gap-[9px] font-mono text-[clamp(7px,1.15cqw,16px)] tracking-[0.16em] text-fg-faint uppercase">
            <span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-mint motion-reduce:animate-none" />
            Board active
          </span>
        </section>
      )}

      {call && notice && tone && (
        <section
          className={`flex shrink-0 items-baseline gap-[clamp(6px,1.2cqw,18px)] rounded-[18px] border px-[clamp(8px,1.6cqw,26px)] py-[clamp(6px,1.2cqh,18px)] ${tone.band}`}
        >
          <span
            className={`shrink-0 text-[clamp(6px,1.05cqw,15px)] font-extrabold tracking-[0.2em] uppercase ${tone.accent}`}
          >
            {tone.eyebrow}
          </span>
          <span className="min-w-0 flex-1 text-[clamp(9px,1.9cqw,30px)] leading-[1.25]">{notice.body}</span>
        </section>
      )}

      {next.length > 0 && (
        <section className="shrink-0">
          <span className="block pb-[0.9cqh] text-[clamp(6px,1.05cqw,15px)] font-bold tracking-[0.2em] text-fg-dim uppercase">
            Next up
          </span>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(clamp(78px,15cqw,230px),1fr))] gap-[clamp(5px,0.9cqw,14px)]">
            {next.map((t) => (
              <div
                key={t.token}
                className="rounded-[18px] border border-edge-mid bg-panel px-[clamp(6px,1.2cqw,18px)] py-[clamp(5px,1.1cqh,16px)]"
              >
                <span className="block overflow-hidden font-mono text-[clamp(11px,min(2.6cqw,4.6cqh),40px)] leading-[1.1] font-semibold text-ellipsis whitespace-nowrap">
                  {t.token}
                </span>
                {t.name && (
                  <span className="block overflow-hidden font-serif text-[clamp(8px,1.5cqw,24px)] leading-[1.2] text-fg-muted text-ellipsis whitespace-nowrap">
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
