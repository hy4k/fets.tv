"use client";

import type { CSSProperties, ReactNode } from "react";
import { countdown, liquid } from "@/lib/floor-look";
import type { Facing, LabPlan, PlanItem } from "@/lib/floor-plan";
import { seatNumber } from "@/lib/seats";
import type { Workstation } from "@/lib/types";

/** Where something sits on the plan's grid. */
export function cellStyle(x: number, y: number, w = 1, h = 1): CSSProperties {
  return { gridColumn: `${x + 1} / span ${w}`, gridRow: `${y + 1} / span ${h}` };
}

/**
 * The room at its true proportions: a grid of square cells as wide as the
 * screen allows, no taller than `maxHeight`. Children place themselves on it
 * with cellStyle(). With `grid` on, every empty cell is a dotted square that
 * can be pressed — the editor's way of saying "put it here".
 */
export function PlanCanvas({
  plan,
  maxHeight = "72vh",
  grid = false,
  onCell,
  children,
}: {
  plan: LabPlan;
  maxHeight?: string;
  grid?: boolean;
  onCell?: (x: number, y: number) => void;
  children: ReactNode;
}) {
  return (
    <div
      className="relative mx-auto"
      style={{ width: `min(100%, calc(${maxHeight} * ${plan.w} / ${plan.h}))`, aspectRatio: `${plan.w} / ${plan.h}` }}
    >
      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${plan.w}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${plan.h}, minmax(0, 1fr))`,
        }}
      >
        {grid &&
          Array.from({ length: plan.w * plan.h }, (_, i) => {
            const x = i % plan.w;
            const y = Math.floor(i / plan.w);
            return (
              <button
                key={`cell-${x}-${y}`}
                type="button"
                aria-label={`Empty spot, column ${x + 1}, row ${y + 1}`}
                onClick={() => onCell?.(x, y)}
                style={cellStyle(x, y)}
                className="m-[6%] cursor-pointer rounded-[14%] border border-dashed border-white/10 hover:border-accent/50 hover:bg-accent/5"
              />
            );
          })}
        {children}
      </div>
    </div>
  );
}

/**
 * The monitor on the side a seat faces, as on the architect's drawing. It sits
 * just outside the desk's edge, in the gap between desks, so it never covers
 * the name.
 */
function Monitor({ facing, tone }: { facing: Facing; tone: string }) {
  const bar: Record<Facing, CSSProperties> = {
    up: { top: "-9%", left: "24%", right: "24%", height: "6%" },
    down: { bottom: "-9%", left: "24%", right: "24%", height: "6%" },
    left: { left: "-9%", top: "24%", bottom: "24%", width: "6%" },
    right: { right: "-9%", top: "24%", bottom: "24%", width: "6%" },
  };
  return <span aria-hidden className={`absolute rounded-full ${tone}`} style={bar[facing]} />;
}

/** The room's other furniture: the station sign, a pillar, a door. */
export function PlanItemView({ item, selected, onPick }: { item: PlanItem; selected?: boolean; onPick?: () => void }) {
  const ring = selected ? "outline outline-2 outline-accent" : "";
  const Tag = onPick ? "button" : "div";
  if (item.k === "label") {
    return (
      <Tag
        type={onPick ? "button" : undefined}
        onClick={onPick}
        style={cellStyle(item.x, item.y, item.w, item.h)}
        className={`@container flex items-center justify-center rounded-[10px] ${onPick ? "cursor-pointer" : ""} ${ring}`}
      >
        <span className="px-[4%] text-center font-mono text-[clamp(8px,14cqmin,15px)] leading-tight tracking-[0.14em] text-fg-faint uppercase">
          {item.t || "Label"}
        </span>
      </Tag>
    );
  }
  if (item.k === "pillar") {
    return (
      <Tag
        type={onPick ? "button" : undefined}
        onClick={onPick}
        aria-label="Pillar"
        style={cellStyle(item.x, item.y, item.w, item.h)}
        className={`flex items-center justify-center ${onPick ? "cursor-pointer" : ""}`}
      >
        <span className={`block h-[26%] w-[26%] rounded-[3px] bg-[oklch(0.42_0.01_260)] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] ${ring}`} />
      </Tag>
    );
  }
  return (
    <Tag
      type={onPick ? "button" : undefined}
      onClick={onPick}
      aria-label="Door"
      style={cellStyle(item.x, item.y, item.w, item.h)}
      className={`relative ${onPick ? "cursor-pointer" : ""} ${ring}`}
    >
      <span className="absolute inset-x-[12%] top-[4%] h-[8%] rounded-full bg-rust/80" />
      <span className="absolute inset-x-0 top-[16%] text-center font-mono text-[9px] tracking-[0.12em] text-rust/80 uppercase">
        Door
      </span>
    </Tag>
  );
}

export type SeatState = {
  /** First name, or null when nobody is in it. */
  name: string | null;
  /** Milliseconds left; Infinity when the clock has not started. */
  remaining: number;
  /** 0 when the sitting begins, 1 when it is due to end. */
  progress: number;
  onBreak: boolean;
};

/**
 * One desk. Empty, it is its number and the way it faces. Taken, a ring round
 * the number drains as the sitting runs — champagne, amber in the last quarter
 * hour, coral once past time, pearl on a break — with the time left inside and
 * the candidate's first name beneath.
 */
export function SeatTile({
  ws,
  x,
  y,
  facing,
  state,
  dimmed,
  selected,
  onPick,
}: {
  ws: Workstation;
  x: number;
  y: number;
  facing: Facing;
  state: SeatState | null;
  dimmed?: boolean;
  selected?: boolean;
  onPick?: () => void;
}) {
  const number = seatNumber(ws);
  const fault = ws.status === "fault";
  const look = state ? liquid(state.remaining, state.onBreak) : null;
  const left = state && Number.isFinite(state.remaining) ? Math.max(0, 1 - state.progress) : state ? 1 : 0;
  const over = !!state && Number.isFinite(state.remaining) && state.remaining <= 0;
  const C = 2 * Math.PI * 40;

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!onPick}
      aria-label={
        state
          ? `Seat ${number}, ${state.name ?? "taken"}, ${Number.isFinite(state.remaining) ? countdown(state.remaining) + " left" : "clock not started"}`
          : `Seat ${number}, ${fault ? "out of order" : "free"}`
      }
      style={{
        ...cellStyle(x, y),
        boxShadow: look && !dimmed ? `0 10px 26px -14px ${look.glow}` : undefined,
      }}
      className={`@container relative m-[5%] flex flex-col items-center justify-center rounded-[18%] border transition-[opacity,transform] disabled:cursor-default ${
        onPick ? "cursor-pointer hover:scale-[1.04]" : ""
      } ${dimmed ? "opacity-25" : ""} ${selected ? "outline outline-2 outline-offset-2 outline-accent" : ""} ${
        fault
          ? "border-rust/60 bg-[repeating-linear-gradient(135deg,oklch(0.72_0.17_35/0.18)_0_6px,transparent_6px_12px)]"
          : state
            ? "border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]"
            : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      <Monitor facing={facing} tone={state ? "bg-white/35" : fault ? "bg-rust/60" : "bg-white/12"} />

      <span className="relative flex aspect-square w-[74%] items-center justify-center">
        {state && (
          <svg viewBox="0 0 100 100" className={`absolute inset-0 -rotate-90 ${over ? "animate-pulse motion-reduce:animate-none" : ""}`} aria-hidden>
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={look!.ring}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${C * (over ? 1 : left)} ${C}`}
            />
          </svg>
        )}
        <span className="relative flex flex-col items-center leading-none">
          <span
            className={`font-mono font-semibold tabular-nums ${state ? "text-[19cqw]" : "text-[24cqw]"} ${
              fault ? "text-rust" : state ? "text-fg" : "text-fg-faint"
            }`}
          >
            {number}
          </span>
          {state && (
            <span className={`mt-[3cqw] font-mono text-[11cqw] font-semibold tabular-nums ${look!.text}`}>
              {state.onBreak ? "break" : Number.isFinite(state.remaining) ? countdown(state.remaining) : "—"}
            </span>
          )}
        </span>
      </span>

      <span className="mt-[2cqw] block w-[86%] truncate text-center text-[10.5cqw] leading-tight font-semibold">
        {fault ? <span className="text-rust">fault</span> : state ? state.name : <span className="text-fg-faint/70">free</span>}
      </span>
    </button>
  );
}
