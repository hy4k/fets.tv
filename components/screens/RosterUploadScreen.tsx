"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { useConsole } from "@/lib/console-data";
import { basePath } from "@/lib/base-path";
import { clockAt, todayInZone } from "@/lib/format";
import type { RosterDiagnostics, RosterPreview } from "@/lib/types";

/**
 * Step one of the day, and nothing else. The page does one thing: take the
 * file, show what is in it, and commit it. Once that is done it moves on to
 * the candidate list rather than leaving staff to find it.
 */
export function RosterUploadScreen() {
  const { center, session, candidates, rpc, isAdmin, notify, refresh } = useConsole();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState(() => todayInZone(center.timezone));
  const [byHand, setByHand] = useState(false);
  const [handName, setHandName] = useState("");

  async function onFile(file: File) {
    setBusy(true);
    setPreview(null);

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${basePath}/api/roster/parse`, { method: "POST", body });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        notify(payload?.error ?? `Upload failed (${response.status})`, "error");
        return;
      }
      if (!payload) {
        notify("The server sent back something unreadable", "error");
        return;
      }

      setPreview(payload as RosterPreview);
      setExamName(file.name.replace(/\.(csv|xlsx|xls)$/i, "").replace(/[_-]+/g, " "));
    } catch {
      notify("Could not reach the server — check the connection and try again", "error");
    } finally {
      setBusy(false);
    }
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

    if (ok) {
      notify(`${preview.rows.length} candidates imported`);
      setPreview(null);
      await refresh();
      router.push("/candidates");
    }
    setBusy(false);
  }

  /** Opens an empty list for the day, for a centre with no file to upload. */
  async function startByHand() {
    if (!handName.trim()) return;
    setBusy(true);
    const ok = await rpc(
      "fets_start_blank_session",
      { p_center: center.id, p_exam_name: handName.trim(), p_exam_date: examDate },
      "Empty list started — add candidates one by one",
    );
    setBusy(false);
    if (ok) {
      setByHand(false);
      router.push("/candidates");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-x-hidden overflow-y-auto">
      {session && !preview && (
        <div className="flex shrink-0 flex-wrap items-center gap-[14px] rounded-[18px] border border-edge-mid bg-panel-soft px-[18px] py-[15px]">
          <span className="flex h-[36px] w-[36px] items-center justify-center rounded-[11px] bg-mint/15 text-[16px] text-mint">
            ✓
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">
              {session.exam_name} — {candidates.length} candidates
            </span>
            <span className="block text-[12px] text-fg-faint">
              Imported {clockAt(session.created_at, center.timezone)}. Uploading again replaces it.
            </span>
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => router.push("/candidates")}
            className="cursor-pointer rounded-[12px] border border-edge-warm px-[16px] py-[11px] text-[13px] font-semibold"
          >
            See the list
          </button>
        </div>
      )}

      {!preview && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void onFile(file);
          }}
          className={`flex min-h-[280px] flex-1 flex-col items-center justify-center gap-[16px] rounded-[24px] border-2 border-dashed p-[40px] text-center transition-colors ${
            dragging ? "border-gold bg-gold/8" : "border-[#3a322b] bg-panel-soft"
          }`}
        >
          <span className="font-serif text-[30px] leading-[1.15]">
            {session ? "Upload a new roster" : "Start by uploading today's roster"}
          </span>
          <span className="max-w-[46ch] text-[14px] leading-[1.5] text-fg-muted">
            Drop the file here, or choose it below. The Prometric site roster and candidate contact
            report both work as they come — .xls, .xlsx or .csv.
          </span>

          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,.xls"
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
            className="cursor-pointer rounded-[14px] gold-bg px-[26px] py-[14px] text-[14px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Reading the file…" : "Choose a file"}
          </button>

          {!isAdmin && <span className="text-[12.5px] text-gold">Only an admin can import a roster.</span>}

          <span className="flex items-center gap-[12px] pt-[6px] text-[12px] text-fg-faint">
            <span className="h-px w-[40px] bg-edge-soft" />
            or
            <span className="h-px w-[40px] bg-edge-soft" />
          </span>

          <button
            type="button"
            disabled={!isAdmin || busy}
            onClick={() => {
              setHandName(`Entered by hand — ${examDate}`);
              setByHand(true);
            }}
            className="cursor-pointer rounded-[14px] border border-edge-warm px-[22px] py-[13px] text-[13.5px] font-semibold text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
            Enter candidates by hand
          </button>
        </div>
      )}

      <Dialog
        open={byHand}
        title="Enter candidates by hand"
        subtitle="Starts an empty list for the day. You add people one at a time."
        onClose={() => setByHand(false)}
        footer={
          <>
            <button
              type="button"
              disabled={busy || !handName.trim()}
              onClick={startByHand}
              className="flex-1 cursor-pointer rounded-[14px] gold-bg px-[22px] py-[14px] text-[14px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Starting…" : "Start an empty list"}
            </button>
            <button
              type="button"
              onClick={() => setByHand(false)}
              className="cursor-pointer rounded-[14px] border border-edge px-[20px] py-[14px] text-[14px] font-semibold text-fg-muted"
            >
              Cancel
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[16px]">
          <label className="flex flex-col gap-[8px]">
            <span className="text-[11.5px] font-semibold text-fg-dim">Exam name</span>
            <input
              value={handName}
              onChange={(e) => setHandName(e.target.value)}
              className="w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] text-[16px] outline-none focus:border-gold/50"
            />
          </label>
          <label className="flex flex-col gap-[8px]">
            <span className="text-[11.5px] font-semibold text-fg-dim">Exam date</span>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] font-mono text-[16px] outline-none focus:border-gold/50"
            />
          </label>
          {session && (
            <p className="rounded-[14px] border border-gold/35 bg-gold/8 p-[13px] text-[12.5px] leading-[1.5] text-gold-bright">
              This closes the current list ({session.exam_name}, {candidates.length} candidates) and
              starts again from empty.
            </p>
          )}
        </div>
      </Dialog>

      {preview && (
        <div className="flex shrink-0 flex-col gap-[16px] rounded-[24px] border border-edge-mid panel-bg p-[20px]">
          <div className="flex flex-wrap items-baseline gap-[10px]">
            <span className="font-serif text-[24px]">Check this before importing</span>
            <span className="font-mono text-[12px] text-fg-faint">
              {preview.filename}
              {preview.sheet_used ? ` · sheet "${preview.sheet_used}"` : ""}
              {preview.header_row > 0 ? ` · headings on row ${preview.header_row}` : ""}
            </span>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-[12px]">
            {[
              { label: "Ready to import", value: preview.counts.valid, className: "text-mint" },
              { label: "Warnings", value: preview.counts.warnings, className: "text-gold" },
              { label: "Errors", value: preview.counts.errors, className: "text-rust" },
              { label: "No show", value: preview.counts.no_show, className: "text-fg-muted" },
              { label: "Rows skipped", value: preview.counts.skipped, className: "text-fg-muted" },
            ].map((tile) => (
              <div key={tile.label} className="rounded-[16px] border border-edge bg-panel-soft p-[14px]">
                <div className={`font-serif text-[34px] leading-none ${tile.className}`}>{tile.value}</div>
                <div className="mt-[7px] text-[11px] font-semibold text-fg-dim">{tile.label}</div>
              </div>
            ))}
          </div>

          {preview.diagnostics && <Diagnostics d={preview.diagnostics} />}

          {preview.issues.length > 0 && (
            <div className="flex max-h-[170px] flex-col gap-[7px] overflow-y-auto rounded-[16px] border border-edge bg-panel p-[14px]">
              {preview.issues.map((issue, i) => (
                <p key={i} className="text-[12.5px]">
                  <span className={issue.level === "error" ? "text-rust" : "text-gold"}>
                    Row {issue.source_row}
                  </span>{" "}
                  <span className="text-fg-muted">{issue.message}</span>
                </p>
              ))}
            </div>
          )}

          {preview.rows.length > 0 && (
            <div className="flex flex-wrap items-end gap-[12px]">
              <label className="flex min-w-[220px] flex-1 flex-col gap-[7px]">
                <span className="text-[11px] font-semibold text-fg-dim">Exam name</span>
                <input
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  className="rounded-[12px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] text-[14px] outline-none focus:border-gold/50"
                />
              </label>
              <label className="flex flex-col gap-[7px]">
                <span className="text-[11px] font-semibold text-fg-dim">Exam date</span>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="rounded-[12px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] font-mono text-[14px] outline-none focus:border-gold/50"
                />
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-[10px]">
            <button
              type="button"
              disabled={busy || preview.rows.length === 0}
              onClick={commit}
              className="cursor-pointer rounded-[14px] bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] px-[22px] py-[14px] text-[14px] font-bold text-[#0c1711] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Import {preview.rows.length} candidates
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="cursor-pointer rounded-[14px] border border-edge px-[18px] py-[14px] text-[14px] font-semibold text-fg-muted"
            >
              Choose a different file
            </button>
          </div>

          <p className="text-[12px] text-fg-faint">
            Importing closes the current roster and gives everyone a fresh FETS token, in roster order.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * When the importer cannot find a header, this says what it actually saw so the
 * spreadsheet can be fixed on the spot. Rosters carry names and phone numbers,
 * so it reports structure only — the row's own text appears just when a column
 * name was recognised, which is what makes it a header rather than a candidate.
 */
function Diagnostics({ d }: { d: RosterDiagnostics }) {
  return (
    <div className="flex flex-col gap-[12px] rounded-[18px] border border-rust/35 bg-rust/5 p-[16px]">
      <span className="text-[13px] font-bold text-rust">The importer could not read this file</span>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-[10px] text-[12.5px]">
        <span className="text-fg-muted">
          Sheets: <span className="text-fg">{d.sheets.length > 0 ? d.sheets.join(", ") : "—"}</span>
        </span>
        <span className="text-fg-muted">
          It read: <span className="text-fg">{d.sheet_used ?? "—"}</span>
        </span>
        <span className="text-fg-muted">
          Size: <span className="text-fg">{d.rows_found} rows, {d.columns_found} columns</span>
        </span>
      </div>

      {d.header_cells && (
        <p className="text-[12.5px] text-fg-muted">
          Headings found on row {d.best_row}:{" "}
          <span className="font-mono text-fg">{d.header_cells.join("  |  ")}</span>
        </p>
      )}

      <div className="flex flex-col gap-[5px] rounded-[14px] bg-panel p-[13px]">
        <span className="pb-[3px] text-[12px] font-semibold text-fg">
          Rename two of your columns to any of these, then upload again
        </span>
        {Object.entries(d.understood).map(([field, aliases]) => (
          <p key={field} className="text-[11.5px]">
            <span className="font-semibold text-gold">{field.replace(/_/g, " ")}</span>{" "}
            <span className="text-fg-faint">{aliases.slice(0, 7).join(", ")}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
