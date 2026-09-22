"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CandidateDetailsDialog } from "@/components/screens/CandidateDetailsDialog";
import { useConsole } from "@/lib/console-data";
import { clockAt, fullName, statusChip } from "@/lib/format";
import type { Candidate } from "@/lib/types";

const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "waiting", label: "Waiting" },
  { key: "inside", label: "Inside" },
  { key: "done", label: "Finished" },
  { key: "no_show", label: "No show" },
  { key: "incomplete", label: "Missing details" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function isIncomplete(c: Candidate) {
  return !c.part || !c.phone || !c.place;
}

function matches(c: Candidate, filter: FilterKey) {
  if (filter === "all") return true;
  if (filter === "incomplete") return isIncomplete(c);
  if (filter === "waiting") return ["scheduled", "arrived", "id_checked", "waiting"].includes(c.status);
  if (filter === "inside")
    return ["frisking", "biometrics", "assigned", "lab_entry", "testing"].includes(c.status);
  if (filter === "done") return ["completed", "signed_out"].includes(c.status);
  return c.status === "no_show";
}

/** The report's own columns, in the report's own order. */
const COLUMNS = "104px 1fr 92px 130px 128px 118px";

/**
 * Step two: the roster that was just imported, as a plain list — token, name,
 * part, place, contact number, status, and nothing else. Anything the board's
 * export left blank can be filled in here, and anybody the export missed can be
 * added by hand.
 */
export function CandidatesScreen() {
  const { candidates, center, session, canFrontOffice } = useConsole();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [adding, setAdding] = useState(false);

  const counts = useMemo(() => {
    const out = {} as Record<FilterKey, number>;
    for (const f of FILTERS) out[f.key] = candidates.filter((c) => matches(c, f.key)).length;
    return out;
  }, [candidates]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates
      .filter((c) => matches(c, filter))
      .filter(
        (c) =>
          !q ||
          fullName(c).toLowerCase().includes(q) ||
          c.roster_number.toLowerCase().includes(q) ||
          c.public_token.toLowerCase().includes(q) ||
          (c.phone ?? "").includes(q),
      );
  }, [candidates, filter, query]);

  if (!session) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[16px] rounded-[24px] border border-dashed border-[#3a322b] p-[40px] text-center">
        <span className="font-serif text-[28px]">No roster yet</span>
        <span className="max-w-[40ch] text-[14px] text-fg-muted">
          Import today&rsquo;s roster and everyone will appear here.
        </span>
        <Link
          href="/roster"
          className="rounded-[14px] gold-bg px-[22px] py-[13px] text-[14px] font-bold text-[#1a1512]"
        >
          Go to Roster
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px]">
      <div className="flex shrink-0 flex-wrap items-center gap-[12px]">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">{session.exam_name}</span>
          <span className="block text-[12px] text-fg-faint">
            {candidates.length} candidates · imported {clockAt(session.created_at, center.timezone)}
          </span>
        </span>
        <span className="flex-1" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, token or number"
          className="w-full min-w-0 rounded-[14px] border border-edge-strong bg-panel-soft px-[15px] py-[12px] text-[14px] outline-none placeholder:text-fg-faint focus:border-gold/50 md:w-auto md:min-w-[230px]"
        />
        <button
          type="button"
          disabled={!canFrontOffice}
          onClick={() => setAdding(true)}
          className="shrink-0 cursor-pointer rounded-[14px] gold-bg px-[18px] py-[12px] text-[13.5px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Add by hand
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap gap-[8px]">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`cursor-pointer rounded-[12px] border px-[14px] py-[10px] text-[13px] font-semibold transition-colors ${
              filter === f.key
                ? "border-gold/55 bg-gold/10 text-fg"
                : "border-edge bg-panel-soft text-fg-muted hover:border-edge-warm"
            }`}
          >
            {f.label}
            <span className="ml-[7px] font-mono text-[12px] text-fg-faint">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-edge-mid panel-bg">
        <div
          style={{ gridTemplateColumns: COLUMNS }}
          className="hidden shrink-0 gap-[12px] border-b border-edge-soft px-[18px] py-[13px] text-[11px] font-semibold text-fg-dim md:grid"
        >
          <span>Token</span>
          <span>Name</span>
          <span>Part</span>
          <span>Place</span>
          <span>Contact number</span>
          <span>Status</span>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {rows.map((c) => {
            const chip = statusChip(c);
            return (
              <button
                key={c.id}
                type="button"
                disabled={!canFrontOffice}
                onClick={() => setEditing(c)}
                style={{ gridTemplateColumns: COLUMNS }}
                className="flex w-full flex-wrap items-center gap-x-[12px] gap-y-[4px] border-b border-edge-soft/60 px-[14px] py-[13px] text-left hover:bg-panel-soft disabled:cursor-default md:grid md:px-[18px] md:py-[14px]"
              >
                <span className="font-mono text-[13px] font-semibold">{c.public_token}</span>
                <span className="order-first w-full min-w-0 md:order-none md:w-auto">
                  <span className="block truncate text-[14px]">{fullName(c)}</span>
                  <span className="block truncate font-mono text-[11px] text-fg-faint">
                    {c.roster_number}
                  </span>
                </span>
                <Cell value={c.part} />
                <Cell value={c.place} />
                <Cell value={c.phone} mono />
                <span>
                  <span
                    className={`inline-block rounded-[9px] px-[10px] py-[6px] text-[11px] font-semibold ${chip.className}`}
                  >
                    {chip.label}
                  </span>
                </span>
              </button>
            );
          })}

          {rows.length === 0 && (
            <p className="p-[28px] text-center text-[13px] text-fg-faint">
              {query ? `Nobody matches “${query}”` : "Nobody in this group."}
            </p>
          )}
        </div>
      </div>

      {canFrontOffice && (
        <p className="shrink-0 text-[12px] text-fg-faint">
          Tap anybody to fill in a blank or correct a detail.
        </p>
      )}

      {adding && <CandidateDetailsDialog open candidate={null} onClose={() => setAdding(false)} />}
      {editing && (
        <CandidateDetailsDialog
          key={editing.id}
          open
          candidate={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** A blank is shown as a blank worth filling, not as a dash to skip over. */
function Cell({ value, mono = false }: { value: string | null; mono?: boolean }) {
  if (!value) {
    return <span className="truncate text-[12px] text-fg-faint italic">add</span>;
  }
  return (
    <span className={`truncate text-[12.5px] text-fg-muted md:text-[13px] ${mono ? "font-mono" : ""}`}>
      {value}
    </span>
  );
}
