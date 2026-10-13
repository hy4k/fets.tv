"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DisplayBoard } from "@/components/display/DisplayBoard";
import { shortName } from "@/lib/centres";
import { announceCall, unlockSound } from "@/lib/call-sound";
import { useConsole } from "@/lib/console-data";
import { useDisplayHome } from "@/lib/display-home";
import { callAnnouncement, HOME_DEFAULTS, homeView, MAX_LINES, visiblePieces } from "@/lib/home-screen";
import { fullName } from "@/lib/format";
import { roomFloor } from "@/lib/room";
import type { BoardHome, CallSound } from "@/lib/types";

/** Every setting, spelled out. An empty text means the standard wording. */
type Draft = Required<Omit<BoardHome, "layout">>;

// Unset, the TV shows the room alone, so the form starts there too.
const BLANK: Draft = {
  title: "",
  subtitle: "",
  show_welcome: false,
  show_seats: true,
  show_exams: true,
  show_early: true,
  seats_free_label: "",
  seats_used_label: "",
  exams_label: "",
  exams_empty: "",
  early_text: "",
  full_text: "",
  lines: [],
  call_sound: "voice",
};

/** A saved home screen, including one saved before every piece had a switch. */
function toDraft(home: BoardHome | null): Draft {
  if (!home) return BLANK;
  const v = homeView(home);
  return {
    title: home.title ?? "",
    subtitle: home.subtitle ?? "",
    show_welcome: v.showWelcome,
    show_seats: v.showSeats,
    show_exams: v.showExams,
    show_early: v.showEarly,
    seats_free_label: home.seats_free_label ?? "",
    seats_used_label: home.seats_used_label ?? "",
    exams_label: home.exams_label ?? "",
    exams_empty: home.exams_empty ?? "",
    early_text: home.early_text ?? "",
    full_text: home.full_text ?? "",
    lines: home.lines ?? [],
    call_sound: home.call_sound ?? "voice",
  };
}

const PRESETS: { label: string; patch: Partial<Draft> }[] = [
  { label: "Welcome + room", patch: { show_welcome: true, show_seats: true, show_exams: true, show_early: true } },
  { label: "Welcome only", patch: { show_welcome: true, show_seats: false, show_exams: false, show_early: false } },
  { label: "Room only", patch: { show_welcome: false, show_seats: true, show_exams: true, show_early: true } },
];

const SOUNDS: { key: CallSound; label: string; hint: string }[] = [
  { key: "voice", label: "Chime and name", hint: "A soft chime, then the name read out once" },
  { key: "chime", label: "Chime only", hint: "The soft chime, no voice" },
  { key: "off", label: "Silent", hint: "Nothing plays; the name only appears" },
];

/**
 * The TV's home screen: what the hall sees between calls when no message is
 * up. Every piece on it can be switched off, every word changed, and lines of
 * the centre's own added — and the sound the TV makes when somebody is called
 * is chosen here too.
 */
export function HomeScreenEditor() {
  const { center, candidates, workstations, programmes, displays, rpc, canCall } = useConsole();
  const { home, loaded } = useDisplayHome(center.id);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const saved = useMemo(() => toDraft(home), [home]);

  // What is saved fills the form once, and again whenever nobody is editing.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (loaded && !touched) setDraft(saved);
  }, [saved, loaded, touched]);

  const set = (patch: Partial<Draft>) => {
    setTouched(true);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const floor = roomFloor(candidates, workstations, programmes);
  const preview: BoardHome = { ...draft, layout: "both" };
  const nothingShown = !visiblePieces(homeView(preview), floor).any;
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const defaultTitle = `Welcome to FETS ${shortName(center.name)}`;
  const locked = !canCall;

  async function save() {
    setBusy(true);
    const ok = await rpc(
      "fets_save_display_home",
      { p_center: center.id, p_home: { ...draft, lines: draft.lines.map((l) => l.trim()).filter(Boolean) } },
      "The TV home screen is updated",
    );
    setBusy(false);
    if (ok) setTouched(false);
  }

  function testSound() {
    const sample = candidates.find((c) => c.status === "waiting") ?? candidates[0];
    void unlockSound().then(() =>
      announceCall(
        draft.call_sound,
        callAnnouncement({ name: sample ? fullName(sample) : "Arjun Nair", room: "Security & Biometrics" }),
      ),
    );
  }

  const setLine = (i: number, text: string) => set({ lines: draft.lines.map((l, j) => (j === i ? text : l)) });
  const moveLine = (i: number, by: -1 | 1) => {
    const next = [...draft.lines];
    const [line] = next.splice(i, 1);
    next.splice(i + by, 0, line);
    set({ lines: next });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto">
      <div className="grid grid-cols-1 gap-[16px] xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-[12px]">
          <section className="flex flex-col gap-[12px] rounded-[22px] border border-edge-mid panel-bg p-[18px]">
            <div>
              <span className="block text-[16px] font-semibold">Home screen</span>
              <span className="block text-[12.5px] text-fg-faint">
                Shown between calls when no message is up. Switch any piece off to remove it, change any words, or add
                lines of your own. Calls and messages always appear on top.
              </span>
            </div>
            <div className="flex flex-wrap gap-[8px]">
              <span className="self-center text-[12px] font-semibold text-fg-dim">Start from</span>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  disabled={locked}
                  onClick={() => set(p.patch)}
                  className="cursor-pointer rounded-[12px] border border-edge bg-panel-soft px-[12px] py-[8px] text-[12.5px] font-semibold text-fg-muted hover:border-edge-warm hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          <Piece title="Welcome" hint="A large line across the top, and a second line under it" on={draft.show_welcome} disabled={locked} onToggle={(v) => set({ show_welcome: v })}>
            <TextField label="Welcome line" value={draft.title} max={80} fallback={defaultTitle} disabled={locked} onChange={(v) => set({ title: v })} />
            <TextField
              label="Second line"
              value={draft.subtitle}
              max={160}
              multiline
              placeholder="Today: CMA US and CELPIP · Please keep your phone switched off"
              note="Optional. Leave empty for no second line."
              disabled={locked}
              onChange={(v) => set({ subtitle: v })}
            />
          </Piece>

          <section className="flex flex-col gap-[10px] rounded-[18px] border border-edge-mid panel-bg p-[16px]">
            <div className="flex items-baseline gap-[10px]">
              <span className="text-[14px] font-semibold">Your own lines</span>
              <span className="text-[11.5px] text-fg-faint">Shown under the welcome, in this order</span>
              <span className="flex-1" />
              <span className="font-mono text-[11px] text-fg-faint">
                {draft.lines.length}/{MAX_LINES}
              </span>
            </div>
            {draft.lines.length === 0 && (
              <p className="text-[12.5px] text-fg-faint">No lines yet. Add one for anything the hall should read today.</p>
            )}
            {draft.lines.map((line, i) => (
              <div key={i} className="flex items-center gap-[6px]">
                <input
                  value={line}
                  maxLength={160}
                  disabled={locked}
                  onChange={(e) => setLine(i, e.target.value)}
                  placeholder="e.g. Lockers are on your left · Water is by the window"
                  aria-label={`Line ${i + 1}`}
                  className="min-w-0 flex-1 rounded-[12px] border border-edge-strong bg-panel-soft px-[12px] py-[10px] text-[14px] outline-none placeholder:text-fg-faint focus:border-accent/50"
                />
                <IconButton label="Move up" disabled={locked || i === 0} onClick={() => moveLine(i, -1)}>
                  ↑
                </IconButton>
                <IconButton label="Move down" disabled={locked || i === draft.lines.length - 1} onClick={() => moveLine(i, 1)}>
                  ↓
                </IconButton>
                <IconButton label="Delete this line" danger disabled={locked} onClick={() => set({ lines: draft.lines.filter((_, j) => j !== i) })}>
                  ✕
                </IconButton>
              </div>
            ))}
            <button
              type="button"
              disabled={locked || draft.lines.length >= MAX_LINES}
              onClick={() => set({ lines: [...draft.lines, ""] })}
              className="cursor-pointer self-start rounded-[12px] border border-dashed border-edge-warm px-[14px] py-[9px] text-[13px] font-semibold text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Add a line
            </button>
          </section>

          <Piece title="Seats free and in use" hint="The ring with the free count, and how many seats are taken" on={draft.show_seats} disabled={locked} onToggle={(v) => set({ show_seats: v })}>
            <TextField label="Words under the free count" value={draft.seats_free_label} max={30} fallback={HOME_DEFAULTS.seats_free_label} disabled={locked} onChange={(v) => set({ seats_free_label: v })} />
            <TextField
              label="Words after “of 25”"
              value={draft.seats_used_label}
              max={40}
              fallback={HOME_DEFAULTS.seats_used_label}
              disabled={locked}
              onChange={(v) => set({ seats_used_label: v })}
            />
          </Piece>

          <Piece title="Exams in progress" hint="The exams running now and how many are sitting each" on={draft.show_exams} disabled={locked} onToggle={(v) => set({ show_exams: v })}>
            <TextField label="Heading" value={draft.exams_label} max={40} fallback={HOME_DEFAULTS.exams_label} disabled={locked} onChange={(v) => set({ exams_label: v })} />
            <TextField label="When no exam is running" value={draft.exams_empty} max={80} fallback={HOME_DEFAULTS.exams_empty} disabled={locked} onChange={(v) => set({ exams_empty: v })} />
          </Piece>

          <Piece title="Message under the seats" hint="Changes by itself when every seat is taken" on={draft.show_early} disabled={locked} onToggle={(v) => set({ show_early: v })}>
            <TextField label="When seats are free" value={draft.early_text} max={200} multiline fallback={HOME_DEFAULTS.early_text} disabled={locked} onChange={(v) => set({ early_text: v })} />
            <TextField label="When every seat is taken" value={draft.full_text} max={200} multiline fallback={HOME_DEFAULTS.full_text} disabled={locked} onChange={(v) => set({ full_text: v })} />
          </Piece>

          <section className="flex flex-col gap-[10px] rounded-[18px] border border-edge-mid panel-bg p-[16px]">
            <div>
              <span className="block text-[14px] font-semibold">Sound when a name is called</span>
              <span className="block text-[11.5px] text-fg-faint">
                Plays once on the hall TV each time the admin presses Call or Recall.
              </span>
            </div>
            <div className="grid grid-cols-1 gap-[8px] sm:grid-cols-3">
              {SOUNDS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  disabled={locked}
                  aria-pressed={draft.call_sound === s.key}
                  onClick={() => set({ call_sound: s.key })}
                  className={`cursor-pointer rounded-[14px] border px-[12px] py-[10px] text-left transition-colors disabled:cursor-not-allowed ${
                    draft.call_sound === s.key ? "border-accent/60 bg-accent/12" : "border-edge bg-panel-soft hover:border-edge-warm"
                  }`}
                >
                  <span className="block text-[13.5px] font-semibold">{s.label}</span>
                  <span className="block text-[11px] text-fg-faint">{s.hint}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-[10px]">
              <button
                type="button"
                disabled={draft.call_sound === "off"}
                onClick={testSound}
                className="cursor-pointer rounded-[12px] border border-edge-warm px-[14px] py-[9px] text-[13px] font-semibold text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
              >
                ▶ Play a test on this computer
              </button>
              <span className="text-[11.5px] text-fg-faint">
                If the TV shows “Call sound is off”, tap its screen or press a key on its remote once.
              </span>
            </div>
          </section>

          <div className="sticky bottom-0 flex flex-col gap-[8px] rounded-[18px] border border-edge-mid bg-[#121216]/95 p-[12px] backdrop-blur">
            {nothingShown && (
              <p className="text-[12.5px] text-gold">
                Everything is switched off. Between calls the TV will just say “Please take a seat”.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-[10px]">
              <button
                type="button"
                disabled={locked || busy || !changed}
                onClick={() => void save()}
                className="flex-1 cursor-pointer rounded-[14px] gold-bg px-[22px] py-[14px] text-[15px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Saving…" : changed ? "Show it on the TV" : "This is on the TV"}
              </button>
              {changed && (
                <button
                  type="button"
                  onClick={() => {
                    setTouched(false);
                    setDraft(saved);
                  }}
                  className="cursor-pointer rounded-[14px] border border-edge px-[18px] py-[14px] text-[13.5px] font-semibold text-fg-muted"
                >
                  Undo changes
                </button>
              )}
            </div>
            {locked && <p className="text-[12.5px] text-gold">Only staff can change the TV.</p>}
          </div>
        </div>

        <section className="flex min-w-0 flex-col gap-[10px] xl:sticky xl:top-0 xl:self-start">
          <span className="text-[12px] font-semibold text-fg-dim">How the hall will see it</span>
          <div className="aspect-video w-full">
            <DisplayBoard
              className="h-full"
              hallLabel={displays[0]?.hall_label ?? "HALL 1"}
              centre={center.name}
              siteLabel={center.site_code}
              timezone={center.timezone}
              call={null}
              next={[]}
              floor={floor}
              home={preview}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

/** One piece of the screen: its switch, and its words while it is on. */
function Piece({
  title,
  hint,
  on,
  disabled,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  on: boolean;
  disabled?: boolean;
  onToggle: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className={`flex flex-col gap-[12px] rounded-[18px] border p-[16px] ${on ? "border-edge-mid panel-bg" : "border-edge bg-panel-soft/40"}`}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onToggle(!on)}
        className="flex cursor-pointer items-center gap-[12px] text-left disabled:cursor-not-allowed"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">{title}</span>
          <span className="block text-[11.5px] text-fg-faint">{on ? hint : "Off: not on the TV"}</span>
        </span>
        <span className={`relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-[#2a2a34]"}`}>
          <span
            className={`absolute top-[3px] left-[3px] h-[16px] w-[16px] rounded-full bg-[#101015] transition-transform ${
              on ? "translate-x-[18px]" : ""
            }`}
          />
        </span>
      </button>
      {on && children}
    </section>
  );
}

/** A box of words. Empty means the standard wording, which shows as the placeholder. */
function TextField({
  label,
  value,
  max,
  fallback,
  placeholder,
  note,
  multiline = false,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  max: number;
  /** The standard wording, used while the box is empty. */
  fallback?: string;
  placeholder?: string;
  note?: string;
  multiline?: boolean;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  const cls =
    "rounded-[12px] border border-edge-strong bg-panel-soft px-[12px] py-[10px] text-[14px] leading-[1.4] outline-none placeholder:text-fg-faint focus:border-accent/50";
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="flex items-baseline gap-[8px] text-[12px] font-semibold text-fg-dim">
        {label}
        <span className="flex-1" />
        {fallback && value && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onChange("");
            }}
            className="cursor-pointer text-[11px] font-normal text-fg-faint underline hover:text-fg"
          >
            Back to standard wording
          </button>
        )}
        <span className="font-mono text-[11px] font-normal text-fg-faint">
          {value.length}/{max}
        </span>
      </span>
      {multiline ? (
        <textarea
          rows={2}
          value={value}
          maxLength={max}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fallback ?? placeholder}
          className={`resize-none ${cls}`}
        />
      ) : (
        <input value={value} maxLength={max} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder={fallback ?? placeholder} className={cls} />
      )}
      {(note || fallback) && (
        <span className="text-[11px] text-fg-faint">{note ?? "Left empty, the TV uses the wording shown in grey."}</span>
      )}
    </label>
  );
}

function IconButton({
  label,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`h-[38px] w-[34px] shrink-0 cursor-pointer rounded-[10px] border border-edge bg-panel-soft text-[13px] text-fg-muted disabled:cursor-not-allowed disabled:opacity-30 ${
        danger ? "hover:border-rust/50 hover:text-rust" : "hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
