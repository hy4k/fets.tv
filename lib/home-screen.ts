import type { BoardFloor, BoardHome, CallSound } from "@/lib/types";

/** The standard wording, used wherever a centre has left a box empty. */
export const HOME_DEFAULTS = {
  seats_free_label: "seats free",
  seats_used_label: "seats in use",
  exams_label: "Exams in progress",
  exams_empty: "No exam is running right now",
  early_text: "Here early for a later exam? Seats are free now — ask at the front desk about going in early.",
  full_text: "Every seat is in use. Please take a seat — you will be called by name.",
} as const;

export const MAX_LINES = 8;

/** Every setting resolved: what the TV shows, in words it can print. */
export type HomeView = {
  showWelcome: boolean;
  title: string;
  subtitle: string;
  lines: string[];
  showSeats: boolean;
  seatsFreeLabel: string;
  seatsUsedLabel: string;
  showExams: boolean;
  examsLabel: string;
  examsEmpty: string;
  showEarly: boolean;
  earlyText: string;
  fullText: string;
  callSound: CallSound;
};

const or = (value: string | undefined | null, fallback: string) => value?.trim() || fallback;

/**
 * A home screen as saved, or as saved before every piece had its own switch,
 * or never saved at all. Unset, the TV shows the room: seats, exams and the
 * early-entry line, no welcome.
 */
export function homeView(home: BoardHome | null | undefined, centre?: string | null): HomeView {
  const layout = home?.layout ?? "room";
  // Rows saved before the switches existed carry only the layout.
  const legacy = home != null && home.show_welcome === undefined;
  const roomShown = layout !== "welcome";
  return {
    showWelcome: home ? (legacy ? layout !== "room" : !!home.show_welcome) : false,
    title: or(home?.title, `Welcome to FETS${centre ? ` ${centre}` : ""}`),
    subtitle: home?.subtitle?.trim() ?? "",
    lines: (home?.lines ?? []).map((l) => l.trim()).filter(Boolean).slice(0, MAX_LINES),
    showSeats: home ? (legacy ? roomShown : home.show_seats !== false) : true,
    seatsFreeLabel: or(home?.seats_free_label, HOME_DEFAULTS.seats_free_label),
    seatsUsedLabel: or(home?.seats_used_label, HOME_DEFAULTS.seats_used_label),
    showExams: (home?.show_exams ?? true) && (!legacy || roomShown),
    examsLabel: or(home?.exams_label, HOME_DEFAULTS.exams_label),
    examsEmpty: or(home?.exams_empty, HOME_DEFAULTS.exams_empty),
    showEarly: (home?.show_early ?? true) && (!legacy || roomShown),
    earlyText: or(home?.early_text, HOME_DEFAULTS.early_text),
    fullText: or(home?.full_text, HOME_DEFAULTS.full_text),
    callSound: home?.call_sound ?? "voice",
  };
}

/** Which pieces actually reach the screen, given the room as it is now. */
export function visiblePieces(view: HomeView, floor: BoardFloor | null | undefined) {
  const seats = view.showSeats && !!floor && floor.seats_total > 0;
  const exams = view.showExams && !!floor;
  // Without seats set up there is nothing true to say about free seats.
  const early = view.showEarly && !!floor && floor.seats_total > 0;
  const welcome = view.showWelcome;
  const lines = view.lines.length > 0;
  return { welcome, lines, seats, exams, early, any: welcome || lines || seats || exams || early };
}

/** "SHEZIN ASHIQUE" → "Shezin Ashique": capitals make a speaking voice spell names out. */
function speakable(name: string) {
  return name
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    .trim();
}

/** What the hall hears when a name goes up. */
export function callAnnouncement(call: { name: string | null; room: string | null }) {
  if (!call.name?.trim()) return null;
  const room = call.room
    ?.replace(/&/g, " and ")
    .replace(/\s*[·|/]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  return `${speakable(call.name)}. Please proceed${room ? ` to ${room}` : ""}.`;
}
