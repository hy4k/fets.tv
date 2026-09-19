import type { Candidate, CandidateStatus } from "@/lib/types";

/** The 11 operational stages from the MVP brief, in order. */
export const STAGE_ORDER: CandidateStatus[] = [
  "scheduled",
  "arrived",
  "id_checked",
  "waiting",
  "frisking",
  "biometrics",
  "assigned",
  "lab_entry",
  "testing",
  "completed",
  "signed_out",
];

export const STAGE_LABELS: Record<CandidateStatus, string> = {
  scheduled: "Scheduled",
  arrived: "Arrived",
  id_checked: "ID checked",
  waiting: "Waiting",
  frisking: "Frisking",
  biometrics: "Biometrics",
  assigned: "Assigned",
  lab_entry: "Lab entry",
  testing: "Testing",
  completed: "Completed",
  signed_out: "Sign out",
  no_show: "No show",
};

export function fullName(c: Pick<Candidate, "first_name" | "last_name">) {
  return `${c.first_name} ${c.last_name}`.trim();
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function clockAt(iso: string | null | undefined, timezone: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(iso));
}

export function sinceLabel(iso: string, now: number = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

type Chip = { label: string; className: string };

export function statusChip(c: Candidate): Chip {
  if (c.status === "no_show") return { label: "No show", className: "bg-rust/15 text-rust" };
  if (c.called_at) return { label: "Called", className: "bg-gold/15 text-gold" };

  switch (c.status) {
    case "scheduled":
      return { label: "Scheduled", className: "bg-panel-soft text-fg-muted" };
    case "arrived":
    case "id_checked":
      return { label: "ID checked", className: "bg-gold/10 text-gold" };
    case "waiting":
      return { label: "Checked in", className: "bg-mint/15 text-mint" };
    case "completed":
    case "signed_out":
      return { label: "Done", className: "bg-mint/10 text-mint" };
    default:
      return { label: "Inside", className: "bg-iris/15 text-iris" };
  }
}

export function isInHall(c: Candidate) {
  return !["scheduled", "arrived", "completed", "signed_out", "no_show"].includes(c.status);
}
