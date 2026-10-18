/**
 * A lab drawn as it stands in the building.
 *
 * The plan is a grid of square cells. Each seat sits in one cell and faces one
 * way — towards its monitor — and the room's other furniture (the "Test
 * Station" sign, pillars, doors) are boxes laid over the grid. It is stored on
 * the lab (labs.plan) as drawn on the architect's sheet; the Lab page can turn
 * it on its side to fit a wide screen.
 *
 * Seats are keyed by workstation id, so renumbering a desk never moves it.
 */

export type Facing = "up" | "down" | "left" | "right";

export type PlanSeat = { x: number; y: number; f: Facing };

export type PlanItemKind = "label" | "pillar" | "door";

export type PlanItem = { k: PlanItemKind; x: number; y: number; w: number; h: number; t?: string };

export type LabPlan = {
  /** Columns and rows of the grid. */
  w: number;
  h: number;
  seats: Record<string, PlanSeat>;
  items: PlanItem[];
};

export const MAX_SIDE = 60;
const FACINGS: Facing[] = ["up", "right", "down", "left"];
const KINDS: PlanItemKind[] = ["label", "pillar", "door"];

const whole = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/** A stored plan, or null when it is missing or not one. */
export function readPlan(raw: unknown): LabPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<LabPlan>;
  if (!whole(p.w, 1, MAX_SIDE) || !whole(p.h, 1, MAX_SIDE)) return null;
  const w = p.w as number;
  const h = p.h as number;
  const seats: Record<string, PlanSeat> = {};
  for (const [id, s] of Object.entries(p.seats && typeof p.seats === "object" ? p.seats : {})) {
    if (!s || !whole(s.x, 0, w - 1) || !whole(s.y, 0, h - 1)) continue;
    seats[id] = { x: s.x, y: s.y, f: FACINGS.includes(s.f) ? s.f : "up" };
  }
  const items = (Array.isArray(p.items) ? p.items : [])
    .filter(
      (i): i is PlanItem =>
        !!i && KINDS.includes(i.k) && whole(i.x, 0, w - 1) && whole(i.y, 0, h - 1) && whole(i.w, 1, MAX_SIDE) && whole(i.h, 1, MAX_SIDE),
    )
    .map((i) => ({ k: i.k, x: i.x, y: i.y, w: Math.min(i.w, w - i.x), h: Math.min(i.h, h - i.y), ...(i.t ? { t: String(i.t).slice(0, 40) } : {}) }));
  return { w, h, seats, items };
}

/** Seats in rows of up to eight, in the order given: a lab nobody has drawn yet. */
export function autoPlan(seatIds: string[], perRow = 8): LabPlan {
  const w = Math.max(1, Math.min(perRow, seatIds.length));
  const h = Math.max(1, Math.ceil(seatIds.length / w));
  const seats: Record<string, PlanSeat> = {};
  seatIds.forEach((id, i) => {
    seats[id] = { x: i % w, y: Math.floor(i / w), f: "up" };
  });
  return { w, h, seats, items: [] };
}

/**
 * The plan with every seat on it. A seat the plan does not place yet — added
 * since it was drawn — goes into a row of its own below, so it is never
 * missing from the floor. Seats the lab no longer has are dropped.
 */
export function completePlan(plan: LabPlan | null, seatIds: string[]): LabPlan {
  if (!plan) return autoPlan(seatIds);
  const known = new Set(seatIds);
  const seats: Record<string, PlanSeat> = {};
  for (const [id, s] of Object.entries(plan.seats)) if (known.has(id)) seats[id] = s;
  const loose = seatIds.filter((id) => !seats[id]);
  let h = plan.h;
  if (loose.length) {
    const top = plan.h + 1;
    loose.forEach((id, i) => {
      seats[id] = { x: i % plan.w, y: top + Math.floor(i / plan.w), f: "up" };
    });
    h = top + Math.ceil(loose.length / plan.w);
  }
  return { ...plan, h, seats };
}

/** The way a seat faces once the plan is turned a quarter anticlockwise. */
const TURNED: Record<Facing, Facing> = { up: "left", left: "down", down: "right", right: "up" };

/**
 * The plan turned a quarter anticlockwise, so a tall narrow room reads across
 * a wide screen: the top of the drawing becomes its left-hand end.
 */
export function turnPlan(plan: LabPlan): LabPlan {
  const seats: Record<string, PlanSeat> = {};
  for (const [id, s] of Object.entries(plan.seats)) {
    seats[id] = { x: s.y, y: plan.w - 1 - s.x, f: TURNED[s.f] };
  }
  const items = plan.items.map((i) => ({ ...i, x: i.y, y: plan.w - i.x - i.w, w: i.h, h: i.w }));
  return { w: plan.h, h: plan.w, seats, items };
}

/** The next way round, for the editor's turn button. */
export function nextFacing(f: Facing): Facing {
  return FACINGS[(FACINGS.indexOf(f) + 1) % FACINGS.length];
}

/** What, if anything, already stands in a cell. */
export function occupant(plan: LabPlan, x: number, y: number, except?: string): string | null {
  for (const [id, s] of Object.entries(plan.seats)) if (id !== except && s.x === x && s.y === y) return id;
  return null;
}
