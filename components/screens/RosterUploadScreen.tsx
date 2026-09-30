"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { useConsole } from "@/lib/console-data";
import { basePath } from "@/lib/base-path";
import { PROVIDERS, REMEMBER_PROVIDER, liveProviderOf, type Provider } from "@/lib/fets-live";
import { clockAt, todayInZone } from "@/lib/format";
import type { RosterDiagnostics, RosterPreview } from "@/lib/types";

/**
 * Step two of the day: who is coming.
 *
 * The roster now lives in fets.live, so the first way in is one press that
 * brings today's list across; after that the console keeps checking for late
 * bookings on its own. Uploading a file stays underneath for now, until the
 * fets.live path has carried a few real days.
 */
export function RosterUploadScreen() {
  const { center, session, candidates, programmes, rpc, isAdmin, notify, refresh } = useConsole();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState(() => todayInZone(center.timezone));
  const [byHand, setByHand] = useState(false);
  const [handName, setHandName] = useState("");
  // Which exam the day runs. It decides every candidate's clock, and it is the
  // one thing on this page the file cannot tell us, so it is asked first.
  const [programmeId, setProgrammeId] = useState("");

  const programme = programmes.find((p) => p.id === programmeId) ?? null;

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
      p_programme: programmeId || null,
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
      {
        p_center: center.id,
        p_exam_name: handName.trim(),
        p_exam_date: examDate,
        p_programme: programmeId || null,
      },
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
              {liveProviderOf(session.source_filename)
                ? `From fets.live at ${clockAt(session.created_at, center.timezone)} · checked again every 5 minutes. Uploading a file replaces it.`
                : `Imported ${clockAt(session.created_at, center.timezone)}. Uploading again replaces it.`}
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
        <section className="flex shrink-0 flex-col gap-[12px] rounded-[20px] border border-edge-mid panel-bg p-[18px]">
          <div className="flex items-center gap-[11px]">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] bg-panel-soft font-mono text-[13px] font-semibold text-fg-dim">
              1
            </span>
            <span className="text-[16px] font-semibold">Which exam is today?</span>
          </div>
          <p className="max-w-[62ch] text-[12.5px] leading-[1.5] text-fg-faint">
            This sets how long every candidate&rsquo;s clock runs once they are seated. Lengths come
            from Setup, and any one candidate can still be corrected on the Live Floor.
          </p>

          {programmes.length === 0 ? (
            <p className="rounded-[14px] border border-gold/35 bg-gold/8 p-[13px] text-[12.5px] text-gold">
              No exams are set up for this centre yet. Add them under Setup, or carry on and every
              clock will use the centre&rsquo;s default length.
            </p>
          ) : (
            <div className="flex flex-wrap gap-[9px]">
              {programmes.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProgrammeId(p.id === programmeId ? "" : p.id)}
                  className={`cursor-pointer rounded-[14px] border px-[16px] py-[12px] text-left transition-colors ${
                    p.id === programmeId
                      ? "border-gold/60 bg-gold/12"
                      : "border-edge bg-panel-soft hover:border-edge-warm"
                  }`}
                >
                  <span className="block text-[13.5px] font-semibold">{p.code}</span>
                  <span className="block font-mono text-[11px] text-fg-faint">
                    {p.default_duration_minutes} min
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {!preview && (
        <FromFetsLive
          disabled={!isAdmin || busy || (programmes.length > 0 && !programme)}
          needsExam={programmes.length > 0 && !programme}
          programmeId={programmeId}
          onDone={async () => {
            await refresh();
            router.push("/candidates");
          }}
        />
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
          className={`flex min-h-[240px] shrink-0 flex-col items-center justify-center gap-[16px] rounded-[24px] border-2 border-dashed p-[32px] text-center transition-colors ${
            dragging ? "border-gold bg-gold/8" : "border-[#3d3d4a] bg-panel-soft"
          }`}
        >
          <span className="font-serif text-[24px] leading-[1.15]">
            {session ? "Or upload a new roster file" : "Or upload a roster file"}
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
            disabled={!isAdmin || busy || (programmes.length > 0 && !programme)}
            onClick={() => fileInput.current?.click()}
            className="cursor-pointer rounded-[14px] gold-bg px-[26px] py-[14px] text-[14px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Reading the file…" : "Choose a file"}
          </button>

          {programmes.length > 0 && !programme && (
            <span className="text-[12.5px] text-gold">Choose the exam above first.</span>
          )}

          {!isAdmin && <span className="text-[12.5px] text-gold">Only staff can import a roster.</span>}

          <span className="flex items-center gap-[12px] pt-[6px] text-[12px] text-fg-faint">
            <span className="h-px w-[40px] bg-edge-soft" />
            or
            <span className="h-px w-[40px] bg-edge-soft" />
          </span>

          <button
            type="button"
            disabled={!isAdmin || busy || (programmes.length > 0 && !programme)}
            onClick={() => {
              setHandName(`${programme?.code ?? "Entered by hand"} — ${examDate}`);
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
              className="w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] text-[16px] outline-none focus:border-accent/50"
            />
          </label>
          <label className="flex flex-col gap-[8px]">
            <span className="text-[11.5px] font-semibold text-fg-dim">Exam date</span>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] font-mono text-[16px] outline-none focus:border-accent/50"
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
            {programme && (
              <span className="rounded-[10px] border border-gold/45 bg-gold/10 px-[11px] py-[6px] text-[12px] font-semibold text-gold-bright">
                {programme.code} · {programme.default_duration_minutes} min
              </span>
            )}
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
                  className="rounded-[12px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] text-[14px] outline-none focus:border-accent/50"
                />
              </label>
              <label className="flex flex-col gap-[7px]">
                <span className="text-[11px] font-semibold text-fg-dim">Exam date</span>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="rounded-[12px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] font-mono text-[14px] outline-none focus:border-accent/50"
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

type SyncResult = { inserted: number; updated: number; unchanged: number; found: number; left_out: number };

/**
 * One press: today's roster for the chosen provider, straight from fets.live.
 *
 * Safe to press again at any time. It adds bookings not yet on the list and
 * refreshes the ones who have not arrived; nobody's progress is touched and
 * nobody is removed.
 */
function FromFetsLive({
  disabled,
  needsExam,
  programmeId,
  onDone,
}: {
  disabled: boolean;
  needsExam: boolean;
  programmeId: string;
  onDone: () => Promise<void>;
}) {
  const { session, notify } = useConsole();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    // The day's provider if it came from fets.live, else the one picked on Exams today.
    const fromDay = liveProviderOf(session?.source_filename);
    if (fromDay) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProvider(fromDay);
      return;
    }
    try {
      const saved = localStorage.getItem(REMEMBER_PROVIDER);
      if (saved && (PROVIDERS as readonly string[]).includes(saved)) setProvider(saved as Provider);
    } catch {}
  }, [session?.source_filename]);

  function choose(p: Provider) {
    setProvider(p);
    setResult(null);
    try {
      localStorage.setItem(REMEMBER_PROVIDER, p);
    } catch {}
  }

  async function bringIn() {
    if (!provider) return;
    setBusy(true);
    try {
      const res = await fetch(`${basePath}/api/fets-live/roster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, programme: programmeId || null }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        notify(body?.error ?? `fets.live could not be read (${res.status})`, "error");
        return;
      }
      const r = body as SyncResult;
      setResult(r);
      if (r.found === 0) {
        notify(
          r.left_out > 0
            ? `fets.live has ${r.left_out} ${provider} booking${r.left_out === 1 ? "" : "s"} today, none with a roster number`
            : `fets.live has nobody booked for ${provider} today`,
          "error",
        );
        return;
      }
      notify(
        r.inserted > 0
          ? `${r.inserted} candidate${r.inserted === 1 ? "" : "s"} brought in from fets.live`
          : "Already up to date with fets.live",
      );
      if (r.inserted > 0) await onDone();
    } catch {
      notify("Could not reach the server — check the connection and try again", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex shrink-0 flex-col gap-[14px] rounded-[20px] border border-accent/35 panel-bg p-[18px]">
      <div className="flex items-center gap-[11px]">
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] bg-panel-soft font-mono text-[13px] font-semibold text-fg-dim">
          2
        </span>
        <span className="text-[16px] font-semibold">Bring in today&rsquo;s roster from fets.live</span>
      </div>
      <p className="max-w-[64ch] text-[12.5px] leading-[1.5] text-fg-faint">
        One press brings across everyone booked today for the provider. After that the console
        checks fets.live every 5 minutes and adds late bookings on its own. Pressing again never
        removes anybody or undoes a check-in.
      </p>

      <div className="flex flex-wrap gap-[8px]">
        {PROVIDERS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => choose(p)}
            aria-pressed={p === provider}
            className={`cursor-pointer rounded-[12px] border px-[14px] py-[10px] text-[13px] font-semibold transition-colors ${
              p === provider ? "border-accent/60 bg-accent/12 text-fg" : "border-edge bg-panel-soft text-fg-muted hover:text-fg"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-[12px]">
        <button
          type="button"
          disabled={disabled || busy || !provider}
          onClick={bringIn}
          className="cursor-pointer rounded-[14px] gold-bg px-[24px] py-[14px] text-[14px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Reading fets.live…" : provider ? `Bring in ${provider} for today` : "Choose a provider"}
        </button>
        {needsExam && <span className="text-[12.5px] text-gold">Choose the exam above first.</span>}
        {result && result.found > 0 && (
          <span className="text-[12.5px] text-fg-muted">
            {result.found} in fets.live · {result.inserted} added · {result.updated} updated
            {result.left_out > 0 ? ` · ${result.left_out} left out (no roster number or cancelled)` : ""}
          </span>
        )}
      </div>
    </section>
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
