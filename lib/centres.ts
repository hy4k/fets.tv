/**
 * How each centre looks, so nobody works at the wrong one by mistake.
 *
 * The place colours (Arrivals teal, Exam hall violet…) say *what* you are
 * doing; this says *where*. It lives on the mark, the centre's name and its
 * card at the front door — enough to know Cochin from Calicut across a room,
 * without competing with the place colours on every button.
 *
 * Calicut keeps the FETS gold it has always had. Cochin is pearl and harbour
 * blue: the same weight and finish, a different metal.
 */
export type CentreLook = {
  /** Two gradient stops for the mark and the name. */
  tone: [string, string];
  /** A quiet line under the name on the front door. */
  motto: string;
  /** Three letters for small badges. */
  short: string;
};

const LOOKS: Record<string, CentreLook> = {
  calicut: {
    tone: ["oklch(0.88 0.14 82)", "oklch(0.7 0.15 58)"],
    motto: "Kozhikode",
    short: "CLT",
  },
  cochin: {
    tone: ["oklch(0.95 0.025 230)", "oklch(0.68 0.1 238)"],
    motto: "Kochi",
    short: "COK",
  },
};

const FALLBACK: CentreLook = {
  tone: ["oklch(0.88 0.14 82)", "oklch(0.7 0.15 58)"],
  motto: "",
  short: "FET",
};

/** The look for a centre, by its name ("Cochin", "FETS Cochin" — either). */
export function centreLook(name: string | null | undefined): CentreLook {
  const key = (name ?? "").replace(/^FETS\s+/i, "").trim().toLowerCase();
  return LOOKS[key] ?? { ...FALLBACK, short: key.slice(0, 3).toUpperCase() || FALLBACK.short };
}

/** The centre's name without the company prefix. */
export function shortName(name: string) {
  return name.replace(/^FETS\s+/i, "");
}
