"use client";

import { useMemo, useState } from "react";
import { useConsole } from "@/lib/console-data";
import { STAGE_LABELS, STAGE_ORDER, fullName, sinceLabel } from "@/lib/format";
import { useNow } from "@/lib/use-clock";
import type { CandidateStatus } from "@/lib/types";

const TABS = [
  { key: "tv", label: "On TV now", short: "On TV" },
  { key: "flow", label: "Flow · 11 stages", short: "Flow" },
  { key: "audit", label: "Audit trail", short: "Audit" },
  { key: "override", label: "Admin override", short: "Override" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * The calling desk. One thing happens at a time here, so the page says one
 * thing at a time: who is being waited on now, then who is next, then a single
 * panel of detail chosen from the bar at the foot. Nothing stacks and nothing
 * slides out from under anything else.
 */
export function AdminRoomScreen() {
  const { candidates, center, call, rpc, isAdmin, canCall, session } = useConsole();
  const [tab, setTab] = useState<TabKey>("tv");

  // The order people are called in is the order they were checked in, so the
  // numbers on screen are the numbers the hall is waiting on.
  const pending = useMemo(
    () =>
      candidates
        .filter((c) => c.status === "waiting" && !c.called_at)
        .sort((a, b) => (a.check_in_at ?? "").localeCompare(b.check_in_at ?? "")),
    [candidates],
  );

  const called = candidates.find((c) => c.id === call?.candidate_id) ?? null;

  // Somebody was called and has not walked in yet. Until they do, calling the
  // next person would put two tokens in the hall's head at once.
  const awaitingEntry = called !== null && called.status === "waiting";
  const next = pending[0] ?? null;

  if (!session) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-[20px] border border-edge-mid panel-bg p-[24px] text-center">
        <p className="max-w-[360px] text-[13.5px] text-fg-muted">
          No active roster for this center. Import one from{" "}
          <span className="font-semibold text-gold">Roster</span> to start calling.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[12px]">
      {/* One banner, one state. Either somebody is being waited on, or the next
          person can be called. Never both, never neither. */}
      {awaitingEntry ? (
        <section className="shrink-0 rounded-[20px] border-2 border-mint/50 bg-[linear-gradient(150deg,oklch(0.42_0.1_165/0.35),#141816)] p-[16px]">
          <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px]">
            <span className="rounded-[10px] bg-mint/20 px-[11px] py-[6px] text-[10.5px] font-extrabold tracking-[0.16em] text-mint uppercase">
              Called · waiting to enter
            </span>
            <span className="font-mono text-[clamp(26px,4vw,38px)] leading-none font-semibold whitespace-nowrap text-mint">
              {called.public_token}
            </span>
            <span className="min-w-0 truncate font-serif text-[24px]">{fullName(called)}</span>
          </div>

          {/* Marking somebody in is the front desk's call — they are the ones
              who can see the door. Putting the same button here too had two
              rooms racing to press it. */}
          <p className="mt-[12px] rounded-[13px] bg-[#0c1711]/40 px-[14px] py-[11px] text-[13px] text-mint">
            The front office marks them in when they arrive at the desk.
          </p>

          <div className="mt-[9px] flex flex-wrap gap-[8px]">
            <button
              type="button"
              disabled={!canCall}
              onClick={() => rpc("fets_recall", { p_center: center.id })}
              className="flex-1 cursor-pointer rounded-[13px] border border-edge-warm bg-panel-soft px-[14px] py-[11px] text-[13px] font-semibold disabled:opacity-40"
            >
              Call them again
            </button>
            <button
              type="button"
              disabled={!canCall}
              onClick={() => rpc("fets_clear_call", { p_center: center.id }, "Display cleared")}
              className="flex-1 cursor-pointer rounded-[13px] border border-edge px-[14px] py-[11px] text-[13px] font-semibold text-fg-muted disabled:opacity-40"
            >
              Clear the TV
            </button>
          </div>
        </section>
      ) : (
        <section className="shrink-0 rounded-[20px] border border-edge-mid panel-bg p-[16px]">
          <button
            type="button"
            disabled={!canCall || !next}
            onClick={() =>
              next && rpc("fets_call_candidate", { p_candidate: next.id }, `Calling ${next.public_token}`)
            }
            className={`w-full rounded-[15px] px-[22px] py-[17px] text-[16px] font-bold ${
              canCall && next
                ? "cursor-pointer gold-bg text-[#1a1512]"
                : "cursor-not-allowed bg-[#1d1d25] text-fg-dim"
            }`}
          >
            {next ? `Call ${next.public_token} · ${fullName(next)}` : "Nobody is waiting to be called"}
          </button>
          <p className="mt-[9px] text-center text-[12px] text-fg-faint">
            {pending.length > 0
              ? `${pending.length} waiting · next in line goes to the TV`
              : "Everyone checked in has been called."}
          </p>
        </section>
      )}

      {/* The queue, numbered the way the hall counts it. */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-edge-mid panel-bg">
        <div className="flex shrink-0 items-center gap-[10px] border-b border-edge-soft px-[16px] py-[12px]">
          <span className="text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">
            Waiting to be called
          </span>
          {awaitingEntry && (
            <span className="truncate text-[11.5px] text-mint">
              Held until {called.public_token} walks in
            </span>
          )}
          <span className="h-px min-w-[12px] flex-1 bg-edge-soft" />
          <span className="font-mono text-[13px] font-semibold text-gold">{pending.length}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {pending.map((c, i) => (
            <div
              key={c.id}
              className="flex items-center gap-[11px] border-b border-edge-soft/60 px-[14px] py-[11px] md:px-[16px]"
            >
              <span
                className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] font-mono text-[12px] font-bold ${
                  i === 0 ? "bg-gold text-[#1a1512]" : "bg-panel-soft text-fg-dim"
                }`}
              >
                {i + 1}
              </span>

              <span className="w-[74px] shrink-0 font-mono text-[12.5px] font-semibold">
                {c.public_token}
              </span>

              <span className="block min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{fullName(c)}</span>
                <span className="block truncate font-mono text-[10px] text-fg-faint">
                  {c.roster_number} · KEY {c.locker_key ?? "—"}
                </span>
              </span>

              <button
                type="button"
                disabled={!canCall || awaitingEntry}
                title={awaitingEntry ? `Waiting for ${called.public_token} to enter` : undefined}
                onClick={() =>
                  rpc("fets_call_candidate", { p_candidate: c.id }, `Calling ${c.public_token}`)
                }
                className="shrink-0 cursor-pointer rounded-[12px] gold-bg px-[15px] py-[10px] text-[12.5px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Call
              </button>
            </div>
          ))}

          {pending.length === 0 && (
            <p className="p-[26px] text-center text-[13px] text-fg-faint">
              Nobody is waiting. The front office checks people in.
            </p>
          )}
        </div>
      </section>

      {/* One panel at a time, chosen from the bar beneath it. */}
      <section className="flex max-h-[32dvh] shrink-0 flex-col overflow-hidden rounded-[20px] border border-edge-mid panel-bg sm:max-h-[42dvh]">
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-[15px]">
          {tab === "tv" && <TvPanel />}
          {tab === "flow" && <FlowPanel />}
          {tab === "audit" && <AuditPanel />}
          {tab === "override" && (isAdmin ? <OverridePanel /> : <NotAdmin />)}
        </div>

        <nav className="flex shrink-0 gap-[5px] border-t border-edge-soft p-[7px]" aria-label="Admin panels">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "true" : undefined}
              className={`min-w-0 flex-1 cursor-pointer truncate rounded-[12px] px-[9px] py-[11px] text-[12px] font-semibold transition-colors ${
                tab === t.key
                  ? "bg-accent/12 text-accent"
                  : "text-fg-dim hover:bg-panel-soft hover:text-fg"
              }`}
            >
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </nav>
      </section>
    </div>
  );
}

/** What the hall's screen is showing, and the numbers behind the day. */
function TvPanel() {
  const { candidates, call } = useConsole();
  const called = candidates.find((c) => c.id === call?.candidate_id) ?? null;

  const stats = [
    { label: "Arrived", value: candidates.filter((c) => c.arrival_at).length, className: "text-gold" },
    {
      label: "In lab",
      value: candidates.filter((c) => c.status === "lab_entry" || c.status === "testing").length,
      className: "text-iris",
    },
    {
      label: "Done",
      value: candidates.filter((c) => c.status === "completed" || c.status === "signed_out").length,
      className: "text-mint",
    },
  ];

  return (
    <div className="flex flex-col gap-[13px]">
      <div className="rounded-[17px] border border-[#332c42] bg-[linear-gradient(150deg,oklch(0.3_0.05_268/0.5),#161311)] p-[15px]">
        <span className="text-[10.5px] font-bold tracking-[0.16em] text-[#a79cc4] uppercase">
          The TV is showing
        </span>
        <div className="mt-[7px] font-mono text-[clamp(26px,4vw,40px)] leading-none font-semibold">
          {called ? called.public_token : "NO CALL"}
        </div>
        <div className="mt-[5px] truncate font-serif text-[21px]">
          {called ? fullName(called) : "Idle"}
        </div>
        <div className="mt-[11px] flex flex-wrap gap-[7px] text-[11px]">
          <span className="rounded-[10px] border border-[#3a3346] bg-[#221d28] px-[11px] py-[7px] font-bold tracking-[0.07em] text-[#cfc6e6] uppercase">
            {call?.room_label ?? "Idle"}
          </span>
          {call && call.call_nonce > 0 && (
            <span className="rounded-[10px] border border-[#3a3346] px-[11px] py-[7px] text-[#a79cc4]">
              Called {call.call_nonce + 1} times
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-[10px]">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[15px] border border-edge bg-panel-soft p-[12px]">
            <span className="text-[9.5px] font-bold tracking-[0.12em] text-fg-dim uppercase">
              {s.label}
            </span>
            <div className={`mt-[3px] font-serif text-[30px] leading-[1.05] ${s.className}`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlowPanel() {
  const { candidates } = useConsole();

  const counts = useMemo(() => {
    const map = new Map<CandidateStatus, number>();
    for (const c of candidates) map.set(c.status, (map.get(c.status) ?? 0) + 1);
    return map;
  }, [candidates]);

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(98px,1fr))] gap-[8px]">
      {STAGE_ORDER.map((status, i) => {
        const count = counts.get(status) ?? 0;
        const tone =
          status === "testing"
            ? "text-iris"
            : status === "completed"
              ? "text-mint"
              : count > 0
                ? "text-gold"
                : "text-fg-faint";
        return (
          <div key={status} className="rounded-[15px] border border-edge bg-panel-soft px-[11px] py-[10px]">
            <div className="font-mono text-[9px] text-fg-faint">{String(i + 1).padStart(2, "0")}</div>
            <div className="mt-[3px] min-h-[26px] text-[10.5px] leading-[1.25] font-semibold">
              {STAGE_LABELS[status]}
            </div>
            <div className={`mt-[3px] font-mono text-[18px] font-semibold ${tone}`}>{count}</div>
          </div>
        );
      })}
    </div>
  );
}

function AuditPanel() {
  const { candidates, events, names } = useConsole();
  const now = useNow();

  if (events.length === 0) {
    return <p className="text-[12.5px] text-fg-faint">No events yet today.</p>;
  }

  return (
    <div className="flex flex-col gap-[9px]">
      {events.map((e) => {
        const c = candidates.find((x) => x.id === e.candidate_id);
        const tone =
          e.event_type === "admin.override"
            ? "bg-rust"
            : e.to_status === "completed" || e.to_status === "signed_out"
              ? "bg-mint"
              : e.to_status === "testing"
                ? "bg-iris"
                : "bg-gold";
        return (
          <div key={e.id} className="flex items-center gap-[10px]">
            <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${tone}`} />
            <span className="w-[74px] shrink-0 font-mono text-[11px]">{c?.public_token ?? "—"}</span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-muted">
              {describeEvent(e.event_type, e.to_status)}
              {e.note ? ` · ${e.note}` : ""}
              {e.operator_id ? ` · ${names[e.operator_id] ?? "operator"}` : ""}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-fg-faint">
              {now ? sinceLabel(e.occurred_at, now) : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function NotAdmin() {
  return <p className="text-[12.5px] text-gold">Only staff can move somebody between stages.</p>;
}

function OverridePanel() {
  const { candidates, rpc } = useConsole();
  const [candidateId, setCandidateId] = useState("");
  const [status, setStatus] = useState<CandidateStatus>("waiting");
  const [note, setNote] = useState("");

  const selectable = candidates.filter((c) => c.status !== "scheduled");

  return (
    <div className="flex flex-wrap items-end gap-[10px]">
      <label className="flex min-w-[200px] flex-1 flex-col gap-[6px]">
        <span className="text-[9.5px] font-bold tracking-[0.12em] text-fg-dim uppercase">Candidate</span>
        <select
          value={candidateId}
          onChange={(e) => setCandidateId(e.target.value)}
          className="rounded-[12px] border border-edge-strong bg-panel-soft px-[11px] py-[11px] text-[12.5px] outline-none"
        >
          <option value="">Select…</option>
          {selectable.map((c) => (
            <option key={c.id} value={c.id}>
              {c.public_token} · {fullName(c)} · {STAGE_LABELS[c.status]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-[150px] flex-col gap-[6px]">
        <span className="text-[9.5px] font-bold tracking-[0.12em] text-fg-dim uppercase">Move to</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as CandidateStatus)}
          className="rounded-[12px] border border-edge-strong bg-panel-soft px-[11px] py-[11px] text-[12.5px] outline-none"
        >
          {[...STAGE_ORDER, "no_show" as const].map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-[220px] flex-[2] flex-col gap-[6px]">
        <span className="text-[9.5px] font-bold tracking-[0.12em] text-fg-dim uppercase">Reason</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why is this being changed?"
          className="rounded-[12px] border border-edge-strong bg-panel-soft px-[11px] py-[11px] text-[12.5px] outline-none placeholder:text-fg-faint"
        />
      </label>

      <button
        type="button"
        disabled={!candidateId || note.trim().length === 0}
        onClick={async () => {
          const ok = await rpc(
            "fets_admin_override",
            { p_candidate: candidateId, p_status: status, p_note: note.trim() },
            "Override recorded",
          );
          if (ok) setNote("");
        }}
        className="cursor-pointer rounded-[12px] border border-rust/50 bg-rust/15 px-[16px] py-[12px] text-[12px] font-bold text-rust disabled:opacity-40"
      >
        Apply override
      </button>
    </div>
  );
}

function describeEvent(type: string, to: CandidateStatus | null) {
  switch (type) {
    case "candidate.id_verified":
      return "ID cross-verified";
    case "candidate.locker_issued":
      return "Locker key issued";
    case "candidate.checked_in":
      return "Checked in at front office";
    case "candidate_added":
      return "Added by hand";
    case "details_edited":
      return "Details edited";
    case "display.call_updated":
      return "Called to the display";
    case "display.recalled":
      return "Re-called on the display";
    case "display.call_cleared":
      return "Display cleared";
    case "candidate.entered":
      return "Sent in from front office";
    case "candidate.assigned":
      return "Assigned to a workstation";
    case "candidate.no_show":
      return "Flagged no show";
    case "admin.override":
      return `Admin override → ${to ? STAGE_LABELS[to] : "?"}`;
    default:
      return to ? `Moved to ${STAGE_LABELS[to]}` : type;
  }
}
