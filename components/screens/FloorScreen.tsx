"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useConsole } from "@/lib/console-data";
import { clockAt, fullName, instantFromZonedTime, refOf } from "@/lib/format";
import { currentSection, sectionsFor, type SectionView } from "@/lib/sections";
import { useNow } from "@/lib/use-clock";
import type {
  Candidate,
  CandidateBreak,
  ExamProgramme,
  Workstation,
} from "@/lib/types";

function countdown(msRemaining: number) {
  const over = msRemaining <= 0;
  const total = Math.floor(Math.abs(msRemaining) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const body = h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m}m`;
  return over ? `+${body}` : body;
}

/** "6:04" — minutes and seconds away, for a break running now. */
function awayClock(startedAt: string, now: number) {
  const s = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 1000),
  );
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The liquid in each tube. One calm champagne for most of the sitting, warming
 * to amber in the last quarter hour and to a soft coral once past time; a break
 * turns it to frosted pearl. No traffic-light red and green.
 */
function liquid(remaining: number, onBreak: boolean) {
  if (onBreak)
    return {
      fill: "linear-gradient(90deg, oklch(0.78 0.04 290), oklch(0.9 0.03 300))",
      glow: "oklch(0.8 0.06 295 / 0.45)",
      text: "text-[oklch(0.88_0.05_300)]",
    };
  const minutes = remaining / 60000;
  if (minutes <= 0)
    return {
      fill: "linear-gradient(90deg, oklch(0.62 0.13 25), oklch(0.76 0.12 35))",
      glow: "oklch(0.7 0.14 30 / 0.5)",
      text: "text-[oklch(0.8_0.12_35)]",
    };
  if (minutes <= 15)
    return {
      fill: "linear-gradient(90deg, oklch(0.7 0.13 60), oklch(0.85 0.12 78))",
      glow: "oklch(0.8 0.13 70 / 0.45)",
      text: "text-[oklch(0.87_0.11_78)]",
    };
  return {
    fill: "linear-gradient(90deg, oklch(0.72 0.07 75), oklch(0.93 0.05 90))",
    glow: "oklch(0.9 0.06 85 / 0.35)",
    text: "text-[oklch(0.93_0.04_90)]",
  };
}

type Seated = {
  seat: Workstation;
  candidate: Candidate;
  programme: ExamProgramme | null;
  onBreak: CandidateBreak | null;
  remaining: number;
  sections: SectionView[];
};

/**
 * The floor while it is running. Twenty-five people at once will not fit as
 * cards, so each one is a line: seat, who, how long left, and the two buttons
 * that matter. What needs attention is lifted out of the list and put across
 * the top, where it cannot be scrolled past.
 */
export function FloorScreen() {
  const {
    candidates,
    workstations,
    programmes,
    programmeSections,
    candidateSections,
    openBreaks,
    center,
    rpc,
    canLab,
  } = useConsole();
  const now = useNow();
  const [editing, setEditing] = useState<Seated | null>(null);
  const [moving, setMoving] = useState<Seated | null>(null);
  // Held by id, not by value: rpc() refreshes and rebuilds these rows, and a
  // dialog left holding the old object would keep offering an action that has
  // already happened.
  const [partsId, setPartsId] = useState<string | null>(null);

  const seatById = useMemo(
    () => new Map(workstations.map((w) => [w.id, w])),
    [workstations],
  );

  const seated: Seated[] = useMemo(
    () =>
      candidates
        .filter(
          (c) =>
            c.workstation_id &&
            seatById.has(c.workstation_id) &&
            !c.exam_finished_at,
        )
        .map((c) => ({
          seat: seatById.get(c.workstation_id!)!,
          candidate: c,
          programme: programmes.find((p) => p.id === c.programme_id) ?? null,
          onBreak: openBreaks.find((b) => b.candidate_id === c.id) ?? null,
          remaining: c.exam_expected_end
            ? new Date(c.exam_expected_end).getTime() - now
            : Infinity,
          sections: sectionsFor(
            c,
            programmeSections.filter((s) => s.programme_id === c.programme_id),
            candidateSections,
          ),
        }))
        .sort((a, b) => a.remaining - b.remaining),
    [
      candidates,
      seatById,
      programmes,
      programmeSections,
      candidateSections,
      openBreaks,
      now,
    ],
  );

  const partsRow = seated.find((s) => s.candidate.id === partsId) ?? null;
  const free = workstations.filter(
    (w) => w.lab_id && w.status === "free",
  ).length;
  const away = seated.filter((s) => s.onBreak).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto pb-[8px]">
      <div className="flex shrink-0 flex-wrap items-center gap-x-[14px] gap-y-[8px] px-[4px]">
        <span className="font-display text-[30px] leading-none font-light">
          On the floor
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-[12px] py-[5px] font-mono text-[12px] text-fg-muted">
          {seated.length} testing
        </span>
        {away > 0 && (
          <span className="flex items-center gap-[7px] rounded-full border border-[oklch(0.8_0.06_295/0.35)] bg-[oklch(0.8_0.06_295/0.1)] px-[12px] py-[5px] font-mono text-[12px] text-[oklch(0.88_0.05_300)]">
            <span className="h-[6px] w-[6px] animate-pulse rounded-full bg-[oklch(0.88_0.05_300)]" />
            {away} on break
          </span>
        )}
        <span className="h-px min-w-[12px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
        <span className="font-mono text-[12px] text-fg-faint">
          {free} seats free
        </span>
      </div>

      {seated.length === 0 ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-[10px] rounded-[28px] border border-white/[0.07] bg-white/[0.02] p-[30px] text-center">
          <span className="font-display text-[28px] font-light">
            The floor is quiet
          </span>
          <span className="max-w-[44ch] text-[13px] text-fg-faint">
            Assigning a seat on the Admin page starts a candidate&rsquo;s clock,
            and they appear here.
          </span>
        </div>
      ) : (
        <div className="grid shrink-0 grid-cols-1 gap-[12px] 2xl:grid-cols-2">
          {seated.map((s) => (
            <FloorCard
              key={s.seat.id}
              row={s}
              now={now}
              canLab={canLab}
              timezone={center.timezone}
              rpc={rpc}
              onEdit={() => setEditing(s)}
              onMove={() => setMoving(s)}
              onParts={() => setPartsId(s.candidate.id)}
            />
          ))}
        </div>
      )}

      <p className="shrink-0 px-[4px] font-mono text-[10.5px] text-fg-faint">
        Each tube is the sitting in tenths. The clock is an estimate and keeps
        running through breaks; the exam software is authoritative, and nobody
        is finished until somebody presses Finish.
      </p>

      {editing && (
        <AdjustDialog
          key={editing.candidate.id}
          row={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {moving && (
        <TransferDialog
          key={moving.candidate.id}
          row={moving}
          onClose={() => setMoving(null)}
        />
      )}

      {partsRow && (
        <SectionsDialog
          key={partsRow.candidate.id}
          row={partsRow}
          onClose={() => setPartsId(null)}
        />
      )}
    </div>
  );
}

/**
 * One candidate on the floor: who and where, then the sitting as a glass tube
 * in ten parts filling from the left, and the three things staff do.
 */
function FloorCard({
  row,
  now,
  canLab,
  timezone,
  rpc,
  onEdit,
  onMove,
  onParts,
}: {
  row: Seated;
  now: number;
  canLab: boolean;
  timezone: string;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
    ok?: string,
  ) => Promise<boolean>;
  onEdit: () => void;
  onMove: () => void;
  onParts: () => void;
}) {
  const { seat, candidate, programme, onBreak, remaining, sections } = row;
  const part = currentSection(sections, now);
  const look = liquid(remaining, !!onBreak);

  const started = candidate.exam_started_at
    ? new Date(candidate.exam_started_at).getTime()
    : null;
  const length = (candidate.exam_duration_minutes ?? 0) * 60000;
  const progress =
    started && length > 0 && now > 0
      ? Math.min(1, Math.max(0, (now - started) / length))
      : 0;
  const breakAt =
    onBreak && started && length > 0
      ? Math.min(
          1,
          Math.max(
            0,
            (new Date(onBreak.started_at).getTime() - started) / length,
          ),
        )
      : null;

  return (
    <article className="group relative overflow-hidden rounded-[26px] border border-white/[0.08] bg-[linear-gradient(160deg,rgba(255,255,255,0.055),rgba(255,255,255,0.012))] p-[16px] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_24px_48px_-28px_rgba(0,0,0,0.8)] backdrop-blur-xl md:px-[20px]">
      {/* A soft light behind the glass, in the tube's own colour. */}
      <div
        className="pointer-events-none absolute -top-[70px] right-[8%] h-[140px] w-[260px] rounded-full opacity-60 blur-[60px]"
        style={{ background: look.glow }}
      />

      <div className="relative flex flex-wrap items-center gap-x-[14px] gap-y-[8px]">
        <span className="rounded-[12px] border border-white/10 bg-white/[0.05] px-[11px] py-[6px] font-mono text-[12.5px] font-semibold tracking-[0.04em] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
          {seat.seat_code}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-display text-[22px] leading-[1.05]">
            {fullName(candidate)}
          </span>
          <span className="mt-[2px] flex min-w-0 items-center gap-[7px]">
            <span className="truncate font-mono text-[10.5px] text-fg-faint">
              {[
                refOf(candidate),
                programme?.code,
                `${candidate.exam_duration_minutes ?? "?"} min`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {/* Which part they are in: filled once somebody confirmed it. */}
            {sections.length > 0 && (
              <button
                type="button"
                onClick={onParts}
                title="The parts of this exam, planned against what happened"
                className={`shrink-0 cursor-pointer rounded-full px-[8px] py-[1px] font-mono text-[9.5px] font-semibold whitespace-nowrap ${
                  part?.confirmed
                    ? "bg-white/15 text-fg"
                    : "border border-white/15 text-fg-dim hover:bg-white/[0.06]"
                }`}
              >
                {part
                  ? `${part.section.name}${part.confirmed ? "" : "?"}`
                  : "parts"}
              </button>
            )}
          </span>
        </span>

        {onBreak && <BreakPill startedAt={onBreak.started_at} now={now} />}

        <span className="flex-1" />

        <button
          type="button"
          onClick={onEdit}
          title="Correct the start time or length"
          className="cursor-pointer text-right"
        >
          <span
            className={`block font-mono text-[26px] leading-none font-medium tabular-nums ${look.text}`}
          >
            {Number.isFinite(remaining) ? countdown(remaining) : "—"}
          </span>
          <span className="mt-[3px] block font-mono text-[10px] tracking-[0.1em] text-fg-faint uppercase">
            {remaining <= 0 ? "past time" : "left"} · ends{" "}
            {clockAt(candidate.exam_expected_end, timezone)}
          </span>
        </button>
      </div>

      <div className="relative mt-[12px] flex flex-col gap-[10px] md:flex-row md:items-center md:gap-[14px]">
        <div className="min-w-0 flex-1">
          <GlassTube
            progress={progress}
            fill={look.fill}
            glow={look.glow}
            breakAt={breakAt}
            paused={!!onBreak}
          />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-[7px]">
          {onBreak ? (
            <button
              type="button"
              disabled={!canLab}
              onClick={() =>
                rpc(
                  "fets_break_in",
                  { p_candidate: candidate.id },
                  `${refOf(candidate)} is back from break`,
                )
              }
              className="flex cursor-pointer items-center gap-[8px] rounded-full border border-[oklch(0.85_0.05_300/0.45)] bg-[linear-gradient(180deg,oklch(0.85_0.05_300/0.28),oklch(0.7_0.05_300/0.12))] px-[16px] py-[8px] text-[12px] font-semibold text-[oklch(0.93_0.03_300)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_8px_24px_-10px_oklch(0.8_0.06_295/0.6)] disabled:opacity-40"
            >
              <span className="text-[13px]">↩</span> End break
            </button>
          ) : (
            <GlassButton
              disabled={!canLab}
              onClick={() =>
                rpc(
                  "fets_break_out",
                  { p_candidate: candidate.id, p_kind: "scheduled" },
                  `${refOf(candidate)} on break`,
                )
              }
            >
              Break
            </GlassButton>
          )}
          <GlassButton
            disabled={!canLab}
            onClick={onMove}
            title="Move them to another machine, carrying the sitting across"
          >
            Move
          </GlassButton>
          <button
            type="button"
            disabled={!canLab || !!onBreak}
            onClick={() =>
              rpc(
                "fets_confirm_finish",
                { p_candidate: candidate.id },
                `${refOf(candidate)} finished`,
              )
            }
            className="cursor-pointer rounded-full border border-white/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(226,220,205,0.85))] px-[18px] py-[8px] text-[12px] font-bold text-[#17151a] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_22px_-10px_rgba(255,240,210,0.5)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            Finish
          </button>
        </div>
      </div>
    </article>
  );
}

function GlassButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="cursor-pointer rounded-full border border-white/12 bg-white/[0.05] px-[16px] py-[8px] text-[12px] font-semibold text-fg-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-colors hover:bg-white/[0.1] hover:text-fg disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** A break running now: a frosted pill with a live minutes-and-seconds clock. */
function BreakPill({ startedAt, now }: { startedAt: string; now: number }) {
  return (
    <span className="flex items-center gap-[9px] rounded-full border border-[oklch(0.85_0.05_300/0.4)] bg-[linear-gradient(180deg,oklch(0.85_0.05_300/0.2),oklch(0.6_0.05_300/0.08))] py-[5px] pr-[12px] pl-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_6px_20px_-8px_oklch(0.8_0.06_295/0.55)] backdrop-blur-md">
      <span className="relative flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[oklch(0.88_0.05_300/0.25)]">
        <span className="absolute inset-0 animate-ping rounded-full bg-[oklch(0.88_0.05_300/0.35)] motion-reduce:animate-none" />
        <span className="relative h-[7px] w-[7px] rounded-full bg-[oklch(0.94_0.03_300)]" />
      </span>
      <span className="font-mono text-[10px] font-bold tracking-[0.16em] text-[oklch(0.9_0.04_300)] uppercase">
        On break
      </span>
      <span className="font-mono text-[13px] font-semibold tabular-nums text-[oklch(0.96_0.02_300)]">
        {now ? awayClock(startedAt, now) : "—"}
      </span>
    </span>
  );
}

/**
 * The sitting as a glass cylinder in ten parts. Each part fills in turn, the
 * one in progress partly; light sits along the top edge and shade along the
 * bottom so it reads as a tube, not a bar. A break marks where it began and
 * frosts the time since.
 */
function GlassTube({
  progress,
  fill,
  glow,
  breakAt,
  paused,
}: {
  progress: number;
  fill: string;
  glow: string;
  breakAt: number | null;
  paused: boolean;
}) {
  return (
    <div className="relative rounded-full border border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.015)_55%,rgba(0,0,0,0.25))] p-[5px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.22),inset_0_-10px_18px_rgba(0,0,0,0.45),0_14px_30px_-16px_rgba(0,0,0,0.9)]">
      <div className="relative flex h-[26px] gap-[4px]">
        {Array.from({ length: 10 }, (_, i) => {
          const f = Math.min(1, Math.max(0, progress * 10 - i));
          const first = i === 0;
          const last = i === 9;
          return (
            <span
              key={i}
              className={`relative flex-1 overflow-hidden bg-[linear-gradient(180deg,rgba(0,0,0,0.35),rgba(255,255,255,0.03))] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] ${
                first ? "rounded-l-full" : "rounded-[5px]"
              } ${last ? "rounded-r-full" : ""}`}
            >
              {f > 0 && (
                <span
                  className="absolute inset-y-0 left-0 transition-[width] duration-1000 ease-out"
                  style={{
                    width: `${f * 100}%`,
                    background: fill,
                    boxShadow: `0 0 14px ${glow}`,
                  }}
                >
                  {/* Light across the top of the liquid, shade beneath it. */}
                  <span className="absolute inset-x-0 top-[2px] h-[38%] rounded-full bg-gradient-to-b from-white/70 to-white/0" />
                  <span className="absolute inset-x-0 bottom-0 h-[35%] bg-gradient-to-t from-black/25 to-transparent" />
                </span>
              )}
            </span>
          );
        })}

        {/* Where the break began, and the frosted time since. */}
        {breakAt !== null && (
          <>
            <span
              className="pointer-events-none absolute inset-y-0 rounded-full bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.22)_0_4px,transparent_4px_9px)] mix-blend-screen"
              style={{
                left: `${breakAt * 100}%`,
                width: `${Math.max(0.6, (progress - breakAt) * 100)}%`,
              }}
            />
            <span
              className="pointer-events-none absolute -top-[9px] -bottom-[9px] w-[2px] rounded-full bg-[oklch(0.94_0.03_300)] shadow-[0_0_10px_oklch(0.85_0.06_300)]"
              style={{ left: `calc(${breakAt * 100}% - 1px)` }}
            />
          </>
        )}
      </div>
      {/* The glass itself: one long highlight along the top of the tube. */}
      <span className="pointer-events-none absolute inset-x-[14px] top-[3px] h-[6px] rounded-full bg-gradient-to-b from-white/35 to-transparent" />
      {paused && <span className="sr-only">Clock running through break</span>}
    </div>
  );
}

/**
 * The parts of one exam, planned against what happened.
 *
 * Two columns, deliberately: what the plan expects, and what somebody saw. The
 * second is only ever filled in by a person — the console will not quietly
 * promote its own estimate into the record, because that record is what the
 * board reads afterwards.
 *
 * "Now" is the common case and costs one tap. The time box is for the honest
 * answer that arrives late: Writing really began at 10:42, not when somebody
 * got back to the desk.
 */
function SectionsDialog({
  row,
  onClose,
}: {
  row: Seated;
  onClose: () => void;
}) {
  const { center, rpc, canLab } = useConsole();
  const { candidate, sections } = row;
  const [at, setAt] = useState("");

  // "10:" and "1" are what a half-typed time looks like, and they turn into an
  // invalid Date. Converting during render would throw and take the page down
  // mid-keystroke, so nothing is converted until the value is a whole time and
  // somebody presses a button.
  const typed = at.trim();
  const usable = /^([01]?\d|2[0-3]):[0-5]\d$/.test(typed);
  const blocked = typed !== "" && !usable;

  const confirm = (position: number) =>
    rpc(
      "fets_confirm_section",
      {
        p_candidate: candidate.id,
        p_position: position,
        p_at: usable
          ? instantFromZonedTime(typed, center.timezone).toISOString()
          : null,
      },
      "Noted",
    );

  return (
    <Dialog
      open
      title={fullName(candidate)}
      subtitle={`${refOf(candidate)} \u00b7 started ${clockAt(candidate.exam_started_at, center.timezone)}`}
      onClose={onClose}
      width={620}
      footer={
        <>
          <label className="flex flex-1 items-center gap-[10px] rounded-[14px] border border-edge-strong bg-panel-soft px-[13px] py-[11px]">
            <span className="shrink-0 text-[11.5px] font-semibold text-fg-faint">
              Mark at
            </span>
            <input
              value={at}
              onChange={(e) => setAt(e.target.value)}
              placeholder="now"
              aria-invalid={blocked}
              className={`w-full min-w-0 border-0 bg-transparent font-mono text-[14px] outline-none placeholder:text-fg-faint ${
                blocked ? "text-rust" : ""
              }`}
            />
            {typed && (
              <button
                type="button"
                onClick={() => setAt("")}
                className="shrink-0 cursor-pointer text-[12px] text-fg-faint hover:text-fg"
              >
                clear
              </button>
            )}
            {blocked && (
              <span className="shrink-0 text-[11px] text-rust">HH:MM</span>
            )}
          </label>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[14px] border border-edge px-[18px] py-[14px] text-[13.5px] font-semibold text-fg-muted"
          >
            Close
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-[7px]">
        {sections.map((v) => {
          const done = v.actualStart !== null;
          const late = v.driftMinutes !== null && Math.abs(v.driftMinutes) >= 2;

          return (
            <div
              key={v.position}
              className={`flex flex-wrap items-center gap-[10px] rounded-[14px] border px-[12px] py-[10px] ${
                done ? "border-gold/40 bg-gold/8" : "border-edge bg-panel-soft"
              }`}
            >
              <span className="w-[20px] shrink-0 text-center font-mono text-[11px] text-fg-faint">
                {v.position}
              </span>

              <span className="min-w-[110px] flex-1">
                <span className="block truncate text-[13.5px] font-semibold">
                  {v.name}
                  {v.kind !== "section" && (
                    <span className="ml-[6px] text-[10.5px] font-normal text-fg-faint">
                      {v.kind}
                    </span>
                  )}
                  {!v.inPlan && (
                    <span className="ml-[6px] text-[10.5px] font-normal text-rust">
                      no longer in the plan
                    </span>
                  )}
                </span>
                <span className="block font-mono text-[10.5px] text-fg-faint">
                  due{" "}
                  {clockAt(
                    new Date(v.estimatedStart).toISOString(),
                    center.timezone,
                  )}{" "}
                  · {v.minutes} min
                </span>
              </span>

              <span className="w-[86px] shrink-0 text-right">
                {done ? (
                  <>
                    <span className="block font-mono text-[13px] font-semibold text-gold-bright">
                      {clockAt(
                        new Date(v.actualStart!).toISOString(),
                        center.timezone,
                      )}
                    </span>
                    <span
                      className={`block font-mono text-[10px] ${late ? "text-rust" : "text-fg-faint"}`}
                    >
                      {v.driftMinutes === 0
                        ? "on time"
                        : v.driftMinutes! > 0
                          ? `${v.driftMinutes} late`
                          : `${-v.driftMinutes!} early`}
                    </span>
                  </>
                ) : (
                  <span className="block font-mono text-[11px] text-fg-faint">
                    not seen
                  </span>
                )}
              </span>

              {done ? (
                <button
                  type="button"
                  disabled={!canLab}
                  onClick={() =>
                    rpc(
                      "fets_clear_section",
                      { p_candidate: candidate.id, p_position: v.position },
                      "Unconfirmed",
                    )
                  }
                  className="shrink-0 cursor-pointer rounded-[10px] border border-edge px-[11px] py-[8px] text-[11.5px] font-semibold text-fg-faint hover:border-rust/50 hover:text-rust disabled:opacity-40"
                >
                  Undo
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canLab || blocked}
                  onClick={() => confirm(v.position)}
                  className="shrink-0 cursor-pointer rounded-[10px] gold-bg px-[13px] py-[8px] text-[11.5px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {usable ? `Started ${typed}` : "Started now"}
                </button>
              )}
            </div>
          );
        })}

        {sections.length === 0 && (
          <p className="rounded-[14px] border border-gold/35 bg-gold/8 p-[13px] text-[12.5px] text-gold">
            This exam has no parts set up yet. Add them under Setup &rsaquo;
            Exams and they will appear here for every candidate sitting it.
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** The clock starts itself now, so this is the correction the user asked for. */
function AdjustDialog({ row, onClose }: { row: Seated; onClose: () => void }) {
  const { center, rpc, notify, canLab } = useConsole();
  const { candidate, seat } = row;

  const [startTime, setStartTime] = useState(() =>
    clockAt(candidate.exam_started_at, center.timezone),
  );
  const [duration, setDuration] = useState(
    String(candidate.exam_duration_minutes ?? 180),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      notify("Write the start time as HH:MM on a 24-hour clock", "error");
      return;
    }
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      notify("Enter a length between 1 and 1440 minutes", "error");
      return;
    }
    if (!reason.trim()) {
      notify(
        "Say why it is being changed — it goes in the audit trail",
        "error",
      );
      return;
    }

    // Typed as the centre's wall clock. A time that lands in the future belongs
    // to yesterday's overnight sitting.
    let startedAt = instantFromZonedTime(startTime, center.timezone);
    if (startedAt.getTime() > Date.now() + 5 * 60000) {
      startedAt = new Date(startedAt.getTime() - 24 * 3600 * 1000);
    }

    setBusy(true);
    const ok = await rpc(
      "fets_adjust_exam",
      {
        p_candidate: candidate.id,
        p_started_at: startedAt.toISOString(),
        p_duration: minutes,
        p_reason: reason.trim(),
      },
      "Clock corrected",
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      title="Correct the clock"
      subtitle={`${fullName(candidate)} · ${seat.seat_code}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            disabled={busy || !canLab}
            onClick={save}
            className="flex-1 cursor-pointer rounded-[14px] gold-bg px-[22px] py-[14px] text-[14px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save the correction"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[14px] border border-edge px-[20px] py-[14px] text-[14px] font-semibold text-fg-muted"
          >
            Cancel
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-[15px]">
        <p className="text-[12.5px] leading-[1.5] text-fg-faint">
          The clock started when this candidate was seated. Change it here if
          they actually started at a different time, or if the exam is a
          different length.
        </p>

        <div className="flex flex-wrap gap-[12px]">
          <label className="flex w-[120px] flex-col gap-[7px]">
            <span className="text-[11.5px] font-semibold text-fg-dim">
              Started at
            </span>
            <input
              inputMode="numeric"
              maxLength={5}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-[12px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] font-mono text-[16px] outline-none focus:border-accent/50"
            />
          </label>
          <label className="flex w-[120px] flex-col gap-[7px]">
            <span className="text-[11.5px] font-semibold text-fg-dim">
              Minutes
            </span>
            <input
              inputMode="numeric"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="rounded-[12px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] font-mono text-[16px] outline-none focus:border-accent/50"
            />
          </label>
        </div>

        <label className="flex flex-col gap-[7px]">
          <span className="text-[11.5px] font-semibold text-fg-dim">
            Why{" "}
            <span className="font-normal text-fg-faint">
              — kept in the audit trail
            </span>
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Started 10 minutes late"
            className="rounded-[12px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] text-[15px] outline-none placeholder:text-fg-faint focus:border-accent/50"
          />
        </label>
      </div>
    </Dialog>
  );
}

/**
 * Moving somebody mid-exam, carrying their sitting with them.
 *
 * Three things have to be true at once and each is easy to forget under
 * pressure: the clock keeps the hour they already sat, the minutes they spent
 * standing about are given back, and the machine that failed does not quietly
 * return to the pool. The form does all three and writes the incident itself.
 */
function TransferDialog({
  row,
  onClose,
}: {
  row: Seated;
  onClose: () => void;
}) {
  const { workstations, labs, rpc, notify, canLab } = useConsole();
  const { candidate, seat } = row;

  const [toSeat, setToSeat] = useState("");
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState("0");
  const [faultOld, setFaultOld] = useState(false);
  const [busy, setBusy] = useState(false);

  const free = useMemo(
    () =>
      workstations
        .filter((w) => w.lab_id && w.status === "free" && w.id !== seat.id)
        .sort((a, b) =>
          a.seat_code.localeCompare(b.seat_code, undefined, { numeric: true }),
        ),
    [workstations, seat.id],
  );

  const byLab = labs.map((lab) => ({
    lab,
    seats: free.filter((w) => w.lab_id === lab.id),
  }));
  const chosen = free.find((w) => w.id === toSeat) ?? null;

  async function move() {
    if (!chosen) return;
    if (!reason.trim()) {
      notify("Say why they are being moved — it goes in the incident", "error");
      return;
    }
    const lost = Number(minutes || "0");
    if (!Number.isInteger(lost) || lost < 0 || lost > 1440) {
      notify("Minutes lost has to be a whole number of minutes", "error");
      return;
    }

    setBusy(true);
    const ok = await rpc(
      "fets_transfer_workstation",
      {
        p_candidate: candidate.id,
        p_to_workstation: chosen.id,
        p_reason: reason,
        p_minutes_lost: lost,
        p_fault_old_seat: faultOld,
      },
      `${refOf(candidate)} moved to ${chosen.seat_code}`,
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      title="Move them to another machine"
      subtitle={`${fullName(candidate)} · currently at ${seat.seat_code}`}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button
            type="button"
            disabled={busy || !chosen || !reason.trim() || !canLab}
            onClick={move}
            className={`flex-1 rounded-[14px] px-[22px] py-[15px] text-[14.5px] font-bold ${
              chosen && reason.trim() && canLab
                ? "cursor-pointer gold-bg text-[#1a1512]"
                : "cursor-not-allowed bg-[#1d1d25] text-fg-dim"
            }`}
          >
            {busy
              ? "Moving…"
              : chosen
                ? `Move to ${chosen.seat_code}`
                : "Pick a machine above"}
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
      <div className="flex flex-col gap-[17px]">
        <p className="text-[12.5px] leading-[1.55] text-fg-faint">
          Their clock keeps the time they have already sat. Whatever you put as
          minutes lost is added on at the end, so they get it back rather than
          losing it.
        </p>

        {free.length === 0 ? (
          <p className="rounded-[14px] border border-rust/40 bg-rust/8 p-[13px] text-[13px] text-rust">
            Every other machine is taken or faulty. Free one first.
          </p>
        ) : (
          byLab
            .filter(({ seats }) => seats.length > 0)
            .map(({ lab, seats }) => (
              <div key={lab.id} className="flex flex-col gap-[8px]">
                <span className="text-[11.5px] font-semibold text-fg-dim">
                  {lab.name} · {seats.length} free
                </span>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-[7px]">
                  {seats.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setToSeat(w.id)}
                      className={`aspect-square rounded-[12px] border font-mono text-[13px] font-semibold ${
                        toSeat === w.id
                          ? "border-mint bg-mint/25 text-mint"
                          : "cursor-pointer border-edge-warm bg-panel-soft text-fg-muted hover:border-gold hover:text-gold-bright"
                      }`}
                    >
                      {w.seat_code.replace(/^.*-/, "")}
                    </button>
                  ))}
                </div>
              </div>
            ))
        )}

        <label className="flex flex-col gap-[7px]">
          <span className="text-[11.5px] font-semibold text-fg-dim">
            Why{" "}
            <span className="font-normal text-fg-faint">
              — this becomes the incident
            </span>
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Machine froze on the reading section"
            className="w-full rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] text-[15px] outline-none placeholder:text-fg-faint focus:border-accent/50"
          />
        </label>

        <label className="flex w-[170px] flex-col gap-[7px]">
          <span className="text-[11.5px] font-semibold text-fg-dim">
            Minutes to give back
          </span>
          <input
            inputMode="numeric"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="rounded-[12px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] font-mono text-[16px] outline-none focus:border-accent/50"
          />
        </label>

        <button
          type="button"
          role="switch"
          aria-checked={faultOld}
          onClick={() => setFaultOld((v) => !v)}
          className="flex cursor-pointer items-center gap-[14px] rounded-[16px] border border-edge bg-panel-soft p-[13px] text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold">
              Take {seat.seat_code} out of service
            </span>
            <span className="mt-[2px] block text-[12px] leading-[1.45] text-fg-faint">
              On by default. A machine that just failed should not be handed to
              the next candidate. Turn it off if the move was for some other
              reason.
            </span>
          </span>
          <span
            className={`flex h-[26px] w-[46px] shrink-0 items-center rounded-full p-[3px] transition-colors ${
              faultOld ? "bg-rust/70" : "bg-[#2a2a34]"
            }`}
          >
            <span
              className={`h-[20px] w-[20px] rounded-full bg-[#111116] transition-transform ${
                faultOld ? "translate-x-[20px]" : ""
              }`}
            />
          </span>
        </button>
      </div>
    </Dialog>
  );
}
