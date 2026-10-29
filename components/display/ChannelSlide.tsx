import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { QrCode } from "@/components/display/QrCode";
import { basePath } from "@/lib/base-path";
import { AD_MAX_SECONDS, adSound, fieldOf, qrTarget, shortLink, tickerRun, type TvSlide } from "@/lib/tv-channel";

const noSubscribe = () => () => {};

/** Where this page is served from, so a QR code can count its scans here. Null on the server. */
function useScanBase(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => `${window.location.origin}${basePath}`,
    () => null,
  );
}

/**
 * One designed slide of the TV Channel. Staff fill in a few words; the layout,
 * type, motion and the centre's metal come from here, so every slide looks as
 * finished as the rest of the board. Sizes follow the slide's own box, so the
 * same slide reads from the back of the hall and as a thumbnail in the console.
 */
export function ChannelSlide({ slide, tone }: { slide: TvSlide; tone: [string, string] }) {
  const f = (key: string) => fieldOf(slide, key);
  const link = slide.link;
  // The code goes in the QR; the link it lands on is what people read under it.
  const qr = qrTarget(slide, useScanBase());

  return (
    <div className="@container relative h-full w-full overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#0d0d11] [container-type:size]">
      <Backdrop tone={tone} />
      {slide.kind === "promo" && <Promo f={f} link={link} qr={qr} tone={tone} />}
      {slide.kind === "batch" && <Batch f={f} link={link} qr={qr} tone={tone} />}
      {slide.kind === "partners" && <Partners f={f} tone={tone} />}
      {slide.kind === "tip" && <Tip f={f} tone={tone} />}
      {slide.kind === "poster" && <Poster slide={slide} caption={f("caption")} link={link} qr={qr} />}
      {/* On the TV an ad plays full screen (AdBreak); here, in the console, it shows like a poster. */}
      {slide.kind === "ad" && <Poster slide={slide} caption="" link={link} qr={qr} />}
      {slide.kind === "ticker" && <TickerPreview text={f("text")} tone={tone} />}
      {slide.kind !== "poster" && slide.kind !== "ad" && slide.kind !== "ticker" && <Brand tone={tone} />}
    </div>
  );
}

/** The light behind every slide: two slow glows in the centre's metal. */
function Backdrop({ tone }: { tone: [string, string] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div
        className="absolute -top-[30%] -left-[15%] h-[90%] w-[70%] animate-drift rounded-full opacity-40 blur-[60px] motion-reduce:animate-none"
        style={{ background: `radial-gradient(circle, ${tone[1]}, transparent 65%)` }}
      />
      <div
        className="absolute -right-[20%] -bottom-[35%] h-[90%] w-[70%] animate-drift rounded-full opacity-25 blur-[70px] [animation-delay:-7s] motion-reduce:animate-none"
        style={{ background: `radial-gradient(circle, ${tone[0]}, transparent 65%)` }}
      />
      {/* A fine grid, barely there, so the dark never looks empty. */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "5cqw 5cqw",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
    </div>
  );
}

function Brand({ tone }: { tone: [string, string] }) {
  return (
    <div className="absolute bottom-[4cqh] left-[4.5cqw] flex items-center gap-[1cqw] opacity-80">
      <LogoMark size={48} tone={tone} className="h-[min(3cqw,5.5cqh)] w-[min(3cqw,5.5cqh)] text-fg" />
      <span className="font-mono text-[min(1.3cqw,2.4cqh)] tracking-[0.18em] text-fg-muted uppercase">
        Forun Testing &amp; Educational Services
      </span>
    </div>
  );
}

/** Each line arrives a moment after the one before it. */
function Rise({ i, className = "", style, children }: { i: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <span
      className={`block animate-rise motion-reduce:animate-none ${className}`}
      style={{ ...style, animationDelay: `${150 + i * 160}ms` }}
    >
      {children}
    </span>
  );
}

const metal = (tone: [string, string]): CSSProperties => ({
  backgroundImage: `linear-gradient(100deg, #fbf6ec, ${tone[0]} 45%, ${tone[1]})`,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
});

/** The QR code on a white card, with what it does and where it goes. */
function QrCard({
  link,
  qr,
  cta,
  tone,
  size = "min(27cqw,56cqh)",
}: {
  link: string;
  qr: string;
  cta?: string;
  tone: [string, string];
  size?: string;
}) {
  return (
    <div className="flex shrink-0 animate-rise flex-col items-center gap-[2cqh] [animation-delay:500ms] motion-reduce:animate-none">
      <div
        className="rounded-[8%] bg-white p-[3%] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]"
        style={{ width: size, boxShadow: `0 0 0 0.5cqw color-mix(in oklab, ${tone[0]} 55%, transparent), 0 30px 80px -30px rgba(0,0,0,0.9)` }}
      >
        <QrCode value={qr} className="block h-auto w-full" />
      </div>
      {cta && (
        <span className="max-w-[32cqw] text-center text-[min(2.1cqw,4cqh)] leading-tight font-semibold text-fg">{cta}</span>
      )}
      <span className="font-mono text-[min(1.7cqw,3.2cqh)] tracking-[0.04em]" style={{ color: tone[0] }}>
        {shortLink(link)}
      </span>
    </div>
  );
}

type Field = (key: string) => string;

function Promo({ f, link, qr, tone }: { f: Field; link: string | null; qr: string | null; tone: [string, string] }) {
  return (
    <div className="relative flex h-full items-center gap-[5cqw] px-[6cqw] pt-[5cqh] pb-[12cqh]">
      <div className="flex min-w-0 flex-1 flex-col gap-[3cqh]">
        {f("eyebrow") && (
          <Rise i={0}>
            <span
              className="inline-block rounded-full border px-[1.8cqw] py-[0.9cqh] text-[min(1.6cqw,3cqh)] font-bold tracking-[0.28em] uppercase"
              style={{ borderColor: tone[0], color: tone[0], background: `color-mix(in oklab, ${tone[0]} 12%, transparent)` }}
            >
              {f("eyebrow")}
            </span>
          </Rise>
        )}
        <Rise i={1} className="font-serif text-[min(7.4cqw,15cqh)] leading-[0.98]" style={metal(tone)}>
          {f("title")}
        </Rise>
        {f("when") && (
          <Rise i={2} className="flex items-center gap-[1.2cqw] text-[min(3cqw,5.6cqh)] leading-tight text-fg/90">
            <span aria-hidden className="inline-block h-[min(1cqw,2cqh)] w-[min(1cqw,2cqh)] rotate-45" style={{ background: tone[0] }} />
            {f("when")}
          </Rise>
        )}
        {f("price") && (
          <Rise i={3} className="flex items-baseline gap-[1.2cqw]">
            <span className="text-[min(1.6cqw,3cqh)] font-bold tracking-[0.24em] text-fg-muted uppercase">Fee</span>
            <span className="font-serif text-[min(6.4cqw,12cqh)] leading-none" style={metal(tone)}>
              {f("price")}
            </span>
          </Rise>
        )}
        {!link && f("cta") && (
          <Rise i={4} className="text-[min(2.4cqw,4.4cqh)] font-semibold text-fg">
            {f("cta")}
          </Rise>
        )}
      </div>
      {link && qr && <QrCard link={link} qr={qr} cta={f("cta")} tone={tone} />}
    </div>
  );
}

function Batch({ f, link, qr, tone }: { f: Field; link: string | null; qr: string | null; tone: [string, string] }) {
  return (
    <div className="relative flex h-full items-center gap-[5cqw] px-[6cqw] pt-[5cqh] pb-[12cqh]">
      <div className="flex min-w-0 flex-1 flex-col gap-[3.4cqh]">
        <Rise i={0} className="text-[min(1.6cqw,3cqh)] font-bold tracking-[0.28em] text-fg-muted uppercase">
          New batch
        </Rise>
        <Rise i={1} className="font-serif text-[min(7.4cqw,15cqh)] leading-[0.98]" style={metal(tone)}>
          {f("title")}
        </Rise>
        <Rise i={2} className="flex flex-wrap items-center gap-[1.6cqw]">
          {f("starts") && (
            <span
              className="rounded-[1.4cqw] px-[2cqw] py-[1.4cqh] text-[min(2.8cqw,5.4cqh)] font-bold text-[#141009]"
              style={{ background: `linear-gradient(135deg, ${tone[0]}, ${tone[1]})` }}
            >
              {f("starts")}
            </span>
          )}
          {f("seats") && (
            <span className="flex items-center gap-[1cqw] rounded-[1.4cqw] border border-rust/60 bg-rust/15 px-[2cqw] py-[1.4cqh] text-[min(2.6cqw,5cqh)] font-bold text-fg">
              <span className="h-[min(1.1cqw,2cqh)] w-[min(1.1cqw,2cqh)] animate-pulse-dot rounded-full bg-rust motion-reduce:animate-none" />
              {f("seats")}
            </span>
          )}
        </Rise>
        {f("note") && (
          <Rise i={3} className="max-w-[60cqw] text-[min(2.5cqw,4.6cqh)] leading-snug text-fg-muted">
            {f("note")}
          </Rise>
        )}
      </div>
      {link && qr && <QrCard link={link} qr={qr} cta="Scan to know more" tone={tone} size="min(23cqw,48cqh)" />}
    </div>
  );
}

function Partners({ f, tone }: { f: Field; tone: [string, string] }) {
  const names = f("names")
    .split(/\n|,/)
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 9);
  const cols = names.length <= 4 ? 2 : 3;
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-[5cqh] px-[6cqw] pt-[4cqh] pb-[12cqh]">
      <Rise i={0} className="text-center font-serif text-[min(4.6cqw,9cqh)] leading-tight" style={metal(tone)}>
        {f("heading")}
      </Rise>
      <div className="grid w-full gap-[1.6cqw]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {names.map((name, i) => (
          <span
            key={`${i}-${name}`}
            className="relative flex animate-rise items-center justify-center overflow-hidden rounded-[1.6cqw] border border-white/12 bg-white/[0.05] px-[1.5cqw] py-[3.4cqh] backdrop-blur-sm motion-reduce:animate-none"
            style={{ animationDelay: `${300 + i * 120}ms` }}
          >
            <span className="truncate text-[min(3cqw,6cqh)] font-semibold tracking-[0.06em] text-fg">{name}</span>
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-[40%] animate-sheen motion-reduce:hidden"
              style={{
                background: `linear-gradient(90deg, transparent, color-mix(in oklab, ${tone[0]} 30%, transparent), transparent)`,
                animationDelay: `${i * 0.35}s`,
              }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

function Tip({ f, tone }: { f: Field; tone: [string, string] }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-[3cqh] px-[9cqw] pb-[10cqh] text-center">
      <Rise i={0} className="-mb-[9cqh] font-serif text-[min(16cqw,30cqh)] leading-none" style={metal(tone)}>
        “
      </Rise>
      <Rise i={1} className="max-w-[24ch] font-serif text-[min(6.2cqw,12cqh)] leading-[1.08] whitespace-pre-line text-fg">
        {f("text")}
      </Rise>
      {f("label") && (
        <Rise i={2} className="flex items-center gap-[1.4cqw] text-[min(1.7cqw,3.2cqh)] font-bold tracking-[0.28em] uppercase" style={{ color: tone[0] }}>
          <span className="h-px w-[5cqw]" style={{ background: tone[0] }} />
          {f("label")}
          <span className="h-px w-[5cqw]" style={{ background: tone[0] }} />
        </Rise>
      )}
    </div>
  );
}

function Poster({ slide, caption, link, qr }: { slide: TvSlide; caption: string; link: string | null; qr: string | null }) {
  const url = slide.media_url ?? null;
  return (
    <div className="absolute inset-0">
      {url && slide.media_kind === "image" && (
        <>
          {/* The same picture, blurred, fills whatever the poster's shape leaves. */}
          <div
            aria-hidden
            className="absolute inset-0 scale-110 bg-cover bg-center opacity-50 blur-[40px]"
            style={{ backgroundImage: `url("${url}")` }}
          />
          {/* A signed link from a private bucket; next/image cannot optimise it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-contain" />
        </>
      )}
      {url && slide.media_kind === "video" && (
        <video src={url} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full bg-black object-contain" />
      )}
      {!url && (
        <div className="absolute inset-0 flex items-center justify-center text-[min(2cqw,4cqh)] text-fg-faint">
          {slide.kind === "ad" ? "Choose a video" : "Choose an image or a video"}
        </div>
      )}
      {(caption || link) && (
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-[3cqw] bg-[linear-gradient(0deg,rgba(0,0,0,0.85),transparent)] px-[4cqw] pt-[10cqh] pb-[4cqh]">
          <span className="min-w-0 flex-1 font-serif text-[min(4cqw,8cqh)] leading-tight text-white">{caption}</span>
          {link && qr && (
            <span className="flex shrink-0 flex-col items-center gap-[1cqh]">
              <span className="w-[min(14cqw,28cqh)] rounded-[8%] bg-white p-[3%]">
                <QrCode value={qr} className="block h-auto w-full" />
              </span>
              <span className="font-mono text-[min(1.4cqw,2.6cqh)] text-white/85">{shortLink(link)}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** How tall the ticker strip stands, for whatever must leave room for it. */
export const TICKER_HEIGHT = "clamp(20px, 8cqh, 96px)";

/**
 * The ticker: the centre's lines scrolling along the bottom of the TV, like a
 * news channel's. Two copies run side by side and move one copy's width, so
 * the loop never shows a seam.
 */
export function TickerStrip({ lines, tone }: { lines: string[]; tone: [string, string] }) {
  const { lines: run, seconds } = tickerRun(lines);
  const copy = (hidden: boolean) => (
    <span aria-hidden={hidden || undefined} className="flex shrink-0 items-center pl-[2.4cqw]">
      {run.map((line, i) => (
        <span key={i} className="flex shrink-0 items-center">
          <span className="whitespace-nowrap">{line}</span>
          <span aria-hidden className="mx-[2.4cqw] h-[1.1cqh] w-[1.1cqh] shrink-0 rotate-45" style={{ background: tone[0] }} />
        </span>
      ))}
    </span>
  );
  return (
    <div style={{ height: TICKER_HEIGHT }} className="flex w-full items-stretch overflow-hidden border-t border-white/10 bg-[#09090c]">
      <span
        className="flex shrink-0 items-center px-[1.8cqw] font-mono text-[clamp(7px,2.2cqh,26px)] font-extrabold tracking-[0.2em] text-[#191309] uppercase"
        style={{ background: `linear-gradient(135deg, ${tone[0]}, ${tone[1]})` }}
      >
        Updates
      </span>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        {/* Keyed on the words, so new lines start a fresh pass rather than jump. */}
        <div
          key={run.join("\n")}
          className="absolute inset-y-0 left-0 flex w-max animate-ticker items-center text-[clamp(9px,4cqh,44px)] font-semibold text-fg motion-reduce:animate-none"
          style={{ animationDuration: `${seconds}s` }}
        >
          {copy(false)}
          {copy(true)}
        </div>
      </div>
    </div>
  );
}

/** A ticker line in the console: the strip as it runs along the bottom of the TV. */
function TickerPreview({ text, tone }: { text: string; tone: [string, string] }) {
  return (
    <>
      <div className="absolute inset-x-0 top-0 bottom-[8cqh] flex items-center justify-center px-[6cqw] text-center text-[min(2.4cqw,4.4cqh)] text-fg-faint">
        Scrolls along the bottom of the TV while nobody is being called
      </div>
      <div className="absolute inset-x-0 bottom-0">
        <TickerStrip lines={[text || "Write the line"]} tone={tone} />
      </div>
    </>
  );
}

/**
 * A video ad on the hall TV: the whole screen, start to finish, and then the
 * loop moves on. A call cuts in at once: the ad pauses out of sight and carries
 * on from the same moment afterwards. A file that will not play, or stops
 * moving, gives way rather than leave a black screen.
 */
export function AdBreak({
  slide,
  paused,
  sound,
  clock,
  onDone,
  style,
}: {
  slide: TvSlide;
  /** A call is on: hold still, out of sight. */
  paused: boolean;
  /** Whether this screen may play sound at all; the ad's own setting decides after that. */
  sound: boolean;
  clock: string;
  onDone: () => void;
  style?: CSSProperties;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const done = useRef(onDone);
  // The TV's state re-signs file links whenever it changes; the link this turn
  // started with keeps the video from starting over halfway through.
  const [src] = useState(slide.media_url ?? undefined);
  const qr = qrTarget(slide, useScanBase());
  const withSound = sound && adSound(slide);

  useEffect(() => {
    done.current = onDone;
  });

  // Play, or hold still under a call. With sound only where the browser allows it.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (paused) {
      v.pause();
      return;
    }
    v.muted = !withSound;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => done.current());
    });
  }, [paused, withSound]);

  // Thirty seconds without moving, or past the limit, and the ad gives way.
  useEffect(() => {
    if (paused) return;
    let last = -1;
    let still = 0;
    const watch = window.setInterval(() => {
      const v = video.current;
      if (!v) return;
      if (v.currentTime >= AD_MAX_SECONDS) return done.current();
      still = v.currentTime === last ? still + 1 : 0;
      last = v.currentTime;
      if (still >= 6) done.current();
    }, 5000);
    return () => window.clearInterval(watch);
  }, [paused]);

  return (
    <section
      aria-label="Video ad"
      style={style}
      className={`absolute inset-x-0 top-0 z-10 overflow-hidden bg-black [container-type:size] ${paused ? "hidden" : ""}`}
    >
      <video
        ref={video}
        src={src}
        playsInline
        preload="auto"
        onEnded={() => done.current()}
        onError={() => done.current()}
        className="absolute inset-0 h-full w-full object-contain"
      />
      <span className="absolute top-[3cqh] left-[2.5cqw] rounded-full bg-black/60 px-[1.6cqw] py-[0.8cqh] text-[clamp(8px,2.6cqh,28px)] font-semibold text-white/90">
        Your name comes up here when it is your turn
      </span>
      <span className="absolute top-[3cqh] right-[2.5cqw] rounded-full bg-black/60 px-[1.6cqw] py-[0.8cqh] font-mono text-[clamp(8px,2.8cqh,30px)] font-semibold text-white/90 tabular-nums">
        {clock}
      </span>
      {slide.link && qr && (
        <span className="absolute right-[2.5cqw] bottom-[4cqh] flex flex-col items-center gap-[1cqh] rounded-[1.2cqw] bg-black/60 p-[1cqw]">
          <span className="w-[min(12cqw,22cqh)] rounded-[8%] bg-white p-[3%]">
            <QrCode value={qr} className="block h-auto w-full" />
          </span>
          <span className="font-mono text-[clamp(7px,2cqh,22px)] text-white/85">{shortLink(slide.link)}</span>
        </span>
      )}
    </section>
  );
}
