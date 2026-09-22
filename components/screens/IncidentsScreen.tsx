"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useConsole } from "@/lib/console-data";
import { clockAt, fullName } from "@/lib/format";
import { useNow } from "@/lib/use-clock";
import type { Incident, IncidentKind, IncidentSeverity } from "@/lib/types";

const KINDS: { key: IncidentKind; label: string; hint: string }[] = [
  { key: "workstation", label: "A machine", hint: "Froze, crashed, lost power" },
  { key: "network", label: "The network", hint: "Connection dropped" },
  { key: "power", label: "Power", hint: "The building or a UPS" },
  { key: "candidate", label: "A candidate", hint: "Illness, distress, a dispute" },
  { key: "conduct", label: "Conduct", hint: "Suspected misconduct" },
  { key: "environment", label: "The room", hint: "Noise, heat, a fire alarm" },
  { key: "delivery", label: "The exam software", hint: "The delivery system itself" },
  { key: "other", label: "Something else", hint: "" },
];

const SEVERITIES: { key: IncidentSeverity; label: string; note: string; tone: string }[] = [
  { key: "minor", label: "Minor", note: "Nobody lost time", tone: "border-edge-warm bg-panel-soft" },
  { key: "major", label: "Major", note: "Somebody lost time", tone: "border-gold/55 bg-gold/12 text-gold-bright" },
  { key: "critical", label: "Critical", note: "The sitting was at risk", tone: "border-rust/60 bg-rust/15 text-rust" },
];

const SEVERITY_CHIP: Record<IncidentSeverity, string> = {
  minor: "bg-panel text-fg-muted",
  major: "bg-gold/18 text-gold-bright",
  critical: "bg-rust/20 text-rust",
};

/** How long an open incident has been running, in words a person would use. */
function runningFor(startedAt: string, now: number) {
  const mins = Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} hr ${String(mins % 60).padStart(2, "0")} min`;
}

/**
 * What went wrong, written down while it is going wrong.
 *
 * The report the board eventually gets is only as good as what somebody noted
 * at the time, so logging is open to everybody on the floor and asks for one
 * line before anything else. Detail can follow; the timestamp cannot.
 */
export function IncidentsScreen() {
  const { incidents, candidates, workstations, operators, center } = useConsole();
  const now = useNow();

  const [logging, setLogging] = useState(false);
  const [resolving, setResolving] = useState<Incident | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const open = useMemo(() => incidents.filter((i) => !i.resolved_at), [incidents]);
  const closed = useMemo(() => incidents.filter((i) => i.resolved_at), [incidents]);

  const seatOf = (id: string | null) =>
    workstations.find((w) => w.id === id)?.seat_code ?? null;
  const personOf = (id: string | null) => {
    const c = candidates.find((x) => x.id === id);
    return c ? `${c.public_token} · ${fullName(c)}` : null;
  };

  function Row({ incident }: { incident: Incident }) {
    const touches = [seatOf(incident.workstation_id), personOf(incident.candidate_id)].filter(Boolean);

    return (
      <div className="flex flex-wrap items-start gap-x-[12px] gap-y-[7px] border-b border-edge-soft/60 px-[14px] py-[12px] md:px-[18px]">
        <span
          className={`shrink-0 rounded-[9px] px-[9px] py-[5px] text-[10.5px] font-bold uppercase ${
            SEVERITY_CHIP[incident.severity]
          }`}
        >
          {incident.severity}
        </span>

        <span className="block min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">{incident.summary}</span>
          <span className="block truncate font-mono text-[10.5px] text-fg-faint">
            {KINDS.find((k) => k.key === incident.kind)?.label ?? incident.kind}
            {touches.length > 0 && ` · ${touches.join(" · ")}`}
            {` · started ${clockAt(incident.started_at, center.timezone)}`}
            {incident.logged_by && ` · ${operators[incident.logged_by] ?? "operator"}`}
          </span>
          {incident.detail && (
            <span className="mt-[5px] block text-[12.5px] leading-[1.5] text-fg-muted">
              {incident.detail}
            </span>
          )}
          {incident.resolution && (
            <span className="mt-[5px] block text-[12.5px] leading-[1.5] text-mint">
              {incident.resolution}
              {incident.minutes_lost != null && ` · ${incident.minutes_lost} min lost`}
            </span>
          )}
        </span>

        {incident.reportable && (
          <span className="shrink-0 rounded-[9px] border border-iris/45 px-[9px] py-[5px] text-[10.5px] font-semibold text-iris">
            Reportable
          </span>
        )}

        {incident.resolved_at ? (
          <span className="shrink-0 font-mono text-[11px] text-fg-faint">
            closed {clockAt(incident.resolved_at, center.timezone)}
          </span>
        ) : (
          <>
            <span className="shrink-0 font-mono text-[12px] font-semibold text-gold">
              {runningFor(incident.started_at, now)}
            </span>
            <button
              type="button"
              onClick={() => setResolving(incident)}
              className="shrink-0 cursor-pointer rounded-[11px] border border-mint/45 bg-mint/10 px-[14px] py-[9px] text-[12.5px] font-bold text-mint"
            >
              Close it
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[12px]">
      <div className="flex shrink-0 flex-wrap items-center gap-[12px]">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">Incidents</span>
          <span className="block text-[12px] text-fg-faint">
            {open.length === 0
              ? "Nothing open. Log anything that goes wrong while it is happening."
              : `${open.length} open`}
          </span>
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setLogging(true)}
          className="shrink-0 cursor-pointer rounded-[14px] gold-bg px-[20px] py-[12px] text-[14px] font-bold text-[#1a1512]"
        >
          + Log what happened
        </button>
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-edge-mid panel-bg">
        <div className="flex shrink-0 items-center gap-[10px] border-b border-edge-soft px-[16px] py-[12px]">
          <span className="text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">
            {showClosed ? "Closed today" : "Still open"}
          </span>
          <span className="h-px flex-1 bg-edge-soft" />
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="cursor-pointer rounded-[10px] border border-edge px-[12px] py-[7px] text-[12px] text-fg-muted hover:border-edge-warm hover:text-fg"
          >
            {showClosed ? `Show open (${open.length})` : `Show closed (${closed.length})`}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {(showClosed ? closed : open).map((i) => (
            <Row key={i.id} incident={i} />
          ))}

          {(showClosed ? closed : open).length === 0 && (
            <p className="p-[26px] text-center text-[13px] text-fg-faint">
              {showClosed ? "Nothing has been closed yet." : "Nothing open. A good sign."}
            </p>
          )}
        </div>
      </section>

      {logging && <LogDialog onClose={() => setLogging(false)} />}
      {resolving && (
        <ResolveDialog key={resolving.id} incident={resolving} onClose={() => setResolving(null)} />
      )}
    </div>
  );
}

function LogDialog({ onClose }: { onClose: () => void }) {
  const { center, candidates, workstations, rpc } = useConsole();

  const [kind, setKind] = useState<IncidentKind>("workstation");
  const [severity, setSeverity] = useState<IncidentSeverity>("minor");
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [workstationId, setWorkstationId] = useState("");
  const [reportable, setReportable] = useState(false);
  const [busy, setBusy] = useState(false);

  // Only people who are actually here: a no-show cannot have an incident.
  const present = candidates.filter((c) => c.check_in_at && !c.signed_out_at);
  const seats = workstations.filter((w) => w.lab_id);

  async function save() {
    if (!summary.trim()) return;
    setBusy(true);
    const ok = await rpc(
      "fets_log_incident",
      {
        p_center: center.id,
        p_kind: kind,
        p_summary: summary,
        p_severity: severity,
        p_detail: detail,
        p_candidate: candidateId || null,
        p_workstation: workstationId || null,
        p_reportable: reportable,
      },
      "Logged",
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      title="What happened?"
      subtitle="The time is recorded now, so log it first and add detail after."
      onClose={onClose}
      width={620}
      footer={
        <>
          <button
            type="button"
            disabled={busy || !summary.trim()}
            onClick={save}
            className="flex-1 cursor-pointer rounded-[14px] gold-bg px-[22px] py-[15px] text-[14.5px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Logging…" : "Log it"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[14px] border border-edge px-[20px] py-[15px] text-[14px] font-semibold text-fg-muted"
          >
            Cancel
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-[16px]">
        <label className="flex flex-col gap-[7px]">
          <span className="text-[11.5px] font-semibold text-fg-dim">In one line</span>
          <input
            autoFocus
            maxLength={200}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Lab 1-03 froze during the listening section"
            className="w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] text-[15px] outline-none placeholder:text-fg-faint focus:border-gold/50"
          />
        </label>

        <div className="flex flex-col gap-[8px]">
          <span className="text-[11.5px] font-semibold text-fg-dim">What kind of thing</span>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-[7px]">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                className={`cursor-pointer rounded-[12px] border px-[12px] py-[10px] text-left transition-colors ${
                  kind === k.key
                    ? "border-gold/60 bg-gold/12"
                    : "border-edge bg-panel-soft hover:border-edge-warm"
                }`}
              >
                <span className="block text-[13px] font-semibold">{k.label}</span>
                {k.hint && <span className="block text-[11px] text-fg-faint">{k.hint}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-[8px]">
          <span className="text-[11.5px] font-semibold text-fg-dim">How bad</span>
          <div className="flex flex-wrap gap-[8px]">
            {SEVERITIES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSeverity(s.key)}
                className={`cursor-pointer rounded-[12px] border px-[14px] py-[10px] text-left transition-colors ${
                  severity === s.key ? s.tone : "border-edge bg-panel-soft text-fg-muted"
                }`}
              >
                <span className="block text-[13px] font-semibold">{s.label}</span>
                <span className="block text-[11px] opacity-80">{s.note}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-[12px]">
          <label className="flex min-w-[180px] flex-1 flex-col gap-[7px]">
            <span className="text-[11.5px] font-semibold text-fg-dim">
              Which seat <span className="font-normal text-fg-faint">— if one</span>
            </span>
            <select
              value={workstationId}
              onChange={(e) => setWorkstationId(e.target.value)}
              className="rounded-[12px] border border-edge-strong bg-panel-soft px-[12px] py-[12px] text-[13.5px] outline-none"
            >
              <option value="">None</option>
              {seats.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.seat_code}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-[180px] flex-1 flex-col gap-[7px]">
            <span className="text-[11.5px] font-semibold text-fg-dim">
              Which candidate <span className="font-normal text-fg-faint">— if one</span>
            </span>
            <select
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              className="rounded-[12px] border border-edge-strong bg-panel-soft px-[12px] py-[12px] text-[13.5px] outline-none"
            >
              <option value="">None</option>
              {present.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.public_token} · {fullName(c)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-[7px]">
          <span className="text-[11.5px] font-semibold text-fg-dim">
            Anything else <span className="font-normal text-fg-faint">— can be added later</span>
          </span>
          <textarea
            rows={3}
            maxLength={4000}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            className="resize-y rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[12px] text-[14px] leading-[1.5] outline-none focus:border-gold/50"
          />
        </label>

        <button
          type="button"
          role="switch"
          aria-checked={reportable}
          onClick={() => setReportable((v) => !v)}
          className="flex cursor-pointer items-center gap-[14px] rounded-[16px] border border-edge bg-panel-soft p-[13px] text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold">The board has to be told</span>
            <span className="mt-[2px] block text-[12px] text-fg-faint">
              Marks it for the Center Problem Report.
            </span>
          </span>
          <span
            className={`flex h-[26px] w-[46px] shrink-0 items-center rounded-full p-[3px] transition-colors ${
              reportable ? "bg-iris/70" : "bg-[#30291f]"
            }`}
          >
            <span
              className={`h-[20px] w-[20px] rounded-full bg-[#141110] transition-transform ${
                reportable ? "translate-x-[20px]" : ""
              }`}
            />
          </span>
        </button>
      </div>
    </Dialog>
  );
}

function ResolveDialog({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const { rpc } = useConsole();
  const [resolution, setResolution] = useState("");
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!resolution.trim()) return;
    const lost = minutes.trim() === "" ? null : Number(minutes);
    if (lost !== null && (!Number.isInteger(lost) || lost < 0 || lost > 1440)) return;

    setBusy(true);
    const ok = await rpc(
      "fets_resolve_incident",
      { p_incident: incident.id, p_resolution: resolution, p_minutes_lost: lost },
      "Closed",
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      title="How was it settled?"
      subtitle={incident.summary}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            disabled={busy || !resolution.trim()}
            onClick={save}
            className="flex-1 cursor-pointer rounded-[14px] bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] px-[22px] py-[15px] text-[14.5px] font-bold text-[#0c1711] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Closing…" : "Close it"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[14px] border border-edge px-[20px] py-[15px] text-[14px] font-semibold text-fg-muted"
          >
            Not yet
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-[15px]">
        <label className="flex flex-col gap-[7px]">
          <span className="text-[11.5px] font-semibold text-fg-dim">What was done</span>
          <textarea
            autoFocus
            rows={3}
            maxLength={2000}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="Moved to Lab 1-04, machine taken out of service."
            className="resize-y rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[12px] text-[14px] leading-[1.5] outline-none placeholder:text-fg-faint focus:border-gold/50"
          />
        </label>

        <label className="flex w-[160px] flex-col gap-[7px]">
          <span className="text-[11.5px] font-semibold text-fg-dim">Minutes lost</span>
          <input
            inputMode="numeric"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="0"
            className="rounded-[12px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] font-mono text-[16px] outline-none placeholder:text-fg-faint focus:border-gold/50"
          />
        </label>

        <p className="text-[12px] leading-[1.5] text-fg-faint">
          Your judgement, not the clock&rsquo;s — the exam clock keeps running through a freeze, so
          only somebody who was there knows what the candidate actually lost. Leave it blank if
          nobody lost anything.
        </p>
      </div>
    </Dialog>
  );
}
