"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { useDrawers } from "@/lib/drawer-store";
import { useConsole } from "@/lib/console-data";
import { useNow } from "@/lib/use-clock";
import { clockAt } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ScheduleRules } from "@/lib/types";

export function SettingsScreen() {
  const { center, rules, workstations, displays, programmes, notify, refresh, rpc, isAdmin } = useConsole();
  const { open, toggle } = useDrawers("settings", { sched: true, work: false, disp: false, programmes: false });
  const now = useNow();

  async function saveRules(patch: Partial<ScheduleRules>) {
    const { error } = await supabaseBrowser().from("schedule_rules").update(patch).eq("center_id", center.id);
    if (error) notify(error.message, "error");
    else await refresh();
  }

  async function saveProgramme(id: string, minutes: number) {
    const { error } = await supabaseBrowser()
      .from("exam_programmes")
      .update({ default_duration_minutes: minutes })
      .eq("id", id);
    if (error) notify(error.message, "error");
    else await refresh();
  }

  async function saveCenter(patch: { show_name_on_tv: boolean }) {
    const { error } = await supabaseBrowser().from("centers").update(patch).eq("id", center.id);
    if (error) notify(error.message, "error");
    else await refresh();
  }

  const slotCount = countSlots(rules);

  const times: { label: string; value: string; className: string; field?: keyof ScheduleRules }[] = [
    { label: "Start", value: rules.exam_start.slice(0, 5), className: "text-mint", field: "exam_start" },
    { label: "End", value: rules.exam_end.slice(0, 5), className: "text-gold", field: "exam_end" },
    { label: "Break", value: rules.break_start?.slice(0, 5) ?? "13:00", className: "text-rust", field: "break_start" },
    { label: "Slots", value: String(slotCount), className: "text-fg" },
  ];

  const steppers: { key: keyof ScheduleRules; label: string; unit: string; step: number; min: number }[] = [
    { key: "slot_interval_minutes", label: "Slot interval", unit: "minutes", step: 5, min: 5 },
    { key: "exam_duration_minutes", label: "Exam duration", unit: "minutes", step: 5, min: 5 },
    { key: "labs_count", label: "Labs", unit: "count", step: 1, min: 1 },
    { key: "lab_capacity", label: "Lab capacity", unit: "seats", step: 5, min: 1 },
    { key: "break_minutes", label: "Break", unit: "minutes", step: 5, min: 0 },
  ];

  const toggles: { label: string; on: boolean; set: (value: boolean) => void }[] = [
    {
      label: "Frisking checkpoint",
      on: rules.frisking_enabled,
      set: (v) => saveRules({ frisking_enabled: v }),
    },
    { label: "Biometrics gate", on: rules.biometrics_enabled, set: (v) => saveRules({ biometrics_enabled: v }) },
    { label: "Auto re-sequence", on: rules.auto_resequence, set: (v) => saveRules({ auto_resequence: v }) },
    {
      label: "Locker key required",
      on: rules.locker_key_required,
      set: (v) => saveRules({ locker_key_required: v }),
    },
    { label: "Admin override log", on: rules.admin_override_log, set: (v) => saveRules({ admin_override_log: v }) },
    { label: "Show name on TV", on: center.show_name_on_tv, set: (v) => saveCenter({ show_name_on_tv: v }) },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[12px] overflow-x-hidden overflow-y-auto">
      <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-[12px]">
        {times.map((t) => (
          <div key={t.label} className="rounded-[18px] border border-edge-mid panel-bg p-[13px]">
            <span className="text-[9.5px] font-bold tracking-[0.12em] text-fg-faint uppercase">{t.label}</span>
            {t.field && isAdmin ? (
              <TimeField
                value={t.value}
                className={t.className}
                onCommit={(next) => saveRules({ [t.field!]: next } as Partial<ScheduleRules>)}
              />
            ) : (
              <div className={`mt-[6px] font-mono text-[21px] font-semibold ${t.className}`}>{t.value}</div>
            )}
          </div>
        ))}
      </div>

      <Drawer label="Scheduling" open={open.sched} onToggle={toggle("sched")}>
        <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[10px]">
          {steppers.map((s) => {
            const value = rules[s.key] as number;
            return (
              <div
                key={s.key}
                className="flex items-center gap-[10px] rounded-[15px] border border-edge bg-panel-soft px-[11px] py-[10px]"
              >
                <span className="block min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold">{s.label}</span>
                  <span className="mt-[2px] block font-mono text-[10px] text-fg-faint">{s.unit}</span>
                </span>
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => saveRules({ [s.key]: Math.max(s.min, value - s.step) } as Partial<ScheduleRules>)}
                  className="h-[32px] w-[32px] cursor-pointer rounded-[10px] border border-edge-warm bg-[#221d19] font-mono text-[14px] disabled:opacity-40"
                >
                  −
                </button>
                <span className="min-w-[36px] text-center font-mono text-[17px] font-semibold">{value}</span>
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => saveRules({ [s.key]: value + s.step } as Partial<ScheduleRules>)}
                  className="h-[32px] w-[32px] cursor-pointer rounded-[10px] border border-gold/50 bg-gold/15 font-mono text-[14px] text-gold-bright disabled:opacity-40"
                >
                  +
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-[10px] rounded-[15px] border border-edge bg-panel-soft px-[12px] py-[11px]">
          <span className="min-w-0 flex-1 text-[12px] text-fg-muted">
            {workstations.length} workstations exist. Rebuilding adds seats for the current lab settings; seats in
            use are never removed.
          </span>
          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => rpc("fets_sync_workstations", { p_center: center.id }, "Seat map rebuilt")}
            className="cursor-pointer rounded-[12px] border border-edge-warm bg-[#221d19] px-[14px] py-[10px] text-[12px] font-semibold disabled:opacity-40"
          >
            Rebuild seat map
          </button>
        </div>
      </Drawer>

      <Drawer label="Workflow" open={open.work} onToggle={toggle("work")}>
        <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[10px]">
          {toggles.map((t) => (
            <button
              key={t.label}
              type="button"
              disabled={!isAdmin}
              onClick={() => t.set(!t.on)}
              className={`flex cursor-pointer items-center gap-[10px] rounded-[15px] border bg-panel-soft p-[11px] text-left disabled:opacity-60 ${
                t.on ? "border-mint/45" : "border-edge"
              }`}
            >
              <span className="min-w-0 flex-1 text-[12.5px] font-semibold">{t.label}</span>
              <span
                className={`flex h-[24px] w-[42px] shrink-0 rounded-full border p-[2px] ${
                  t.on ? "justify-end border-mint/45 bg-mint/20" : "justify-start border-edge bg-[#221d19]"
                }`}
              >
                <span className={`h-[18px] w-[18px] rounded-full ${t.on ? "bg-mint" : "bg-[#4a4038]"}`} />
              </span>
            </button>
          ))}
        </div>
        <p className="shrink-0 font-mono text-[10.5px] text-fg-faint">
          “Show name on TV” is on: the public display shows token + name. Turn it off for a token-only hall — phone,
          place and roster fields never reach a display either way.
        </p>
      </Drawer>

      <Drawer
        label="Exam programmes"
        meta={programmes.length}
        open={open.programmes}
        onToggle={toggle("programmes")}
      >
        <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-[10px]">
          {programmes.map((prog) => (
            <div
              key={prog.id}
              className="flex items-center gap-[10px] rounded-[15px] border border-edge bg-panel-soft px-[11px] py-[10px]"
            >
              <span className="block min-w-0 flex-1">
                <span className="block text-[12px] font-semibold">{prog.code}</span>
                <span className="mt-[2px] block font-mono text-[10px] text-fg-faint">default duration</span>
              </span>
              <DurationField
                value={prog.default_duration_minutes}
                disabled={!isAdmin}
                onCommit={(minutes) => saveProgramme(prog.id, minutes)}
              />
              <span className="font-mono text-[10px] text-fg-faint">min</span>
            </div>
          ))}
        </div>
        <p className="shrink-0 font-mono text-[10.5px] text-fg-faint">
          These are the durations the Live Floor pre-fills when an exam is started; staff can still override per
          candidate. Confirm each one against the programme&rsquo;s own instructions before relying on it.
        </p>
      </Drawer>

      <Drawer label="Displays" meta={displays.length} open={open.disp} onToggle={toggle("disp")}>
        <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[10px]">
          {displays.map((d) => {
            const stale = !d.last_seen_at || now - new Date(d.last_seen_at).getTime() > 60_000;
            return (
              <div
                key={d.id}
                className="flex items-center gap-[10px] rounded-[14px] border border-edge bg-panel-soft p-[11px]"
              >
                <span className={`h-[7px] w-[7px] rounded-full ${stale ? "bg-rust" : "bg-mint"}`} />
                <span className="min-w-0 flex-1 overflow-hidden text-[12px] font-semibold text-ellipsis whitespace-nowrap">
                  {d.label}
                </span>
                <span className="font-mono text-[10px] text-fg-faint">
                  {d.last_seen_at ? clockAt(d.last_seen_at, center.timezone) : "never"}
                </span>
              </div>
            );
          })}
          {displays.length === 0 && (
            <p className="font-mono text-[11px] text-fg-faint">No displays paired yet.</p>
          )}
        </div>
      </Drawer>
    </div>
  );
}

function DurationField({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (minutes: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    const next = draft;
    setDraft(null);
    const minutes = Number(next);
    if (next && Number.isFinite(minutes) && minutes >= 1 && minutes <= 1440 && minutes !== value) {
      onCommit(minutes);
    }
  }

  return (
    <input
      inputMode="numeric"
      disabled={disabled}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="w-[58px] rounded-[10px] border border-edge-strong bg-panel px-[8px] py-[6px] text-center font-mono text-[13px] font-semibold outline-none disabled:opacity-60"
    />
  );
}

/** 24-hour time entry. A native time input renders 12-hour on most locales. */
function TimeField({
  value,
  className,
  onCommit,
}: {
  value: string;
  className: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    const next = draft;
    setDraft(null);
    if (next && next !== value && /^([01]\d|2[0-3]):[0-5]\d$/.test(next)) onCommit(next);
  }

  return (
    <input
      inputMode="numeric"
      maxLength={5}
      placeholder="HH:MM"
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={`mt-[6px] w-full bg-transparent font-mono text-[21px] font-semibold outline-none ${className}`}
    />
  );
}

function countSlots(rules: ScheduleRules) {
  const minutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };

  const window =
    minutes(rules.exam_end) - minutes(rules.exam_start) - (rules.break_start ? rules.break_minutes : 0);
  return Math.max(0, Math.floor(window / rules.slot_interval_minutes));
}
