"use client";

import { useMemo, useState } from "react";
import { CPR_FORMATS, entryText, minutesLate, writeEntry, type CprFormat, type Values } from "@/lib/cpr";
import { useConsole } from "@/lib/console-data";
import { clockAt, fullName, instantFromZonedTime, nowInZone, refOf } from "@/lib/format";
import type { Candidate } from "@/lib/types";

/**
 * Write a problem-report entry in the centre's own words.
 *
 * Pick the kind of thing that happened and, where it is about one person,
 * the candidate. Everything the day already knows goes in by itself — when
 * they were due, when they walked in, how late that was, the name on the
 * roster — and the rest is a field to check. The entry reads exactly as it
 * will be filed; "Add to report" writes it into today's report as a closed,
 * reportable incident, so it sits in the timeline with everything else, and
 * "Copy" puts it on the clipboard for the vendor's form.
 */
export function CprComposer({ canAdd }: { canAdd: boolean }) {
  const { center, candidates, rpcRead, rpc, notify } = useConsole();
  const tz = center.timezone;
  const [formatKey, setFormatKey] = useState(CPR_FORMATS[0].key);
  const [candidateId, setCandidateId] = useState("");
  const [values, setValues] = useState<Values>({});
  const [busy, setBusy] = useState(false);

  const format = CPR_FORMATS.find((f) => f.key === formatKey)!;
  const candidate = candidates.find((c) => c.id === candidateId);

  // Today's late arrivals, the entry most often written.
  const late = useMemo(
    () =>
      candidates
        .map((c) => ({ c, m: minutesLate(c.scheduled_at, c.arrival_at ?? c.check_in_at) }))
        .filter((x): x is { c: Candidate; m: number } => x.m !== null)
        .sort((a, b) => b.m - a.m),
    [candidates],
  );

  function prefill(f: CprFormat, c: Candidate | undefined): Values {
    const arrived = c?.arrival_at ?? c?.check_in_at ?? null;
    const known: Values = {
      scheduled: c?.scheduled_at ? clockAt(c.scheduled_at, tz) : "",
      arrived: arrived ? clockAt(arrived, tz) : "",
      late: String(minutesLate(c?.scheduled_at ?? null, arrived) ?? ""),
      at: arrived && ["name_mismatch", "missing_id"].includes(f.key) ? clockAt(arrived, tz) : nowInZone(tz),
      roster_name: c ? fullName(c) : "",
    };
    return Object.fromEntries(f.fields.map((field) => [field.key, known[field.key] ?? ""]));
  }

  function choose(nextFormat: string, nextCandidate: string) {
    const f = CPR_FORMATS.find((x) => x.key === nextFormat)!;
    const c = candidates.find((x) => x.id === nextCandidate);
    setFormatKey(nextFormat);
    setCandidateId(f.candidate ? nextCandidate : "");
    setValues(prefill(f, f.candidate ? c : undefined));
  }

  const entry = writeEntry(format, values);

  async function add() {
    // The moment it happened: the first clock time on the form, else now.
    const firstTime = format.fields.find((f) => f.kind === "time" && /^\d{1,2}:\d{2}$/.test(values[f.key] ?? ""));
    const startedAt = firstTime ? instantFromZonedTime(values[firstTime.key], tz).toISOString() : null;
    setBusy(true);
    const logged = (await rpcRead("fets_log_incident", {
      p_center: center.id,
      p_kind: format.incident,
      p_summary: candidate ? `${format.title} · ${refOf(candidate)}` : format.title,
      p_severity: format.severity,
      p_detail: entry.additional,
      p_candidate: candidate?.id ?? null,
      p_started_at: startedAt,
      p_reportable: true,
    })) as { id: string } | undefined;
    const ok = logged?.id ? await rpc("fets_resolve_incident", { p_incident: logged.id, p_resolution: entry.resolution }) : false;
    setBusy(false);
    if (ok) notify(`${format.title} added to today's report`);
  }

  return (
    <section className="rounded-[18px] border border-edge-mid panel-bg p-[14px]">
      <h2 className="text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">Write an entry from a format</h2>

      <div className="mt-[10px] flex flex-wrap gap-[6px]">
        {CPR_FORMATS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={f.key === formatKey}
            onClick={() => choose(f.key, candidateId)}
            className={`cursor-pointer rounded-[11px] border px-[11px] py-[7px] text-[12.5px] font-semibold ${
              f.key === formatKey ? "border-accent/60 bg-accent/12 text-fg" : "border-edge bg-panel-soft text-fg-muted hover:border-edge-warm"
            }`}
          >
            {f.title}
          </button>
        ))}
      </div>

      {late.length > 0 && (
        <div className="mt-[10px] flex flex-wrap items-center gap-[6px]">
          <span className="font-mono text-[10.5px] text-fg-faint">Late today:</span>
          {late.slice(0, 8).map(({ c, m }) => (
            <button
              key={c.id}
              type="button"
              onClick={() => choose("late_able", c.id)}
              className="cursor-pointer rounded-[9px] border border-gold/35 bg-gold/8 px-[9px] py-[4px] font-mono text-[11px] text-gold-bright hover:border-gold/60"
            >
              {refOf(c)} · {m} min
            </button>
          ))}
        </div>
      )}

      <div className="mt-[12px] grid gap-[10px] sm:grid-cols-2">
        {format.candidate && (
          <label className="flex flex-col gap-[5px] sm:col-span-2">
            <span className="text-[11.5px] font-semibold text-fg-muted">Candidate</span>
            <select
              value={candidateId}
              onChange={(e) => choose(formatKey, e.target.value)}
              className="rounded-[11px] border border-edge-strong bg-panel-soft px-[11px] py-[9px] text-[13px] outline-none focus:border-accent/50"
            >
              <option value="">Not about one candidate</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {refOf(c)} · {fullName(c)}
                </option>
              ))}
            </select>
          </label>
        )}
        {format.fields.map((f) => (
          <label key={f.key} className={`flex flex-col gap-[5px] ${f.kind === "text" ? "sm:col-span-2" : ""}`}>
            <span className="text-[11.5px] font-semibold text-fg-muted">{f.label}</span>
            <input
              type={f.kind === "time" ? "time" : f.kind === "number" ? "number" : "text"}
              min={f.kind === "number" ? 0 : undefined}
              value={values[f.key] ?? ""}
              placeholder={f.kind === "text" ? f.fallback : undefined}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="rounded-[11px] border border-edge-strong bg-panel-soft px-[11px] py-[9px] text-[13px] outline-none focus:border-accent/50"
            />
          </label>
        ))}
      </div>

      <div className="mt-[12px] rounded-[14px] border border-edge-soft bg-panel-deep px-[14px] py-[12px] text-[13px] leading-[1.55]">
        <p className="font-mono text-[10.5px] tracking-[0.12em] text-accent uppercase">{format.title}</p>
        <p className="mt-[8px]">
          <span className="font-semibold">Additional Information : </span>
          {entry.additional}
        </p>
        <p className="mt-[8px]">
          <span className="font-semibold">Resolution : </span>
          {entry.resolution}
        </p>
      </div>

      <div className="mt-[12px] flex flex-wrap justify-end gap-[8px]">
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard.writeText(entryText(format, values)).then(
              () => notify("Entry copied"),
              () => notify("Could not copy", "error"),
            )
          }
          className="cursor-pointer rounded-[12px] border border-edge px-[14px] py-[9px] text-[12.5px] font-semibold text-fg-muted hover:border-edge-warm"
        >
          Copy
        </button>
        {canAdd && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void add()}
            className="cursor-pointer rounded-[12px] gold-bg px-[16px] py-[9px] text-[12.5px] font-bold text-[#141418] disabled:opacity-50"
          >
            Add to report
          </button>
        )}
      </div>
    </section>
  );
}
