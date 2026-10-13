import type { Workstation } from "@/lib/types";

/**
 * The number on the desk. A seat's code ("Lab 1-07") is only its fixed
 * identity, and its hyphen reads as a range, so people are shown the number:
 * the one set in Setup, or the code's number without the leading zero.
 */
export function seatNumber(w: Pick<Workstation, "seat_code"> & { seat_label?: string | null }) {
  const own = w.seat_label?.trim();
  if (own) return own;
  const tail = w.seat_code.replace(/^.*-/, "");
  return /^\d+$/.test(tail) ? String(Number(tail)) : w.seat_code;
}

/** "Lab 1 · Seat 7" — how a seat is named anywhere a person reads it. */
export function seatName(w: Pick<Workstation, "seat_code" | "lab_name"> & { seat_label?: string | null }) {
  const lab = w.lab_name?.trim();
  return `${lab ? `${lab} · ` : ""}Seat ${seatNumber(w)}`;
}
