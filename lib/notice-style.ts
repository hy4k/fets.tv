/**
 * How a message looks on the hall TV.
 *
 * A short list of choices rather than a free-for-all: every font, size and
 * background here has been picked to read from the back of a hall, so the
 * worst anybody can do is choose a quieter one. The same list is enforced in
 * the database (fets_notice_style), which drops anything it does not know.
 */
export const NOTICE_FONTS = {
  serif: { label: "Classic", family: "var(--font-instrument-serif), Georgia, serif" },
  display: { label: "Elegant", family: "var(--font-cormorant), Georgia, serif" },
  sans: { label: "Clean", family: "var(--font-instrument-sans), Helvetica, Arial, sans-serif" },
  mono: { label: "Typewriter", family: "var(--font-plex-mono), ui-monospace, monospace" },
} as const;

/** Multipliers on the board's own text size; "l" is the size used until now. */
export const NOTICE_SIZES = {
  m: { label: "Medium", scale: 0.72 },
  l: { label: "Large", scale: 1 },
  xl: { label: "Extra large", scale: 1.22 },
} as const;

export const NOTICE_COLOURS = ["#f5f2ec", "#f6d68b", "#9fe6dc", "#b9c3ff", "#ffb3a1", "#1a1a1f"] as const;

export const NOTICE_BACKGROUNDS = {
  tone: { label: "By tone", css: null },
  midnight: { label: "Midnight", css: "linear-gradient(165deg,#15161f,#0b0c12)" },
  gold: { label: "Gold", css: "radial-gradient(120% 90% at 50% 0%,rgba(233,190,110,0.38),transparent 70%),linear-gradient(165deg,#1d1710,#110e0a)" },
  aurora: { label: "Aurora", css: "radial-gradient(80% 70% at 15% 10%,rgba(90,210,190,0.35),transparent 70%),radial-gradient(70% 70% at 90% 90%,rgba(130,140,255,0.35),transparent 70%),#0d0f16" },
  sunrise: { label: "Sunrise", css: "linear-gradient(160deg,#3a1c12 0%,#6b2f1a 45%,#c9763a 100%)" },
  forest: { label: "Forest", css: "radial-gradient(90% 80% at 50% 0%,rgba(120,200,140,0.3),transparent 70%),linear-gradient(165deg,#0f1a14,#0a100c)" },
  stripes: { label: "Stripes", css: "repeating-linear-gradient(135deg,rgba(255,255,255,0.045) 0 18px,transparent 18px 36px),linear-gradient(165deg,#191922,#101016)" },
  dots: { label: "Dots", css: "radial-gradient(rgba(255,255,255,0.09) 1.4px,transparent 1.6px) 0 0/22px 22px,linear-gradient(165deg,#191922,#101016)" },
  paper: { label: "Paper", css: "linear-gradient(165deg,#f4efe4,#e6dccb)" },
} as const;

export const NOTICE_SHAPES = {
  rounded: { label: "Rounded", radius: "22px" },
  square: { label: "Square", radius: "6px" },
  soft: { label: "Extra soft", radius: "44px" },
} as const;

export type NoticeStyle = {
  font?: keyof typeof NOTICE_FONTS;
  size?: keyof typeof NOTICE_SIZES;
  color?: string;
  background?: keyof typeof NOTICE_BACKGROUNDS;
  shape?: keyof typeof NOTICE_SHAPES;
  align?: "center" | "left";
  bold?: boolean;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Only the known keys and values; anything else is dropped. */
export function cleanStyle(raw: unknown): NoticeStyle {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: NoticeStyle = {};
  if (typeof r.font === "string" && r.font in NOTICE_FONTS) out.font = r.font as NoticeStyle["font"];
  if (typeof r.size === "string" && r.size in NOTICE_SIZES) out.size = r.size as NoticeStyle["size"];
  if (typeof r.color === "string" && HEX.test(r.color)) out.color = r.color.toLowerCase();
  if (typeof r.background === "string" && r.background in NOTICE_BACKGROUNDS && r.background !== "tone")
    out.background = r.background as NoticeStyle["background"];
  if (typeof r.shape === "string" && r.shape in NOTICE_SHAPES) out.shape = r.shape as NoticeStyle["shape"];
  if (r.align === "left" || r.align === "center") out.align = r.align;
  if (r.bold === true) out.bold = true;
  return out;
}
