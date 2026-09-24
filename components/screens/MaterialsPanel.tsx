"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useConsole } from "@/lib/console-data";
import { type Candidate, type CandidateMaterial, type MaterialKind, stillHeld } from "@/lib/types";

/** Stands in for "they have none of these", so the count has one shape. */
const NOTHING = { issued_count: 0, returned_count: 0, written_off_count: 0 } as CandidateMaterial;

/**
 * What one candidate is holding.
 *
 * Two shapes for the two ends of the day. At the desk it is a row of chips to
 * tap while you hand things over — small, because the desk is issuing two or
 * three things, not reading a list. At sign-out it is a list to count back in,
 * where every line has to be looked at and cleared.
 */
export function MaterialsPanel({
  candidate,
  mode,
}: {
  candidate: Candidate;
  mode: "issue" | "collect";
}) {
  const { materials, materialKinds, rpc, canFrontOffice } = useConsole();
  const [writingOff, setWritingOff] = useState<CandidateMaterial | null>(null);

  const mine = materials.filter((m) => m.candidate_id === candidate.id);

  const issue = (kind: MaterialKind) =>
    rpc(
      "fets_issue_material",
      { p_candidate: candidate.id, p_kind: kind.code, p_count: 1 },
      `1 ${kind.label.toLowerCase()} issued`,
    );

  const takeOneBack = (kind: MaterialKind) =>
    rpc(
      "fets_return_material",
      { p_candidate: candidate.id, p_kind: kind.code, p_count: 1 },
      `1 ${kind.label.toLowerCase()} back`,
    );

  if (mode === "issue") {
    return (
      <div className="flex flex-wrap gap-[7px]">
        {/* Only what the centre still hands out. A retired kind stays in the
            collect list below, because somebody may still be holding one. */}
        {materialKinds.filter((k) => k.active).map((kind) => {
          const out = stillHeld(mine.find((m) => m.kind === kind.code) ?? NOTHING);

          return (
            <span
              key={kind.code}
              className={`inline-flex items-stretch overflow-hidden rounded-[12px] border ${
                out > 0 ? "border-gold/50 bg-gold/10" : "border-edge bg-panel-soft"
              }`}
            >
              <button
                type="button"
                disabled={!canFrontOffice}
                onClick={() => issue(kind)}
                aria-label={`Issue one ${kind.label}`}
                className="flex cursor-pointer items-center gap-[8px] px-[12px] py-[9px] text-[12.5px] font-semibold hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>{kind.label}</span>
                <span
                  className={`font-mono text-[12px] ${out > 0 ? "text-gold-bright" : "text-fg-faint"}`}
                >
                  {out > 0 ? `+${out}` : "+"}
                </span>
              </button>

              {out > 0 && (
                <button
                  type="button"
                  disabled={!canFrontOffice}
                  onClick={() => takeOneBack(kind)}
                  aria-label={`Take back one ${kind.label}`}
                  className="cursor-pointer border-l border-gold/30 px-[10px] text-[15px] leading-none font-semibold text-fg-muted hover:bg-panel disabled:cursor-not-allowed disabled:opacity-40"
                >
                  −
                </button>
              )}
            </span>
          );
        })}
      </div>
    );
  }

  const lines = mine
    .map((row) => ({ kind: materialKinds.find((k) => k.code === row.kind), row }))
    .filter((l): l is { kind: MaterialKind; row: CandidateMaterial } => !!l.kind)
    .sort((a, b) => a.kind.sort_order - b.kind.sort_order);

  if (lines.length === 0) {
    return (
      <p className="rounded-[14px] border border-edge bg-panel-soft px-[14px] py-[13px] font-mono text-[11.5px] text-fg-faint">
        Nothing was issued to them.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-[8px]">
        {lines.map(({ kind, row }) => {
          const out = stillHeld(row);
          // Only a returnable thing is still being chased. Water shows its
          // count so the stock is known, but it never holds anybody up.
          const chasing = kind.returnable && out > 0;

          return (
            <div
              key={row.id}
              className={`flex items-center gap-[10px] rounded-[14px] border px-[13px] py-[10px] ${
                chasing
                  ? "border-gold/40 bg-gold/8"
                  : kind.returnable
                    ? "border-mint/30 bg-mint/6"
                    : "border-edge bg-panel-soft"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">
                  {row.label || kind.label}
                </span>
                <span className="block truncate font-mono text-[10.5px] text-fg-faint">
                  {`${row.issued_count} issued` +
                    (row.returned_count ? ` · ${row.returned_count} back` : "") +
                    (row.written_off_count ? ` · ${row.written_off_count} written off` : "") +
                    (kind.returnable ? "" : " · not collected back")}
                </span>
              </span>

              <span
                className={`w-[28px] shrink-0 text-right font-mono text-[15px] font-semibold ${
                  chasing ? "text-gold-bright" : "text-fg-faint"
                }`}
              >
                {out}
              </span>

              {chasing && (
                <>
                  <button
                    type="button"
                    disabled={!canFrontOffice}
                    onClick={() => takeOneBack(kind)}
                    aria-label={`Take back one ${kind.label}`}
                    className="h-[34px] w-[34px] shrink-0 cursor-pointer rounded-[11px] border border-edge-warm text-[17px] leading-none font-semibold text-fg-muted hover:bg-panel disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    disabled={!canFrontOffice}
                    onClick={() =>
                      rpc(
                        "fets_return_material",
                        { p_candidate: candidate.id, p_kind: kind.code },
                        `${kind.label} all back`,
                      )
                    }
                    className="shrink-0 cursor-pointer rounded-[11px] bg-[linear-gradient(145deg,oklch(0.83_0.16_158),oklch(0.72_0.15_165))] px-[13px] py-[9px] text-[12.5px] font-bold text-[#0c1711] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    All back
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Written off is the way past a sign-out that would otherwise never
          happen, so it is offered here rather than left for somebody to find. */}
      {canFrontOffice && lines.some(({ kind, row }) => kind.returnable && stillHeld(row) > 0) && (
        <div className="mt-[10px] flex flex-wrap gap-[8px]">
          {lines
            .filter(({ kind, row }) => kind.returnable && stillHeld(row) > 0)
            .map(({ kind, row }) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setWritingOff(row)}
                className="cursor-pointer rounded-[11px] border border-edge px-[12px] py-[9px] text-[11.5px] font-semibold text-fg-faint hover:border-rust/50 hover:text-rust"
              >
                {row.label || kind.label} is not coming back
              </button>
            ))}
        </div>
      )}

      {writingOff && <WriteOffDialog material={writingOff} onClose={() => setWritingOff(null)} />}
    </>
  );
}

/** Says out loud that something has gone missing, which files the incident. */
function WriteOffDialog({
  material,
  onClose,
}: {
  material: CandidateMaterial;
  onClose: () => void;
}) {
  const { materialKinds, rpc } = useConsole();
  const [reason, setReason] = useState("");
  const kind = materialKinds.find((k) => k.code === material.kind);

  return (
    <Dialog
      open
      title="Not coming back"
      subtitle={`${stillHeld(material)} × ${material.label || kind?.label || material.kind} — this files a reportable incident`}
      onClose={onClose}
      width={440}
      footer={
        <>
          <button
            type="button"
            disabled={reason.trim().length === 0}
            onClick={async () => {
              const ok = await rpc(
                "fets_write_off_material",
                { p_material: material.id, p_reason: reason.trim() },
                "Written off, and an incident logged",
              );
              if (ok) onClose();
            }}
            className="flex-1 cursor-pointer rounded-[14px] bg-rust px-[20px] py-[14px] text-[14px] font-bold text-[#1a0f0b] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Write it off
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[14px] border border-edge px-[18px] py-[14px] text-[13.5px] font-semibold text-fg-muted"
          >
            Cancel
          </button>
        </>
      }
    >
      <label className="block">
        <span className="mb-[7px] block text-[11px] font-bold tracking-[0.12em] text-fg-faint uppercase">
          What happened to it
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Candidate left with it before the desk noticed"
          className="w-full resize-none rounded-[13px] border border-edge-strong bg-panel-soft px-[13px] py-[11px] text-[14px] outline-none placeholder:text-fg-faint focus:border-accent/50"
        />
      </label>
    </Dialog>
  );
}
