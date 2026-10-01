"use client";

import { useClock } from "@/lib/use-clock";
import { LogoMark } from "@/components/brand/Logo";
import { centreLook, shortName } from "@/lib/centres";
import type { BoardFloor, BoardHome } from "@/lib/types";
import { cleanStyle, NOTICE_BACKGROUNDS, NOTICE_FONTS, NOTICE_SHAPES, NOTICE_SIZES, type NoticeStyle } from "@/lib/notice-style";

export type BoardCall = {
  token: string;
  name: string | null;
  room: string | null;
  instruction: string | null;
} | null;

/** Hues for the also-called boxes: teal, violet, coral, sky. */
const CALLED_HUES = [175, 300, 30, 235];

export type { BoardFloor } from "@/lib/types";

export type BoardNext = { token: string; name: string | null };

export type BoardNotice = {
  body: string;
  tone: "info" | "warning" | "urgent";
  /** A signed link by the time it reaches here; the bucket itself stays private. */
  mediaUrl?: string | null;
  mediaKind?: "image" | "video" | "file" | null;
  /** The look chosen for it; cleaned again here, whatever the source. */
  style?: NoticeStyle | null;
} | null;

/** Inline styles for a notice's look. Empty when it has none, so the tone's look stands. */
function noticeLook(raw: NoticeStyle | null | undefined, baseSize: string) {
  const st = cleanStyle(raw);
  const bg = st.background ? NOTICE_BACKGROUNDS[st.background].css : null;
  const lightBg = st.background === "paper";
  const color = st.color ?? (lightBg ? "#1a1a1f" : undefined);
  const scale = NOTICE_SIZES[st.size ?? "l"].scale;
  return {
    band: {
      ...(bg ? { background: bg, borderColor: "rgba(255,255,255,0.12)" } : {}),
      ...(st.shape ? { borderRadius: NOTICE_SHAPES[st.shape].radius } : {}),
      ...(st.align === "left" ? { alignItems: "flex-start", textAlign: "left" as const } : {}),
    },
    text: {
      ...(st.font ? { fontFamily: NOTICE_FONTS[st.font].family } : {}),
      ...(color ? { color } : {}),
      ...(st.bold ? { fontWeight: 700 } : {}),
      fontSize: `calc(${baseSize} * ${scale})`,
    },
    /** The small print (eyebrow, "board active") goes dark on a light background. */
    aux: lightBg ? { color: "rgba(26,26,31,0.72)" } : undefined,
  };
}

/** Notice colours. Urgent earns the alarm tone; info must not compete with a call. */
const NOTICE_TONE = {
  info: { band: "border-iris/45 bg-iris/12 text-fg", accent: "text-iris", eyebrow: "Notice" },
  warning: { band: "border-gold/50 bg-gold/12 text-fg", accent: "text-gold", eyebrow: "Please note" },
  urgent: { band: "border-rust/55 bg-rust/15 text-fg", accent: "text-rust", eyebrow: "Important" },
} as const;

/**
 * The hall TV. Read from three to ten metres by people who are anxious and are
 * scanning for one thing: their own name. So the board has two distinct
 * states — calm while idle, unmissable while calling — rather than one layout
 * that shouts either way. Beyond the name, only the provider's confirmation
 * number is shown — nothing else internal (phone, place,
 * stage names) reaches this screen; it renders only what the display
 * projection hands it.
 */
export function DisplayBoard({
  hallLabel,
  timezone,
  call,
  next,
  earlier = [],
  floor = null,
  home = null,
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
  /** Called before the big one and not yet in: small, but readable across the hall. */
  earlier?: { token: string; name: string | null }[];
  /** What is happening in the room, for the idle screen. */
  floor?: BoardFloor | null;
  /** The centre's home screen: welcome line and what to show under it. */
  home?: BoardHome | null;
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

          {/* The name is what people listen for; the confirmation number
              under it settles two people with the same name. With others
              also called, the big name steps down a little to give them room. */}
          <span
            className={`max-w-full shrink-0 overflow-hidden font-serif leading-[0.98] text-ellipsis whitespace-nowrap ${
              earlier.length > 0
                ? "text-[clamp(18px,min(8cqw,11cqh),150px)]"
                : "text-[clamp(20px,min(10.5cqw,15cqh),200px)]"
            }`}
          >
            {call.name ?? call.token}
          </span>

          {call.name && (
            <span className="shrink-0 font-mono text-[clamp(9px,min(2.4cqw,3.6cqh),38px)] leading-none font-semibold tracking-[0.04em] opacity-75">
              {call.token}
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
          style={notice ? noticeLook(notice.style, "1px").band : undefined}
          className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-[1.4cqh] rounded-[22px] border px-[clamp(10px,3cqw,48px)] py-[clamp(9px,2.6cqh,40px)] text-center ${
            notice && tone ? tone.band : "border-edge bg-[linear-gradient(165deg,#1a1613,#141110)]"
          }`}
        >
          {notice && tone ? (
            <>
              <span
                style={noticeLook(notice.style, "1px").aux}
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
                  style={
                    noticeLook(
                      notice.style,
                      notice.mediaUrl ? "clamp(11px,min(3.2cqw,5cqh),48px)" : "clamp(14px,min(5.4cqw,8cqh),88px)",
                    ).text
                  }
                  className="max-w-[26ch] shrink-0 font-serif leading-[1.08] whitespace-pre-line text-fg"
                >
                  {notice.body}
                </span>
              )}
            </>
          ) : (home && home.layout !== "room") || (floor && floor.seats_total > 0) ? (
            <IdleHome home={home} floor={floor} centre={centre} tone={look.tone} />
          ) : (
            <>
              <span className="shrink-0 font-serif text-[clamp(14px,min(5.2cqw,7.5cqh),84px)] leading-[1.05] text-fg">
                Please take a seat
              </span>
              <span className="max-w-[34ch] text-[clamp(8px,min(1.8cqw,3.2cqh),28px)] leading-[1.35] text-fg-muted">
                You will be called by name
              </span>
            </>
          )}
          <span
            style={notice ? noticeLook(notice.style, "1px").aux : undefined}
            className="mt-[1cqh] flex items-center gap-[9px] font-mono text-[clamp(7px,1.15cqw,16px)] tracking-[0.16em] text-fg-faint uppercase"
          >
            <span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-mint motion-reduce:animate-none" />
            Board active
          </span>
        </section>
      )}

      {call && earlier.length > 0 && (
        <section aria-label="Also called" className="flex shrink-0 flex-col gap-[0.9cqh]">
          <span className="text-[clamp(7px,1.2cqw,18px)] font-extrabold tracking-[0.2em] text-fg-muted uppercase">
            Also called · please proceed
          </span>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(clamp(90px,20cqw,320px),1fr))] gap-[clamp(5px,1cqw,16px)]">
            {earlier.map((e, i) => {
              const hue = CALLED_HUES[i % CALLED_HUES.length];
              return (
                <div
                  key={e.token}
                  style={{
                    background: `linear-gradient(150deg, oklch(0.5 0.13 ${hue} / 0.55), oklch(0.28 0.07 ${hue} / 0.7))`,
                    borderColor: `oklch(0.75 0.13 ${hue} / 0.6)`,
                  }}
                  className="flex min-w-0 flex-col gap-[0.5cqh] rounded-[18px] border px-[clamp(8px,1.5cqw,24px)] py-[clamp(6px,1.4cqh,20px)]"
                >
                  <span className="overflow-hidden font-serif text-[clamp(12px,min(3.4cqw,5.4cqh),56px)] leading-[1.05] text-ellipsis whitespace-nowrap text-fg">
                    {e.name ?? e.token}
                  </span>
                  {e.name && (
                    <span className="font-mono text-[clamp(7px,1.3cqw,20px)] leading-none text-fg/75">{e.token}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {call && notice && tone && (
        <section
          style={noticeLook(notice.style, "1px").band}
          className={`flex shrink-0 items-baseline gap-[clamp(6px,1.2cqw,18px)] rounded-[18px] border px-[clamp(8px,1.6cqw,26px)] py-[clamp(6px,1.2cqh,18px)] ${tone.band}`}
        >
          <span
            style={noticeLook(notice.style, "1px").aux}
            className={`shrink-0 text-[clamp(6px,1.05cqw,15px)] font-extrabold tracking-[0.2em] uppercase ${tone.accent}`}
          >
            {tone.eyebrow}
          </span>
          <span
            style={noticeLook(notice.style, "clamp(9px,1.9cqw,30px)").text}
            className="min-w-0 flex-1 leading-[1.25]"
          >
            {notice.body}
          </span>
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
                <span className="block overflow-hidden font-serif text-[clamp(10px,min(2.2cqw,4cqh),34px)] leading-[1.15] text-ellipsis whitespace-nowrap">
                  {t.name ?? t.token}
                </span>
                {t.name && (
                  <span className="block overflow-hidden font-mono text-[clamp(7px,1.2cqw,18px)] leading-[1.2] text-fg-muted text-ellipsis whitespace-nowrap">
                    {t.token}
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

/**
 * The hall at rest: the seats free, large, the seats taken beside them, and the
 * exams running now. When a seat is free, somebody here early for a later slot
 * is told plainly they may ask to go in sooner.
 */
/**
 * The home screen, as the centre set it: a welcome alone, the room alone, or
 * the welcome over the room. Unset, it is the room.
 */
function IdleHome({
  home,
  floor,
  centre,
  tone,
}: {
  home: BoardHome | null;
  floor: BoardFloor | null;
  centre?: string | null;
  tone: [string, string];
}) {
  const layout = home?.layout ?? "room";
  const title = home?.title?.trim() || `Welcome to FETS${centre ? ` ${shortName(centre)}` : ""}`;
  const subtitle = home?.subtitle?.trim() ?? "";
  const room = layout !== "welcome" && floor && floor.seats_total > 0;
  const welcome = layout !== "room" || !room;

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-[3cqh]">
      {welcome && (
        <div className="flex max-w-[88cqw] flex-col items-center gap-[1.4cqh] text-center">
          <span
            className={`bg-clip-text font-serif leading-[1.02] text-transparent ${
              room ? "text-[clamp(16px,min(5.4cqw,8cqh),92px)]" : "text-[clamp(22px,min(8.5cqw,13cqh),150px)]"
            }`}
            style={{ backgroundImage: `linear-gradient(100deg, #f6efe4, ${tone[0]} 55%, ${tone[1]})` }}
          >
            {title}
          </span>
          {subtitle && (
            <span
              className={`max-w-[60ch] whitespace-pre-line text-fg-muted ${
                room ? "text-[clamp(9px,min(2cqw,3.4cqh),32px)]" : "text-[clamp(11px,min(3cqw,5cqh),48px)]"
              } leading-[1.3]`}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
      {room && (
        <IdleFloor
          floor={floor!}
          tone={tone}
          compact={welcome}
          showExams={home?.show_exams ?? true}
          showEarly={home?.show_early ?? true}
        />
      )}
    </div>
  );
}

function IdleFloor({
  floor,
  tone,
  compact = false,
  showExams = true,
  showEarly = true,
}: {
  floor: BoardFloor;
  tone: [string, string];
  /** Under a welcome line: a little smaller. */
  compact?: boolean;
  showExams?: boolean;
  showEarly?: boolean;
}) {
  const { seats_total: total, seats_in_use: used, seats_free: free, exams } = floor;
  const share = total > 0 ? used / total : 0;
  // A ring drawn as a conic gradient: taken in the centre's metal, free dark.
  const ring = `conic-gradient(${tone[0]} 0 ${share * 360}deg, rgba(255,255,255,0.07) ${share * 360}deg 360deg)`;

  return (
    <div className="flex w-full min-w-0 flex-col items-center justify-center gap-[3cqh]">
      <div className="flex w-full flex-wrap items-center justify-center gap-x-[5cqw] gap-y-[3cqh]">
        <div
          style={{ background: ring }}
          className={`relative flex aspect-square shrink-0 items-center justify-center rounded-full ${
            compact ? "w-[clamp(70px,min(18cqw,30cqh),300px)]" : "w-[clamp(90px,min(26cqw,44cqh),420px)]"
          }`}
        >
          <div className="absolute inset-[9%] flex flex-col items-center justify-center rounded-full bg-[linear-gradient(165deg,#1b1714,#121010)] shadow-[inset_0_2px_10px_rgba(0,0,0,0.6)]">
            <span
              className={`font-serif leading-[0.9] text-fg tabular-nums ${
                compact ? "text-[clamp(22px,min(7cqw,12cqh),120px)]" : "text-[clamp(28px,min(10cqw,17cqh),170px)]"
              }`}
            >
              {free}
            </span>
            <span
              className={`mt-[0.8cqh] font-mono text-fg-muted uppercase ${
                compact ? "text-[clamp(5px,0.85cqw,13px)] tracking-[0.12em]" : "text-[clamp(7px,1.3cqw,20px)] tracking-[0.18em]"
              }`}
            >
              seats free
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-[2cqh] text-left">
          <div className="flex items-baseline gap-[1.4cqw]">
            <span className="font-serif text-[clamp(20px,min(6cqw,10cqh),100px)] leading-none tabular-nums text-fg">{used}</span>
            <span className="text-[clamp(9px,min(1.9cqw,3.2cqh),30px)] text-fg-muted">
              of {total} seats in use
            </span>
          </div>
          {!showExams ? null : exams.length > 0 ? (
            <div className="flex flex-col gap-[1cqh]">
              <span className="font-mono text-[clamp(7px,1.2cqw,18px)] tracking-[0.2em] text-fg-faint uppercase">Exams in progress</span>
              <div className="flex max-w-[48cqw] flex-wrap gap-[0.8cqw]">
                {exams.slice(0, 6).map((e) => (
                  <span
                    key={e.name}
                    className="flex items-baseline gap-[0.7cqw] rounded-[14px] border border-edge-strong bg-panel/70 px-[clamp(8px,1.3cqw,20px)] py-[clamp(4px,0.9cqh,12px)]"
                  >
                    <span className="max-w-[26cqw] overflow-hidden text-[clamp(9px,min(1.8cqw,3cqh),28px)] font-semibold text-ellipsis whitespace-nowrap text-fg">
                      {e.name}
                    </span>
                    <span className="font-mono text-[clamp(8px,1.4cqw,22px)] text-fg-muted">{e.testing}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <span className="text-[clamp(9px,min(1.8cqw,3cqh),28px)] text-fg-muted">No exam is running right now</span>
          )}
        </div>
      </div>

      {showEarly && (
      <span
        style={free > 0 ? { borderColor: tone[0], background: `color-mix(in oklab, ${tone[0]} 12%, transparent)` } : undefined}
        className={`max-w-[70cqw] rounded-[18px] border px-[clamp(10px,2cqw,32px)] py-[clamp(6px,1.4cqh,20px)] text-center text-[clamp(9px,min(2cqw,3.4cqh),32px)] leading-[1.3] ${
          free > 0 ? "text-fg" : "border-edge text-fg-muted"
        }`}
      >
        {free > 0
          ? "Here early for a later exam? Seats are free now — ask at the front desk about going in early."
          : "Every seat is in use. Please take a seat — you will be called by name."}
      </span>
      )}
    </div>
  );
}

