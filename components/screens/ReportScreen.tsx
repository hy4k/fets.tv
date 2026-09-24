"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConsole } from "@/lib/console-data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clockAt } from "@/lib/format";
import type { ExamSession, ProblemReport, ReportEntry } from "@/lib/types";

const TONE: Record<string, string> = {
  critical: "border-rust bg-rust/12 text-rust",
  major: "border-gold/55 bg-gold/10 text-gold-bright",
  minor: "border-edge bg-panel-soft text-fg-muted",
};

/**
 * The Center Problem Report, already written.
 *
 * Everything on the left of this page was read out of the day: the incidents,
 * the machine somebody was moved off, the sheet that never came back, the part
 * that started late. Nobody types a timeline, so it cannot disagree with the
 * audit trail. What is typed is the part only a person has — what it meant,
 * what was done about it, and who it went to.
 *
 * Signing off freezes it. A report that keeps moving after it has been sent is
 * not a report, so from then on the page serves the copy that was sent.
 */
export function ReportScreen() {
  const { center, session, notify, isAdmin, profile, incidents, candidates, candidateSections } =
    useConsole();

  // The rail hides the link from a viewer; this is the same rule for anybody
  // who reaches the page by its address, and it matches what the function
  // behind it will now allow.
  const allowed = profile.role !== "viewer";

  const [days, setDays] = useState<ExamSession[]>([]);
  const [dayId, setDayId] = useState<string | null>(session?.id ?? null);
  const [report, setReport] = useState<ProblemReport | null>(null);
  // Which day the panel is actually showing. Loading is derived from the gap
  // between that and the day chosen, so nothing has to be set from an effect.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [summary, setSummary] = useState("");
  const [actions, setActions] = useState("");
  const [reportedTo, setReportedTo] = useState("");

  // Today first, then the days that are over. A report is usually written on
  // the day it is about, but the one you have been asked for is often older.
  useEffect(() => {
    let live = true;
    void supabaseBrowser()
      .from("exam_sessions")
      .select("*")
      .eq("center_id", center.id)
      .order("exam_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => {
        if (!live) return;
        setDays(data ?? []);
        setDayId((current) => current ?? data?.[0]?.id ?? null);
      });
    return () => {
      live = false;
    };
  }, [center.id]);

  // Answers can come back out of order, and the slow one must not win: only the
  // reply to the most recent question is allowed to land.
  const asked = useRef(0);

  const load = useCallback(
    (id: string, keepNarrative = false) => {
      const ticket = ++asked.current;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (supabaseBrowser().rpc as any)("fets_problem_report", { p_session: id }).then(
        ({ data, error }: { data: ProblemReport | null; error: { message: string } | null }) => {
          if (ticket !== asked.current) return;
          setLoadedId(id);
          if (error) {
            setReport(null);
            notify(error.message, "error");
            return;
          }
          setReport(data);
          // A reload triggered by the day moving on must not wipe out what
          // somebody is halfway through typing.
          if (keepNarrative) return;
          setSummary(data?.narrative.summary ?? "");
          setActions(data?.narrative.actions_taken ?? "");
          setReportedTo(data?.narrative.reported_to ?? "");
        },
      );
    },
    [notify],
  );

  useEffect(() => {
    if (dayId && allowed) void load(dayId);
  }, [dayId, load, allowed]);

  // The draft of a day still running has to keep up with it. The console already
  // hears about incidents, candidates and sections; this follows that rather
  // than polling, and leaves the typed part alone.
  const pulse = `${incidents.length}:${candidates.length}:${candidateSections.length}`;
  useEffect(() => {
    if (dayId && allowed && dayId === session?.id) void load(dayId, true);
  }, [pulse, dayId, allowed, session?.id, load]);

  async function call(fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseBrowser().rpc as any)(fn, args);
    setBusy(false);
    if (error) {
      notify(error.message, "error");
      return false;
    }
    notify(ok);
    if (dayId) await load(dayId);
    return true;
  }

  const loading = dayId !== null && loadedId !== dayId;
  const frozen = report?.narrative.status === "final";
  const tz = report?.center.timezone ?? center.timezone;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[12px]">
      <div className="flex shrink-0 flex-wrap items-center gap-[10px]">
        <span className="text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">
          Problem report
        </span>
        <select
          value={dayId ?? ""}
          onChange={(e) => setDayId(e.target.value || null)}
          className="min-w-0 max-w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[11px] py-[9px] text-[12.5px] outline-none focus:border-gold/50"
        >
          {days.map((d) => (
            <option key={d.id} value={d.id}>
              {d.exam_date} · {d.exam_name}
              {d.status === "closed" ? "" : " (open)"}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        {frozen && (
          <span className="rounded-[9px] bg-mint/15 px-[10px] py-[6px] text-[10.5px] font-bold tracking-[0.06em] text-mint uppercase">
            Signed off {clockAt(report?.narrative.finalised_at ?? null, tz)}
          </span>
        )}
        {report && !loading && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                .writeText(asPlainText(report, tz))
                .then(() => notify("Report copied"))
                .catch(() => notify("Could not reach the clipboard", "error"));
            }}
            className="cursor-pointer rounded-[12px] border border-edge-warm px-[13px] py-[9px] text-[12.5px] font-semibold hover:bg-panel"
          >
            Copy as text
          </button>
        )}
      </div>

      {!allowed && (
        <p className="rounded-[16px] border border-edge bg-panel-soft p-[16px] text-[13px] text-fg-muted">
          The problem report is written by admins and TCAs. Ask one of them if you need a copy.
        </p>
      )}

      {allowed && loading && (
        <p className="rounded-[16px] border border-edge bg-panel-soft p-[16px] text-[13px] text-fg-faint">
          Reading the day…
        </p>
      )}

      {allowed && !loading && !report && (
        <p className="rounded-[16px] border border-edge bg-panel-soft p-[16px] text-[13px] text-fg-faint">
          There is no day to report on yet.
        </p>
      )}

      {report && !loading && (
        <ReportBody
          report={report}
          timezone={tz}
          frozen={!!frozen}
          busy={busy}
          isAdmin={isAdmin}
          summary={summary}
          actions={actions}
          reportedTo={reportedTo}
          onSummary={setSummary}
          onActions={setActions}
          onReportedTo={setReportedTo}
          onSave={() =>
            call(
              "fets_save_problem_report",
              {
                p_session: report.session.id,
                p_summary: summary,
                p_actions: actions,
                p_reported_to: reportedTo,
              },
              "Saved",
            )
          }
          onFinalise={async () => {
            const saved = await call(
              "fets_save_problem_report",
              {
                p_session: report.session.id,
                p_summary: summary,
                p_actions: actions,
                p_reported_to: reportedTo,
              },
              "Saved",
            );
            if (saved) {
              await call(
                "fets_finalise_problem_report",
                { p_session: report.session.id },
                "Signed off",
              );
            }
          }}
          onReopen={() =>
            call("fets_reopen_problem_report", { p_session: report.session.id }, "Reopened")
          }
        />
      )}
    </div>
  );
}

/**
 * The report itself, with no idea where it came from.
 *
 * Kept apart from the fetching above so the layout can be looked at with a
 * day's worth of trouble in it without a database behind it.
 */
export function ReportBody({
  report,
  timezone,
  frozen,
  busy,
  isAdmin,
  summary,
  actions,
  reportedTo,
  onSummary,
  onActions,
  onReportedTo,
  onSave,
  onFinalise,
  onReopen,
}: {
  report: ProblemReport;
  timezone: string;
  frozen: boolean;
  busy: boolean;
  isAdmin: boolean;
  summary: string;
  actions: string;
  reportedTo: string;
  onSummary: (v: string) => void;
  onActions: (v: string) => void;
  onReportedTo: (v: string) => void;
  onSave: () => void;
  onFinalise: () => void;
  onReopen: () => void;
}) {
  return (
        <div className="grid min-h-0 flex-1 gap-[12px] overflow-y-auto lg:grid-cols-[1fr_360px] lg:overflow-hidden">
          {/* What happened, read out of the day. */}
          <div className="flex min-h-0 flex-col gap-[12px] lg:overflow-y-auto">
            <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-[8px]">
              <Stat label="Rostered" value={report.counts.rostered} />
              <Stat label="Sat" value={report.counts.sat} />
              <Stat label="Finished" value={report.counts.finished} />
              <Stat label="Signed out" value={report.counts.signed_out} />
              <Stat label="No shows" value={report.counts.no_shows} tone={report.counts.no_shows > 0} />
            </div>

            <section className="rounded-[18px] border border-edge-mid panel-bg p-[14px]">
              <h2 className="mb-[10px] text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">
                What happened · {report.timeline.length}
              </h2>

              {report.timeline.length === 0 ? (
                <p className="text-[13px] text-mint">
                  Nothing went wrong on this day. Nothing to report.
                </p>
              ) : (
                <ol className="flex flex-col gap-[8px]">
                  {report.timeline.map((e, i) => (
                    <Entry key={`${e.at}-${i}`} entry={e} timezone={timezone} />
                  ))}
                </ol>
              )}
            </section>

            {report.walks && report.walks.walks > 0 && (
              <section className="rounded-[18px] border border-edge-mid panel-bg p-[14px]">
                <h2 className="mb-[10px] text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">
                  Floor walks
                </h2>
                <div
                  className={`flex flex-wrap items-baseline gap-x-[14px] gap-y-[5px] rounded-[13px] border px-[12px] py-[10px] ${
                    report.walks.gaps_over_interval > 0
                      ? "border-gold/40 bg-gold/8"
                      : "border-mint/30 bg-mint/6"
                  }`}
                >
                  <span className="font-mono text-[15px] font-semibold">{report.walks.walks}</span>
                  <span className="text-[12.5px] text-fg-muted">
                    walks, meant to be every {report.walks.interval_minutes} minutes
                  </span>
                  <span className="flex-1" />
                  <span className="font-mono text-[12.5px]">
                    longest gap {report.walks.longest_gap_minutes} min
                  </span>
                  {report.walks.gaps_over_interval > 0 && (
                    <span className="font-mono text-[12.5px] font-semibold text-gold-bright">
                      {report.walks.gaps_over_interval} over
                    </span>
                  )}
                </div>
              </section>
            )}

            {report.delays.length > 0 && (
              <section className="rounded-[18px] border border-edge-mid panel-bg p-[14px]">
                <h2 className="mb-[10px] text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">
                  Parts that ran late
                </h2>
                <div className="flex flex-col gap-[7px]">
                  {report.delays.map((d) => (
                    <div
                      key={d.name}
                      className="flex flex-col gap-[2px] rounded-[13px] border border-gold/35 bg-gold/8 px-[12px] py-[9px] sm:flex-row sm:items-center sm:gap-[10px]"
                    >
                      {/* The part's name keeps its own line on a phone: it is
                          the thing being reported, so it does not get truncated
                          to make room for its own numbers. */}
                      <span className="min-w-0 text-[13px] font-semibold sm:flex-1 sm:truncate">
                        {d.name}
                      </span>
                      <span className="flex flex-wrap items-baseline gap-x-[8px]">
                        <span className="font-mono text-[11.5px] text-fg-muted">
                          {d.candidates} candidate{d.candidates === 1 ? "" : "s"}
                        </span>
                        <span className="font-mono text-[12.5px] font-semibold text-gold-bright">
                          {d.median_minutes} min typical · {d.worst_minutes} worst
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* What a person has to say about it. */}
          <div className="flex min-h-0 flex-col gap-[10px] rounded-[18px] border border-edge-mid panel-bg p-[14px] lg:overflow-y-auto">
            <h2 className="text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">
              The centre&rsquo;s account
            </h2>

            <Field
              label="What happened"
              value={summary}
              onChange={onSummary}
              disabled={frozen}
              rows={6}
              placeholder="The UPS in Lab 1 dropped forty minutes into the morning session."
            />
            <Field
              label="What was done"
              value={actions}
              onChange={onActions}
              disabled={frozen}
              rows={5}
              placeholder="Candidates moved to Lab 2 and the lost time added to their clocks."
            />
            <Field
              label="Reported to"
              value={reportedTo}
              onChange={onReportedTo}
              disabled={frozen}
              rows={1}
              max={200}
              placeholder="Prometric, by email"
            />

            {!frozen && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onSave}
                  className="cursor-pointer rounded-[13px] border border-edge-warm px-[14px] py-[11px] text-[13px] font-semibold hover:bg-panel disabled:opacity-40"
                >
                  Save the draft
                </button>

                <button
                  type="button"
                  disabled={busy || summary.trim() === ""}
                  onClick={onFinalise}
                  className="cursor-pointer rounded-[13px] gold-bg px-[14px] py-[12px] text-[13.5px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Sign it off
                </button>
                <p className="font-mono text-[10.5px] text-fg-faint">
                  Signing off freezes the timeline as it stands. Every incident has to be closed
                  first.
                </p>
              </>
            )}

            {frozen && isAdmin && (
              <button
                type="button"
                disabled={busy}
                onClick={onReopen}
                className="cursor-pointer rounded-[13px] border border-edge px-[14px] py-[11px] text-[12.5px] font-semibold text-fg-faint hover:border-rust/50 hover:text-rust disabled:opacity-40"
              >
                Reopen it
              </button>
            )}

            {frozen && !isAdmin && (
              <p className="font-mono text-[10.5px] text-fg-faint">
                Signed off. An admin can reopen it.
              </p>
            )}
          </div>
        </div>
  );
}

function Stat({ label, value, tone = false }: { label: string; value: number; tone?: boolean }) {
  return (
    <div
      className={`rounded-[14px] border px-[11px] py-[9px] ${
        tone ? "border-gold/40 bg-gold/8" : "border-edge bg-panel-soft"
      }`}
    >
      <span className="block font-mono text-[19px] font-semibold">{value}</span>
      <span className="block text-[10.5px] text-fg-faint">{label}</span>
    </div>
  );
}

function Entry({ entry, timezone }: { entry: ReportEntry; timezone: string }) {
  return (
    <li className={`rounded-[14px] border px-[12px] py-[10px] ${TONE[entry.severity] ?? TONE.minor}`}>
      <div className="flex flex-wrap items-baseline gap-x-[10px] gap-y-[3px]">
        <span className="font-mono text-[12.5px] font-semibold">{clockAt(entry.at, timezone)}</span>
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-fg">{entry.title}</span>
        {entry.minutes_lost ? (
          <span className="font-mono text-[11.5px] whitespace-nowrap">
            {entry.minutes_lost} min lost
          </span>
        ) : null}
      </div>

      <div className="mt-[3px] flex flex-wrap gap-x-[8px] font-mono text-[10.5px] text-fg-faint">
        <span>{entry.category}</span>
        {entry.token && <span>· {entry.token}</span>}
        {entry.seat && <span>· {entry.seat}</span>}
        {entry.reportable && <span>· reportable</span>}
      </div>

      {entry.detail && <p className="mt-[6px] text-[12.5px] text-fg-muted">{entry.detail}</p>}

      {entry.resolution && (
        <p className="mt-[6px] text-[12.5px] text-fg-muted">
          <span className="text-fg-faint">Resolved {clockAt(entry.resolved_at, timezone)} — </span>
          {entry.resolution}
        </p>
      )}
    </li>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  rows,
  placeholder,
  max = 4000,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  rows: number;
  placeholder: string;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="mb-[6px] block text-[11px] font-semibold text-fg-faint">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        maxLength={max}
        placeholder={placeholder}
        className="w-full resize-none rounded-[13px] border border-edge-strong bg-panel-soft px-[12px] py-[10px] text-[13.5px] outline-none placeholder:text-fg-faint focus:border-gold/50 disabled:text-fg-muted"
      />
    </label>
  );
}

/**
 * The same report as something that can be pasted into a board's form or an
 * email, which is where it actually has to end up.
 */
function asPlainText(r: ProblemReport, tz: string) {
  const lines: string[] = [
    `CENTER PROBLEM REPORT`,
    `${r.center.name} (${r.center.code}) — ${r.session.exam_name}, ${r.session.exam_date}`,
    r.narrative.status === "final"
      ? `Signed off ${clockAt(r.narrative.finalised_at, tz)}`
      : `Draft`,
    ``,
    `Candidates: ${r.counts.rostered} rostered, ${r.counts.sat} sat, ${r.counts.finished} finished, ${r.counts.no_shows} no show`,
    ``,
    `WHAT HAPPENED`,
  ];

  if (r.timeline.length === 0) {
    lines.push(`Nothing was recorded against this day.`);
  } else {
    for (const e of r.timeline) {
      lines.push(
        `${clockAt(e.at, tz)}  ${e.title}` +
          [e.token, e.seat].filter(Boolean).map((x) => ` (${x})`).join(""),
      );
      if (e.detail) lines.push(`        ${e.detail}`);
      if (e.resolution) {
        lines.push(
          `        Resolved ${clockAt(e.resolved_at, tz)}: ${e.resolution}` +
            (e.minutes_lost ? ` (${e.minutes_lost} min lost)` : ""),
        );
      }
    }
  }

  if (r.walks && r.walks.walks > 0) {
    lines.push(
      ``,
      `FLOOR WALKS`,
      `${r.walks.walks} walks against an interval of ${r.walks.interval_minutes} minutes. ` +
        `Longest gap ${r.walks.longest_gap_minutes} minutes` +
        (r.walks.gaps_over_interval > 0
          ? `, ${r.walks.gaps_over_interval} over the interval.`
          : `, none over the interval.`),
    );
  }

  if (r.delays.length > 0) {
    lines.push(``, `PARTS THAT RAN LATE`);
    for (const d of r.delays) {
      lines.push(
        `${d.name}: ${d.candidates} candidate${d.candidates === 1 ? "" : "s"}, ` +
          `${d.median_minutes} min typical, ${d.worst_minutes} min worst`,
      );
    }
  }

  lines.push(``, `THE CENTRE'S ACCOUNT`, r.narrative.summary ?? "(not written)");
  if (r.narrative.actions_taken) lines.push(``, `WHAT WAS DONE`, r.narrative.actions_taken);
  if (r.narrative.reported_to) lines.push(``, `REPORTED TO`, r.narrative.reported_to);

  return lines.join("\n");
}
