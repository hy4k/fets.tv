/**
 * The FETS mark: an F made of seats.
 *
 * A five by five hall seen from above, twelve of the twenty-five places lit,
 * and the lit ones spell the letter. It is the thing the console actually
 * shows — a room with people in some of the chairs — rather than a globe or a
 * tick or a mortar board, and it means the mark says what the company does
 * without needing the wordmark beside it.
 *
 * Built from a grid rather than drawn as a path so it survives being small:
 * at sixteen pixels the squares merge into a legible F, and at five hundred
 * they read as a seating plan. Two tones only, so it prints and engraves.
 */

/** Which of the twenty-five seats are lit, row by row. */
const F = [
  [1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0],
  [1, 1, 1, 1, 0],
  [1, 0, 0, 0, 0],
  [1, 0, 0, 0, 0],
];

const CELL = 18;
const GAP = 5;
const PAD = 9;
const SPAN = 5 * CELL + 4 * GAP + 2 * PAD; // 128

export function LogoMark({
  size = 48,
  /** The unlit seats. Off on a busy screen, on where the mark has room. */
  showEmptySeats = true,
  className = "",
  tone = ["oklch(0.9 0.14 82)", "oklch(0.7 0.15 58)"],
}: {
  size?: number;
  showEmptySeats?: boolean;
  className?: string;
  /** The two stops of the lit seats. Gold unless a centre says otherwise. */
  tone?: [string, string];
}) {
  // Gradient ids are document-wide, so the tone is part of the id: two marks
  // in different metals on one page must not share a gradient.
  const id = `fets-lit-${showEmptySeats ? "full" : "plain"}-${tone.join("").replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SPAN} ${SPAN}`}
      role="img"
      aria-label="FETS"
      className={className}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={tone[0]} />
          <stop offset="100%" stopColor={tone[1]} />
        </linearGradient>
      </defs>

      {F.flatMap((row, y) =>
        row.map((lit, x) => {
          const key = `${x}-${y}`;
          if (!lit && !showEmptySeats) return null;
          return (
            <rect
              key={key}
              x={PAD + x * (CELL + GAP)}
              y={PAD + y * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={5}
              fill={lit ? `url(#${id})` : "none"}
              stroke={lit ? "none" : "currentColor"}
              strokeWidth={lit ? 0 : 1.5}
              // The empty seats are present but quiet: they give the mark its
              // grid without competing with the letter.
              opacity={lit ? 1 : 0.22}
            />
          );
        }),
      )}
    </svg>
  );
}

/**
 * The mark with the name beside it.
 *
 * "FETS" in the serif at a size that lets the mark breathe, and the full name
 * underneath in the mono at a whisper — the way a plate beside a door reads.
 */
export function Logo({
  size = 48,
  subtitle = "Forun Testing & Educational Services",
  className = "",
}: {
  size?: number;
  subtitle?: string | null;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-[14px] ${className}`}>
      <LogoMark size={size} className="shrink-0 text-fg" />
      <span className="min-w-0">
        <span
          className="block font-serif leading-none tracking-[0.02em]"
          style={{ fontSize: size * 0.72 }}
        >
          FETS
        </span>
        {subtitle && (
          <span
            className="mt-[5px] block truncate font-mono text-fg-dim"
            style={{ fontSize: Math.max(9, size * 0.19) }}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
