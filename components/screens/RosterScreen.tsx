"use client";

import { useMemo, useRef, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { useDrawers } from "@/lib/drawer-store";
import { useConsole } from "@/lib/console-data";
import { basePath } from "@/lib/base-path";
import { clockAt } from "@/lib/format";
import type { RosterPreview } from "@/lib/types";

export function RosterScreen() {
  const { candidates, center, rules, session, rpc, isAdmin, notify, refresh } = useConsole();
  const { open, toggle } = useDrawers("roster", { valid: false, slots: true });
  const fileInput = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10));

  const slotCapacity = Math.max(
    1,
    Math.ceil((rules.labs_count * rules.lab_capacity * rules.slot_interval_minutes) / rules.exam_duration_minutes),
  );

  const slots = useMemo(() => {
    const byTime = new Map<string, number>();
    for (const c of candidates) {
      if (!c.scheduled_at || c.status === "no_show") continue;
      byTime.set(c.scheduled_at, (byTime.get(c.scheduled_at) ?? 0) + 1);
    }
    return [...byTime.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([iso, count]) => ({ iso, count, full: count >= slotCapacity }));
  }, [candidates, slotCapacity]);

  const validation = useMemo(() => {
    const live = candidates.filter((c) => c.status !== "no_show");
    return [
      { label: "Valid", value: live.length, className: "text-mint" },
      {
        label: "Warnings",
        value: candidates.filter((c) => !c.part || !c.phone).length,
        className: "text-gold",
      },
      { label: "Errors", value: preview?.counts.errors ?? 0, className: "text-rust" },
      {
        label: "No show",
        value: candidates.filter((c) => c.status === "no_show").length,
        className: "text-fg-muted",
      },
    ];
  }, [candidates, preview]);

  async function onFile(file: File) {
    setBusy(true);
    setPreview(null);

    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`${basePath}/api/roster/parse`, { method: "POST", body });
    const payload = await response.json();
    setBusy(false);

    if (!response.ok) {
      notify(payload.error ?? "Could not read that file", "error");
      return;
    }

    setPreview(payload as RosterPreview);
    setExamName(file.name.replace(/\.(csv|xlsx)$/i, "").replace(/[_-]+/g, " "));
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);

    const ok = await rpc("fets_import_roster", {
      p_center: center.id,
      p_exam_name: examName.trim() || preview.filename,
      p_exam_date: examDate,
      p_filename: preview.filename,
      p_rows: preview.rows,
    });

    setBusy(false);
    if (ok) {
      notify(`Imported ${preview.rows.length} candidates`);
      setPreview(null);
      await refresh();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[12px] overflow-x-hidden overflow-y-auto">
      <div className="flex shrink-0 flex-wrap items-center gap-[14px] rounded-[20px] border border-edge-mid panel-bg p-[16px]">
        <span className="flex h-[40px] w-[40px] items-center justify-center rounded-[12px] bg-mint/15 font-mono text-[15px] text-mint">
          ✓
        </span>
        <span className="block min-w-0">
          <span className="block overflow-hidden font-mono text-[12.5px] text-ellipsis whitespace-nowrap">
            {session?.source_filename ?? session?.exam_name ?? "No roster imported"}
          </span>
          <span className="mt-[3px] block text-[11px] text-fg-faint">
            {session
              ? `${candidates.length} rows · committed ${clockAt(session.created_at, center.timezone)}`
              : "Import a .csv or .xlsx roster to begin"}
          </span>
        </span>
        <span className="flex-1" />
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={!isAdmin || busy}
          onClick={() => fileInput.current?.click()}
          className="cursor-pointer rounded-[13px] border border-edge-warm bg-[#221d19] px-[15px] py-[11px] text-[12.5px] font-semibold disabled:opacity-50"
        >
          {busy ? "Reading…" : session ? "Replace" : "Import roster"}
        </button>
      </div>

      {preview && (
        <div className="flex shrink-0 flex-col gap-[12px] rounded-[20px] border border-gold/40 bg-gold/5 p-[16px]">
          <div className="flex flex-wrap items-center gap-[10px]">
            <span className="text-[11px] font-bold tracking-[0.12em] text-gold uppercase">Import preview</span>
            <span className="font-mono text-[11px] text-fg-muted">
              header row {preview.header_row} · {preview.rows.length} rows · {preview.counts.skipped} blank
              rows skipped
            </span>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-[10px]">
            {[
              { label: "Valid", value: preview.counts.valid, className: "text-mint" },
              { label: "Warnings", value: preview.counts.warnings, className: "text-gold" },
              { label: "Errors", value: preview.counts.errors, className: "text-rust" },
              { label: "No show", value: preview.counts.no_show, className: "text-fg-muted" },
            ].map((tile) => (
              <div key={tile.label} className="rounded-[15px] border border-edge bg-panel-soft p-[12px]">
                <div className={`font-serif text-[30px] leading-none ${tile.className}`}>{tile.value}</div>
                <div className="mt-[5px] text-[10px] font-bold tracking-[0.1em] text-fg-dim uppercase">
                  {tile.label}
                </div>
              </div>
            ))}
          </div>

          {preview.issues.length > 0 && (
            <div className="flex max-h-[150px] flex-col gap-[6px] overflow-y-auto rounded-[14px] border border-edge bg-panel p-[12px]">
              {preview.issues.map((issue, i) => (
                <p key={i} className="font-mono text-[11px]">
                  <span className={issue.level === "error" ? "text-rust" : "text-gold"}>
                    row {issue.source_row}
                  </span>{" "}
                  <span className="text-fg-muted">{issue.message}</span>
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-[10px]">
            <label className="flex min-w-[200px] flex-1 flex-col gap-[6px]">
              <span className="text-[9.5px] font-bold tracking-[0.12em] text-fg-dim uppercase">Exam name</span>
              <input
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                className="rounded-[12px] border border-edge-strong bg-panel-soft px-[11px] py-[10px] text-[12.5px] outline-none"
              />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[9.5px] font-bold tracking-[0.12em] text-fg-dim uppercase">Exam date</span>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="rounded-[12px] border border-edge-strong bg-panel-soft px-[11px] py-[10px] font-mono text-[12.5px] outline-none"
              />
            </label>
            <button
              type="button"
              disabled={busy || preview.rows.length === 0}
              onClick={commit}
              className="cursor-pointer rounded-[13px] bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] px-[16px] py-[12px] text-[12.5px] font-bold text-[#0c1711] disabled:opacity-50"
            >
              Commit {preview.rows.length} candidates
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="cursor-pointer rounded-[13px] border border-edge px-[14px] py-[12px] text-[12.5px] font-semibold text-fg-muted"
            >
              Cancel
            </button>
          </div>

          <p className="font-mono text-[10.5px] text-fg-faint">
            Committing closes the current session and issues fresh FETS tokens in roster order.
          </p>
        </div>
      )}

      <Drawer
        label="Validation"
        meta={`${validation[1].value + validation[2].value} flags`}
        metaClassName="text-gold"
        open={open.valid}
        onToggle={toggle("valid")}
      >
        <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-[10px]">
          {validation.map((v) => (
            <div key={v.label} className="rounded-[16px] border border-edge bg-panel-soft p-[13px]">
              <div className={`font-serif text-[32px] leading-none ${v.className}`}>{v.value}</div>
              <div className="mt-[6px] text-[10px] font-bold tracking-[0.1em] text-fg-dim uppercase">
                {v.label}
              </div>
            </div>
          ))}
        </div>
      </Drawer>

      <Drawer
        label="Slot preview"
        meta={`${slots.length} slots · ${rules.slot_interval_minutes}m`}
        open={open.slots}
        onToggle={toggle("slots")}
      >
        <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(196px,1fr))] gap-[10px]">
          {slots.map((slot) => (
            <div key={slot.iso} className="rounded-[15px] border border-edge bg-panel-soft p-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[14px] font-semibold">{clockAt(slot.iso, center.timezone)}</span>
                <span
                  className={`rounded-[8px] px-[8px] py-[4px] text-[10px] font-bold tracking-[0.06em] ${
                    slot.full ? "bg-mint/15 text-mint" : "bg-gold/15 text-gold"
                  }`}
                >
                  {slot.full ? "FULL" : "OPEN"}
                </span>
              </div>
              <div className="mt-[10px] flex gap-[4px]">
                {Array.from({ length: slotCapacity }, (_, i) => (
                  <span
                    key={i}
                    className={`h-[16px] flex-1 rounded-[5px] ${
                      i < slot.count ? (slot.full ? "bg-mint" : "bg-gold") : "bg-[#262019]"
                    }`}
                  />
                ))}
              </div>
            </div>
          ))}
          {slots.length === 0 && (
            <p className="font-mono text-[11px] text-fg-faint">No scheduled candidates yet.</p>
          )}
        </div>
      </Drawer>
    </div>
  );
}
