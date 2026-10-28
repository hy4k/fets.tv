"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { TwinBadge } from "@/components/console/NameTwin";
import { Dialog } from "@/components/ui/Dialog";
import { FinishDialog } from "@/components/screens/FinishDialog";
import { PlanCanvas, PlanItemView, SeatTile, type SeatState } from "@/components/screens/FloorPlan";
import { completePlan, readPlan, turnPlan } from "@/lib/floor-plan";
import { useConsole } from "@/lib/console-data";
import { clock24, clockAt, fullName, instantFromZonedTime, refOf } from "@/lib/format";
import { currentSection, sectionsFor, type SectionView } from "@/lib/sections";
import { useNow } from "@/lib/use-clock";
import { seatName, seatNumber } from "@/lib/seats";
import { countdown, liquid } from "@/lib/floor-look";
import type {
  Candidate,
  CandidateBreak,
  ExamProgramme,
  Lab,
  Workstation,
} from "@/lib/types";

/** "6:04" — minutes and seconds away, for a break running now. */
function awayClock(startedAt: string, now: number) {
  const s = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 1000),
  );
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export type Seated = {
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
    labs,
  } = useConsole();
  // The floor plan is the Lab page; the list stays one tap away.
  const [view, setView] = useState<"plan" | "list">("plan");
  const [openSeatId, setOpenSeatId] = useState<string | null>(null);
  const now = useNow();
  const [editing, setEditing] = useState<Seated | null>(null);
  const [moving, setMoving] = useState<Seated | null>(null);
  // Held by id, not by value: rpc() refreshes and rebuilds these rows, and a
  // dialog left holding the old object would keep offering an action that has
  // already happened.
  const [partsId, setPartsId] = useState<string | null>(null);
  const [finishingId, setFinishingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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

  // The same search as the check-in list, plus the seat and the exam, so a
  // name called out across the room can be found among twenty-five tubes.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return seated;
    return seated.filter(
      ({ candidate: c, seat, programme }) =>
        fullName(c).toLowerCase().includes(q) ||
        c.roster_number.toLowerCase().includes(q) ||
        c.public_token.toLowerCase().includes(q) ||
        (c.phone ?? "").includes(q) ||
        (c.locker_key ?? "").toLowerCase().includes(q) ||
        seatName(seat).toLowerCase().includes(q) ||
        (programme?.name ?? c.live_exam_name ?? "").toLowerCase().includes(q),
    );
  }, [seated, query]);

  const partsRow = seated.find((s) => s.candidate.id === partsId) ?? null;
  // Held by seat id, so the card follows the refreshed row and closes itself
  // once the seat is no longer taken.
  const openRow = seated.find((s) => s.seat.id === openSeatId) ?? null;
  // Finished but not signed out: from before Finish signed people out, or a
  // sign-out that was held up. They stay here, in the lab, until it is done.
  const toSignOut = candidates
    .filter((c) => c.status === "completed")
    .sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""));
  const finishingSeat = seated.find((s) => s.candidate.id === finishingId)?.seat ?? null;
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
        <div className="flex w-full min-w-0 items-center gap-[10px] rounded-[14px] border border-edge-strong bg-panel-soft px-[14px] py-[11px] md:w-[320px]">
          <span className="font-mono text-[14px] text-fg-dim">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name · confirmation no · seat · exam"
            aria-label="Search the candidates on the floor"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] outline-none placeholder:text-fg-faint"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear the search"
              className="cursor-pointer text-[13px] text-fg-faint hover:text-fg"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <IncidentStrip />

      {toSignOut.length > 0 && (
        <section className="shrink-0 overflow-hidden rounded-[20px] border border-gold/30 bg-gold/[0.04]">
          <div className="flex items-center gap-[10px] border-b border-gold/20 px-[16px] py-[10px]">
            <span className="text-[11px] font-bold tracking-[0.12em] text-gold-bright uppercase">
              Finished · sign out
            </span>
            <span className="font-mono text-[12px] text-fg-faint">{toSignOut.length}</span>
            <span className="ml-auto font-mono text-[10.5px] text-fg-faint">
              Their locker key frees once they are signed out
            </span>
          </div>
          {toSignOut.map((c) => (
            <div key={c.id} className="flex items-center gap-[12px] border-b border-white/[0.05] px-[16px] py-[10px] last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{fullName(c)}</span>
                <span className="block truncate font-mono text-[11px] text-fg-faint">
                  {[refOf(c), c.locker_key === "NIL" ? "Locker Nil" : c.locker_key && `Locker ${c.locker_key}`, c.completed_at && `finished ${clockAt(c.completed_at, center.timezone)}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <button
                type="button"
                disabled={!canLab}
                onClick={() => setFinishingId(c.id)}
                className="shrink-0 cursor-pointer rounded-full border border-white/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(226,220,205,0.85))] px-[16px] py-[7px] text-[12px] font-bold text-[#17151a] disabled:cursor-not-allowed disabled:opacity-30"
              >
                Sign out
              </button>
            </div>
          ))}
        </section>
      )}

      <div className="flex shrink-0 items-center gap-[6px] px-[4px]">
        {(["plan", "list"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`cursor-pointer rounded-full px-[14px] py-[7px] text-[12px] font-semibold ${
              view === v ? "bg-white/[0.12] text-fg" : "text-fg-faint hover:text-fg"
            }`}
          >
            {v === "plan" ? "Floor plan" : "List"}
          </button>
        ))}
      </div>

      {view === "plan" ? (
        <LabFloors
          labs={labs}
          workstations={workstations}
          seated={seated}
          query={query}
          now={now}
          onOpen={(id) => setOpenSeatId(id)}
        />
      ) : seated.length === 0 ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-[10px] rounded-[28px] border border-white/[0.07] bg-white/[0.02] p-[30px] text-center">
          <span className="font-display text-[28px] font-light">
            The floor is quiet
          </span>
          <span className="max-w-[44ch] text-[13px] text-fg-faint">
            Assigning a seat on the Admin page starts a candidate&rsquo;s clock,
            and they appear here.
          </span>
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-[20px] border border-white/[0.07] bg-white/[0.02] p-[28px] text-center text-[13px] text-fg-faint">
          Nobody on the floor matches &ldquo;{query}&rdquo;
        </p>
      ) : (
        <div className="grid shrink-0 grid-cols-1 gap-[12px] 2xl:grid-cols-2">
          {shown.map((s) => (
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
              onFinish={() => setFinishingId(s.candidate.id)}
            />
          ))}
        </div>
      )}

      <p className="shrink-0 px-[4px] font-mono text-[10.5px] text-fg-faint">
        Each tube is the sitting in tenths. The clock is an estimate and keeps
        running through breaks; the exam software is authoritative, and nobody
        is finished until somebody presses Finish. Finish is also the sign-out:
        collect what they were given and their locker key, and the key goes
        free for the next candidate.
      </p>

      {openRow && (
        <Dialog
          open
          title={seatName(openRow.seat)}
          onClose={() => setOpenSeatId(null)}
          width={760}
        >
          <FloorCard
            row={openRow}
            now={now}
            canLab={canLab}
            timezone={center.timezone}
            rpc={rpc}
            onEdit={() => {
              setOpenSeatId(null);
              setEditing(openRow);
            }}
            onMove={() => {
              setOpenSeatId(null);
              setMoving(openRow);
            }}
            onParts={() => {
              setOpenSeatId(null);
              setPartsId(openRow.candidate.id);
            }}
            onFinish={() => {
              setOpenSeatId(null);
              setFinishingId(openRow.candidate.id);
            }}
          />
        </Dialog>
      )}

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

      {finishingId && (
        <FinishDialog
          key={finishingId}
          candidateId={finishingId}
          where="in the lab"
          seat={finishingSeat ? seatName(finishingSeat) : null}
          onClose={() => setFinishingId(null)}
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
  onFinish,
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
  onFinish: () => void;
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
          {seatName(seat)}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-display text-[22px] leading-[1.05]">
            {fullName(candidate)}
          </span>
          <span className="mt-[2px] flex min-w-0 items-center gap-[7px]">
            <TwinBadge candidate={candidate} />
            <span className="truncate font-mono text-[10.5px] text-fg-faint">
              {[
                refOf(candidate),
                programme?.code ?? candidate.live_exam_name ?? "Exam not set",
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
            onClick={onFinish}
            title="Stop the clock, collect what they hold and the locker key, and sign them out"
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
    clock24(candidate.exam_started_at, center.timezone),
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
      subtitle={`${fullName(candidate)} · ${seatName(seat)}`}
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
      `${refOf(candidate)} moved to ${seatName(chosen)}`,
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      title="Move them to another machine"
      subtitle={`${fullName(candidate)} · currently at ${seatName(seat)}`}
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
                ? `Move to ${seatName(chosen)}`
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
                      {seatNumber(w)}
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
              Take {seatName(seat)} out of service
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

/** Whether the screen is wide enough to read a tall room turned on its side. */
function useWide() {
  return useSyncExternalStore(
    (on) => {
      const m = window.matchMedia("(min-width: 900px)");
      m.addEventListener("change", on);
      return () => m.removeEventListener("change", on);
    },
    () => window.matchMedia("(min-width: 900px)").matches,
    () => true,
  );
}

/**
 * Every lab drawn as it stands, one after another in the order of Setup. A tall
 * narrow room is turned on its side on a wide screen so its desks are big
 * enough to read; "Turn" flips that by hand. Searching dims every desk but the
 * ones that match.
 */
function LabFloors({
  labs,
  workstations,
  seated,
  query,
  now,
  onOpen,
}: {
  labs: Lab[];
  workstations: Workstation[];
  seated: Seated[];
  query: string;
  now: number;
  onOpen: (seatId: string) => void;
}) {
  const wide = useWide();
  const [flip, setFlip] = useState(false);
  const bySeat = useMemo(() => new Map(seated.map((s) => [s.seat.id, s])), [seated]);
  const q = query.trim().toLowerCase();

  const stateOf = (s: Seated): SeatState => {
    const started = s.candidate.exam_started_at ? new Date(s.candidate.exam_started_at).getTime() : null;
    const length = (s.candidate.exam_duration_minutes ?? 0) * 60000;
    return {
      name: fullName(s.candidate).split(/\s+/)[0] || refOf(s.candidate),
      remaining: s.remaining,
      progress: started && length > 0 && now > 0 ? Math.min(1, Math.max(0, (now - started) / length)) : 0,
      onBreak: !!s.onBreak,
    };
  };
  const matches = (w: Workstation) => {
    if (!q) return true;
    const s = bySeat.get(w.id);
    return (
      seatNumber(w).toLowerCase() === q ||
      (!!s &&
        (fullName(s.candidate).toLowerCase().includes(q) ||
          s.candidate.roster_number.toLowerCase().includes(q) ||
          (s.programme?.name ?? s.candidate.live_exam_name ?? "").toLowerCase().includes(q)))
    );
  };

  const floors = labs
    .map((lab) => {
      const seats = workstations
        .filter((w) => w.lab_id === lab.id)
        .sort((a, b) => a.seat_code.localeCompare(b.seat_code, undefined, { numeric: true }));
      return { lab, seats };
    })
    .filter((f) => f.seats.length > 0);

  if (floors.length === 0) {
    return (
      <p className="rounded-[20px] border border-white/[0.07] bg-white/[0.02] p-[28px] text-center text-[13px] text-fg-faint">
        No labs are set up yet. Add them in Settings → Labs and seats.
      </p>
    );
  }

  return (
    <div className="flex shrink-0 flex-col gap-[14px]">
      {floors.map(({ lab, seats }) => {
        const drawn = completePlan(readPlan(lab.plan), seats.map((w) => w.id));
        const tall = drawn.h > drawn.w * 1.3;
        const turned = (tall && wide) !== flip;
        const plan = turned ? turnPlan(drawn) : drawn;
        const taken = seats.filter((w) => bySeat.has(w.id)).length;
        const byId = new Map(seats.map((w) => [w.id, w]));
        return (
          <section
            key={lab.id}
            className="rounded-[26px] border border-white/[0.07] bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] p-[14px] md:p-[18px]"
          >
            <div className="mb-[10px] flex flex-wrap items-center gap-x-[12px] gap-y-[6px]">
              <span className="font-display text-[22px] leading-none font-light">{lab.name}</span>
              <span className="font-mono text-[12px] text-fg-faint">
                {taken} testing · {seats.length - taken} free
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setFlip(!flip)}
                className="cursor-pointer rounded-full border border-white/10 px-[12px] py-[5px] text-[11.5px] font-semibold text-fg-muted hover:text-fg"
                title="Turn the plan a quarter round"
              >
                ⟲ Turn
              </button>
            </div>
            <PlanCanvas plan={plan}>
              {plan.items.map((item, i) => (
                <PlanItemView key={`item-${i}`} item={item} />
              ))}
              {Object.entries(plan.seats).map(([id, p]) => {
                const w = byId.get(id);
                if (!w) return null;
                const s = bySeat.get(id);
                return (
                  <SeatTile
                    key={id}
                    ws={w}
                    x={p.x}
                    y={p.y}
                    facing={p.f}
                    state={s ? stateOf(s) : null}
                    dimmed={!matches(w)}
                    onPick={s ? () => onOpen(id) : undefined}
                  />
                );
              })}
            </PlanCanvas>
          </section>
        );
      })}
      <p className="px-[4px] font-mono text-[10.5px] text-fg-faint">
        The ring round each taken desk is the time left: champagne, amber in the last quarter hour, coral once
        past time, pearl on a break. Tap a taken desk for Break, Move and Finish. Arrange the plan and the
        desk numbers in Settings → Labs and seats.
      </p>
    </div>
  );
}

/**
 * Open incidents, always in sight at the top of the floor: what is wrong, where,
 * and for how long. Logging and resolving stay on the Incidents page, one tap
 * away, so the floor plan keeps its room.
 */
function IncidentStrip() {
  const { incidents, workstations } = useConsole();
  const now = useNow();
  const open = incidents
    .filter((i) => !i.resolved_at)
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  const seat = (id: string | null) => {
    const w = id ? workstations.find((x) => x.id === id) : null;
    return w ? seatName(w) : null;
  };
  const mins = (iso: string) => Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));

  return (
    <section
      className={`flex shrink-0 flex-wrap items-center gap-[8px] rounded-[16px] border px-[12px] py-[8px] ${
        open.length ? "border-rust/45 bg-rust/[0.07]" : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      <span className={`text-[11px] font-bold tracking-[0.12em] uppercase ${open.length ? "text-rust" : "text-fg-faint"}`}>
        {open.length ? `${open.length} open incident${open.length === 1 ? "" : "s"}` : "No open incidents"}
      </span>
      {open.slice(0, 4).map((i) => (
        <Link
          key={i.id}
          href="/incidents"
          className="flex max-w-[320px] items-center gap-[6px] rounded-full border border-rust/40 bg-ink/50 px-[10px] py-[3px] text-[12px] hover:border-rust"
        >
          <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${i.severity === "critical" ? "bg-rust" : i.severity === "major" ? "bg-gold" : "bg-fg-faint"}`} />
          <span className="truncate">{i.summary}</span>
          <span className="shrink-0 font-mono text-[10.5px] text-fg-faint">
            {[seat(i.workstation_id), `${mins(i.started_at)} min`].filter(Boolean).join(" · ")}
          </span>
        </Link>
      ))}
      {open.length > 4 && <span className="font-mono text-[11px] text-fg-faint">+{open.length - 4} more</span>}
      <span className="flex-1" />
      <Link
        href="/incidents"
        className="rounded-[11px] border border-edge-warm px-[12px] py-[6px] text-[12px] font-semibold text-fg-muted hover:text-fg"
      >
        {open.length ? "Open incidents" : "Report an incident"}
      </Link>
    </section>
  );
}
