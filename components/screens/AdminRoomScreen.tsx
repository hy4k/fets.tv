"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { useDrawers } from "@/lib/drawer-store";
import { useConsole } from "@/lib/console-data";
import { STAGE_LABELS, STAGE_ORDER, fullName, sinceLabel } from "@/lib/format";
import { useNow } from "@/lib/use-clock";
import type { CandidateStatus } from "@/lib/types";

export function AdminRoomScreen() {
  const { candidates, center, call, events, operators, rpc, isAdmin } = useConsole();
  const { open, toggle } = useDrawers("admin", { flow: false, feed: false, override: false });
  const now = useNow();

  const waiting = candidates.filter((c) => c.status === "waiting");
  const called = candidates.find((c) => c.id === call?.candidate_id) ?? null;

  const stats = [
    {
      label: "Arrived",
      value: candidates.filter((c) => c.arrival_at).length,
      className: "text-gold",
    },
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

  const stageCounts = useMemo(() => {
    const counts = new Map<CandidateStatus, number>();
    for (const c of candidates) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
    return counts;
  }, [candidates]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px]">
      <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-stretch gap-[14px]">
        <div className="flex min-h-0 flex-col rounded-[20px] border border-edge-mid panel-bg p-[14px]">
          <div className="mb-[12px] flex items-center gap-[9px]">
            <span className="text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">
              Checked in · waiting
            </span>
            <span className="h-px flex-1 bg-edge-soft" />
            <span className="font-mono text-[12px] text-gold">{waiting.length}</span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-[8px] overflow-x-hidden overflow-y-auto">
            {waiting.map((c) => {
              const onTv = call?.candidate_id === c.id;
              return (
                <div
                  key={c.id}
                  className="flex shrink-0 items-center gap-[10px] rounded-[15px] border border-edge bg-panel-soft px-[11px] py-[10px] hover:border-edge-warm"
                >
                  <span className="w-[76px] shrink-0 font-mono text-[12.5px] font-semibold whitespace-nowrap">
                    {c.public_token}
                  </span>
                  <span className="block min-w-0 flex-1">
                    <span className="block overflow-hidden text-[13px] font-semibold text-ellipsis whitespace-nowrap">
                      {fullName(c)}
                    </span>
                    <span className="block overflow-hidden font-mono text-[10px] text-fg-faint text-ellipsis whitespace-nowrap">
                      {c.roster_number} · KEY {c.locker_key ?? "—"}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={!isAdmin || onTv}
                    onClick={() => rpc("fets_call_candidate", { p_candidate: c.id }, `Calling ${c.public_token}`)}
                    className={`cursor-pointer rounded-[12px] px-[15px] py-[10px] text-[12px] font-bold whitespace-nowrap ${
                      onTv
                        ? "cursor-default bg-[#221d28] text-[#cfc6e6]"
                        : "bg-[linear-gradient(145deg,oklch(0.83_0.16_82),oklch(0.74_0.16_66))] text-[#1a1512] disabled:opacity-50"
                    }`}
                  >
                    {onTv ? "On TV" : "Call"}
                  </button>
                </div>
              );
            })}

            {waiting.length === 0 && (
              <div className="rounded-[15px] border border-dashed border-[#38302a] p-[22px] text-center font-mono text-[11px] text-fg-faint">
                Awaiting front-office check-in
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-[14px]">
          <div className="flex flex-1 flex-col justify-center rounded-[20px] border border-[#332c42] bg-[linear-gradient(150deg,oklch(0.3_0.05_268/0.5),#161311)] p-[16px]">
            <span className="text-[11px] font-bold tracking-[0.16em] text-[#a79cc4] uppercase">On TV now</span>
            <div className="mt-[8px] font-mono text-[clamp(30px,5vw,46px)] leading-[1.05] font-semibold whitespace-nowrap">
              {called ? called.public_token : "NO CALL"}
            </div>
            <div className="mt-[2px] overflow-hidden font-serif text-[24px] text-ellipsis whitespace-nowrap">
              {called ? fullName(called) : "Idle"}
            </div>
            <div className="mt-[14px] flex flex-wrap gap-[8px]">
              <span className="rounded-[11px] border border-[#3a3346] bg-[#221d28] px-[13px] py-[9px] text-[11px] font-bold tracking-[0.07em] text-[#cfc6e6] uppercase">
                {call?.room_label ?? "Idle"}
                {call && call.call_nonce > 0 ? ` · ×${call.call_nonce + 1}` : ""}
              </span>
              <button
                type="button"
                disabled={!isAdmin || !called}
                onClick={() => rpc("fets_recall", { p_center: center.id })}
                className="cursor-pointer rounded-[11px] border border-[#3a3346] bg-[#221d28] px-[13px] py-[9px] text-[11.5px] font-semibold whitespace-nowrap disabled:opacity-40"
              >
                Re-call
              </button>
              <button
                type="button"
                disabled={!isAdmin || !called}
                onClick={() => rpc("fets_clear_call", { p_center: center.id }, "Display cleared")}
                className="cursor-pointer rounded-[11px] border border-[#3a3346] bg-transparent px-[13px] py-[9px] text-[11.5px] font-semibold whitespace-nowrap text-[#a79cc4] disabled:opacity-40"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-[12px]">
            {stats.map((s) => (
              <div key={s.label} className="rounded-[18px] border border-edge-mid panel-bg p-[13px]">
                <span className="text-[9.5px] font-bold tracking-[0.12em] text-fg-dim uppercase">{s.label}</span>
                <div className={`mt-[4px] font-serif text-[36px] leading-[1.05] ${s.className}`}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Drawer label="Flow · 11 stages" open={open.flow} onToggle={toggle("flow")}>
        <div className="flex shrink-0 gap-[8px] overflow-x-auto overflow-y-hidden pb-[4px]">
          {STAGE_ORDER.map((status, i) => {
            const count = stageCounts.get(status) ?? 0;
            const tone =
              status === "testing"
                ? "text-iris"
                : status === "completed"
                  ? "text-mint"
                  : count > 0
                    ? "text-gold"
                    : "text-fg-muted";
            return (
              <div
                key={status}
                className="shrink-0 basis-[104px] rounded-[16px] border border-edge bg-panel-soft px-[12px] py-[11px]"
              >
                <div className="font-mono text-[9px] text-fg-faint">{String(i + 1).padStart(2, "0")}</div>
                <div className="mt-[4px] min-h-[28px] text-[11px] leading-[1.25] font-semibold">
                  {STAGE_LABELS[status]}
                </div>
                <div className={`mt-[4px] font-mono text-[19px] font-semibold ${tone}`}>{count}</div>
              </div>
            );
          })}
        </div>
      </Drawer>

      <Drawer label="Audit trail" open={open.feed} onToggle={toggle("feed")}>
        <div className="flex max-h-[240px] shrink-0 flex-col gap-[9px] overflow-x-hidden overflow-y-auto rounded-[16px] border border-edge bg-panel p-[14px]">
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
                <span className="w-[76px] shrink-0 font-mono text-[11px] whitespace-nowrap">
                  {c?.public_token ?? "—"}
                </span>
                <span className="min-w-0 flex-1 overflow-hidden text-[11.5px] text-fg-muted text-ellipsis whitespace-nowrap">
                  {describeEvent(e.event_type, e.to_status)}
                  {e.note ? ` · ${e.note}` : ""}
                  {e.operator_id ? ` · ${operators[e.operator_id] ?? "operator"}` : ""}
                </span>
                <span className="font-mono text-[10px] text-fg-faint">{now ? sinceLabel(e.occurred_at, now) : "—"}</span>
              </div>
            );
          })}
          {events.length === 0 && <p className="font-mono text-[11px] text-fg-faint">No events yet today.</p>}
        </div>
      </Drawer>

      {isAdmin && (
        <Drawer label="Admin override" open={open.override} onToggle={toggle("override")}>
          <OverridePanel />
        </Drawer>
      )}
    </div>
  );
}

function OverridePanel() {
  const { candidates, rpc } = useConsole();
  const [candidateId, setCandidateId] = useState("");
  const [status, setStatus] = useState<CandidateStatus>("waiting");
  const [note, setNote] = useState("");

  const selectable = candidates.filter((c) => c.status !== "scheduled");

  return (
    <div className="flex shrink-0 flex-wrap items-end gap-[10px] rounded-[16px] border border-edge bg-panel p-[14px]">
      <label className="flex min-w-[200px] flex-1 flex-col gap-[6px]">
        <span className="text-[9.5px] font-bold tracking-[0.12em] text-fg-dim uppercase">Candidate</span>
        <select
          value={candidateId}
          onChange={(e) => setCandidateId(e.target.value)}
          className="rounded-[12px] border border-edge-strong bg-panel-soft px-[11px] py-[10px] text-[12.5px] outline-none"
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
          className="rounded-[12px] border border-edge-strong bg-panel-soft px-[11px] py-[10px] text-[12.5px] outline-none"
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
          className="rounded-[12px] border border-edge-strong bg-panel-soft px-[11px] py-[10px] text-[12.5px] outline-none placeholder:text-fg-faint"
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
        className="cursor-pointer rounded-[12px] border border-rust/50 bg-rust/15 px-[15px] py-[11px] text-[12px] font-bold text-rust disabled:opacity-40"
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
