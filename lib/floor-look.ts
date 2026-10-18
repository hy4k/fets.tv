/** How a sitting looks on the Lab page: the clock text and the colour of its time left. */

export function countdown(msRemaining: number) {
  const over = msRemaining <= 0;
  const total = Math.floor(Math.abs(msRemaining) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const body = h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m}m`;
  return over ? `+${body}` : body;
}

/**
 * The liquid in each tube. One calm champagne for most of the sitting, warming
 * to amber in the last quarter hour and to a soft coral once past time; a break
 * turns it to frosted pearl. No traffic-light red and green.
 */
export function liquid(remaining: number, onBreak: boolean) {
  if (onBreak)
    return {
      fill: "linear-gradient(90deg, oklch(0.78 0.04 290), oklch(0.9 0.03 300))",
      glow: "oklch(0.8 0.06 295 / 0.45)",
      ring: "oklch(0.86 0.04 298)",
      text: "text-[oklch(0.88_0.05_300)]",
    };
  const minutes = remaining / 60000;
  if (minutes <= 0)
    return {
      fill: "linear-gradient(90deg, oklch(0.62 0.13 25), oklch(0.76 0.12 35))",
      glow: "oklch(0.7 0.14 30 / 0.5)",
      ring: "oklch(0.72 0.13 32)",
      text: "text-[oklch(0.8_0.12_35)]",
    };
  if (minutes <= 15)
    return {
      fill: "linear-gradient(90deg, oklch(0.7 0.13 60), oklch(0.85 0.12 78))",
      glow: "oklch(0.8 0.13 70 / 0.45)",
      ring: "oklch(0.8 0.13 72)",
      text: "text-[oklch(0.87_0.11_78)]",
    };
  return {
    fill: "linear-gradient(90deg, oklch(0.72 0.07 75), oklch(0.93 0.05 90))",
    glow: "oklch(0.9 0.06 85 / 0.35)",
    ring: "oklch(0.88 0.06 85)",
    text: "text-[oklch(0.93_0.04_90)]",
  };
}
