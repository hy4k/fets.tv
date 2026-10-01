"use client";

import { useEffect, useState } from "react";
import { DisplayBoard } from "@/components/display/DisplayBoard";
import { shortName } from "@/lib/centres";
import { useConsole } from "@/lib/console-data";
import { useDisplayHome } from "@/lib/display-home";
import { roomFloor } from "@/lib/room";
import type { BoardHome } from "@/lib/types";

const LAYOUTS: { key: BoardHome["layout"]; label: string; hint: string }[] = [
  { key: "both", label: "Welcome + room", hint: "Your welcome on top, the seats and exams under it" },
  { key: "welcome", label: "Welcome only", hint: "Just your words, large — for a special day" },
  { key: "room", label: "Room only", hint: "Seats free, seats in use and the exams running" },
];

// Unset, the TV shows the room alone, so the form starts there too.
const BLANK: BoardHome = { layout: "room", title: "", subtitle: "", show_exams: true, show_early: true };

/**
 * The TV's home screen: what the hall sees between calls when no message is
 * up. Set for the day — a welcome line, a second line for anything the hall
 * should know, and what to show under it — and kept apart from messages,
 * which come and go on top.
 */
export function HomeScreenEditor() {
  const { center, candidates, workstations, programmes, displays, rpc, canCall } = useConsole();
  const { home, loaded } = useDisplayHome(center.id);
  const [draft, setDraft] = useState<BoardHome>(BLANK);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  // What is saved fills the form once, and again whenever nobody is editing.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (loaded && !touched) setDraft(home ?? BLANK);
  }, [home, loaded, touched]);

  const set = (patch: Partial<BoardHome>) => {
    setTouched(true);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const floor = roomFloor(candidates, workstations, programmes);
  const changed = JSON.stringify(draft) !== JSON.stringify(home ?? BLANK);
  const defaultTitle = `Welcome to FETS ${shortName(center.name)}`;

  async function save() {
    setBusy(true);
    const ok = await rpc(
      "fets_set_display_home",
      {
        p_center: center.id,
        p_layout: draft.layout,
        p_title: draft.title,
        p_subtitle: draft.subtitle,
        p_show_exams: draft.show_exams,
        p_show_early: draft.show_early,
      },
      "The TV home screen is updated",
    );
    setBusy(false);
    if (ok) setTouched(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto">
      <div className="grid grid-cols-1 gap-[16px] xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section className="flex flex-col gap-[18px] rounded-[22px] border border-edge-mid panel-bg p-[18px]">
          <div>
            <span className="block text-[16px] font-semibold">Home screen</span>
            <span className="block text-[12.5px] text-fg-faint">
              Shown between calls when no message is up. Messages and calls always appear on top of it.
            </span>
          </div>

          <div className="flex flex-col gap-[8px]">
            <span className="text-[12px] font-semibold text-fg-dim">Layout</span>
            <div className="grid grid-cols-1 gap-[8px]">
              {LAYOUTS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => set({ layout: l.key })}
                  className={`cursor-pointer rounded-[14px] border px-[14px] py-[11px] text-left transition-colors ${
                    draft.layout === l.key ? "border-accent/60 bg-accent/12" : "border-edge bg-panel-soft hover:border-edge-warm"
                  }`}
                >
                  <span className="block text-[14px] font-semibold">{l.label}</span>
                  <span className="block text-[11.5px] text-fg-faint">{l.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {draft.layout !== "room" && (
            <>
              <label className="flex flex-col gap-[7px]">
                <span className="flex items-baseline text-[12px] font-semibold text-fg-dim">
                  Welcome line
                  <span className="flex-1" />
                  <span className="font-mono text-[11px] font-normal text-fg-faint">{draft.title.length}/80</span>
                </span>
                <input
                  value={draft.title}
                  maxLength={80}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder={defaultTitle}
                  className="rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[12px] text-[16px] outline-none placeholder:text-fg-faint focus:border-accent/50"
                />
                <span className="text-[11px] text-fg-faint">Left empty, the TV says “{defaultTitle}”.</span>
              </label>

              <label className="flex flex-col gap-[7px]">
                <span className="flex items-baseline text-[12px] font-semibold text-fg-dim">
                  Second line
                  <span className="ml-[8px] font-normal text-fg-faint">optional</span>
                  <span className="flex-1" />
                  <span className="font-mono text-[11px] font-normal text-fg-faint">{draft.subtitle.length}/160</span>
                </span>
                <textarea
                  rows={2}
                  value={draft.subtitle}
                  maxLength={160}
                  onChange={(e) => set({ subtitle: e.target.value })}
                  placeholder="Today: CMA US and CELPIP · Please keep your phone switched off"
                  className="resize-none rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[11px] text-[14.5px] leading-[1.4] outline-none placeholder:text-fg-faint focus:border-accent/50"
                />
              </label>
            </>
          )}

          {draft.layout !== "welcome" && (
            <div className="flex flex-col gap-[8px]">
              <span className="text-[12px] font-semibold text-fg-dim">Under the seats</span>
              <Toggle on={draft.show_exams} onChange={(v) => set({ show_exams: v })} label="Exams in progress" />
              <Toggle on={draft.show_early} onChange={(v) => set({ show_early: v })} label="Early-entry line when seats are free" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-[10px]">
            <button
              type="button"
              disabled={!canCall || busy || !changed}
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
                  setDraft(home ?? BLANK);
                }}
                className="cursor-pointer rounded-[14px] border border-edge px-[18px] py-[14px] text-[13.5px] font-semibold text-fg-muted"
              >
                Undo changes
              </button>
            )}
          </div>
          {!canCall && <p className="text-[12.5px] text-gold">Only staff can change the TV.</p>}
        </section>

        <section className="flex min-w-0 flex-col gap-[10px]">
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
              home={draft}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex cursor-pointer items-center gap-[11px] rounded-[12px] border border-edge bg-panel-soft px-[12px] py-[10px] text-left"
    >
      <span className={`relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-[#2a2a34]"}`}>
        <span
          className={`absolute top-[3px] left-[3px] h-[16px] w-[16px] rounded-full bg-[#101015] transition-transform ${
            on ? "translate-x-[18px]" : ""
          }`}
        />
      </span>
      <span className="text-[13px]">{label}</span>
    </button>
  );
}
