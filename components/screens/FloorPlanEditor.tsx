"use client";

import { useMemo, useState } from "react";
import { PlanCanvas, PlanItemView, SeatTile } from "@/components/screens/FloorPlan";
import { useConsole } from "@/lib/console-data";
import {
  autoPlan,
  completePlan,
  MAX_SIDE,
  nextFacing,
  occupant,
  readPlan,
  type LabPlan,
  type PlanItemKind,
} from "@/lib/floor-plan";
import { seatNumber } from "@/lib/seats";
import type { Workstation } from "@/lib/types";

type Pick = { kind: "seat"; id: string } | { kind: "item"; index: number } | null;

const ARROWS: [string, number, number][] = [
  ["←", -1, 0],
  ["↑", 0, -1],
  ["↓", 0, 1],
  ["→", 1, 0],
];

/**
 * Drawing a lab as it stands. Pick a desk, then press the empty spot it belongs
 * in (or nudge it with the arrows), turn it to face its monitor, and give it
 * the number painted on it. The station sign, pillars and doors are added the
 * same way. Nothing is stored until Save.
 */
export function FloorPlanSection() {
  const { labs, workstations, rpc, center, isAdmin } = useConsole();
  const [labId, setLabId] = useState<string | null>(null);
  const lab = labs.find((l) => l.id === labId) ?? labs.find((l) => workstations.some((w) => w.lab_id === l.id)) ?? null;

  if (!lab) return null;
  return (
    <section className="flex flex-col gap-[12px]">
      <div>
        <h2 className="text-[16px] font-semibold">Floor plan</h2>
        <p className="mt-[3px] text-[12.5px] text-fg-faint">
          How each lab looks on the Lab page. Press a desk, then press where it stands; turn it to face its
          monitor; type the number painted on it.
        </p>
      </div>
      <div className="flex flex-wrap gap-[6px]">
        {labs
          .filter((l) => workstations.some((w) => w.lab_id === l.id))
          .map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLabId(l.id)}
              aria-pressed={l.id === lab.id}
              className={`cursor-pointer rounded-full border px-[14px] py-[7px] text-[12.5px] font-semibold ${
                l.id === lab.id ? "border-accent/60 bg-accent/12 text-fg" : "border-edge text-fg-dim"
              }`}
            >
              {l.name}
            </button>
          ))}
      </div>
      <LabEditor
        key={lab.id}
        stored={lab.plan}
        seats={workstations
          .filter((w) => w.lab_id === lab.id)
          .sort((a, b) => a.seat_code.localeCompare(b.seat_code, undefined, { numeric: true }))}
        canSave={isAdmin}
        onSave={async (plan, numbers) => {
          const saved = await rpc("fets_save_lab_plan", { p_lab: lab.id, p_plan: plan }, numbers.length ? undefined : "Floor plan saved");
          if (!saved || numbers.length === 0) return saved;
          return rpc("fets_set_seat_numbers", { p_center: center.id, p_numbers: numbers }, "Floor plan and numbers saved");
        }}
      />
    </section>
  );
}

function LabEditor({
  stored,
  seats,
  canSave,
  onSave,
}: {
  stored: unknown;
  seats: Workstation[];
  canSave: boolean;
  onSave: (plan: LabPlan | null, numbers: { id: string; number: string }[]) => Promise<boolean>;
}) {
  const ids = useMemo(() => seats.map((w) => w.id), [seats]);
  const [plan, setPlan] = useState<LabPlan>(() => completePlan(readPlan(stored), ids));
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<Pick>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const byId = new Map(seats.map((w) => [w.id, w]));

  const change = (next: LabPlan) => {
    setPlan(next);
    setDirty(true);
  };

  // A cell is free when no desk stands in it (furniture may share a cell).
  const free = (x: number, y: number, except?: string) =>
    x >= 0 && y >= 0 && x < plan.w && y < plan.h && !occupant(plan, x, y, except);

  function moveSeatTo(id: string, x: number, y: number) {
    if (!free(x, y, id)) return;
    change({ ...plan, seats: { ...plan.seats, [id]: { ...plan.seats[id], x, y } } });
  }

  function moveItemTo(index: number, x: number, y: number) {
    const it = plan.items[index];
    if (x < 0 || y < 0 || x + it.w > plan.w || y + it.h > plan.h) return;
    change({ ...plan, items: plan.items.map((v, i) => (i === index ? { ...v, x, y } : v)) });
  }

  function onCell(x: number, y: number) {
    if (pick?.kind === "seat") moveSeatTo(pick.id, x, y);
    else if (pick?.kind === "item") moveItemTo(pick.index, x, y);
  }

  function nudge(dx: number, dy: number) {
    if (pick?.kind === "seat") {
      const s = plan.seats[pick.id];
      moveSeatTo(pick.id, s.x + dx, s.y + dy);
    } else if (pick?.kind === "item") {
      const it = plan.items[pick.index];
      moveItemTo(pick.index, it.x + dx, it.y + dy);
    }
  }

  function addItem(k: PlanItemKind) {
    const item = { k, x: 0, y: 0, w: k === "label" ? Math.min(2, plan.w) : 1, h: 1, ...(k === "label" ? { t: "Test Station" } : {}) };
    change({ ...plan, items: [...plan.items, item] });
    setPick({ kind: "item", index: plan.items.length });
  }

  function resize(dw: number, dh: number) {
    const w = Math.min(MAX_SIDE, plan.w + dw);
    const h = Math.min(MAX_SIDE, plan.h + dh);
    // Never shrink past a desk or a piece of furniture.
    const fits =
      w >= 1 &&
      h >= 1 &&
      Object.values(plan.seats).every((s) => s.x < w && s.y < h) &&
      plan.items.every((i) => i.x + i.w <= w && i.y + i.h <= h);
    if (fits) change({ ...plan, w, h });
  }

  const changedNumbers = Object.entries(numbers)
    .filter(([id, v]) => v.trim() !== (byId.get(id)?.seat_label ?? "").trim())
    .map(([id, number]) => ({ id, number }));

  async function save() {
    setBusy(true);
    const ok = await onSave(plan, changedNumbers);
    setBusy(false);
    if (ok) {
      setDirty(false);
      setNumbers({});
    }
  }

  const seat = pick?.kind === "seat" ? byId.get(pick.id) : null;
  const item = pick?.kind === "item" ? plan.items[pick.index] : null;
  const btn = "cursor-pointer rounded-[10px] border border-edge-strong px-[11px] py-[7px] text-[12.5px] font-semibold disabled:opacity-40";

  return (
    <div className="flex flex-col gap-[12px] lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 rounded-[20px] border border-edge bg-panel-soft p-[12px]">
        <PlanCanvas plan={plan} grid onCell={onCell} maxHeight="68vh">
          {plan.items.map((it, i) => (
            <PlanItemView
              key={`item-${i}`}
              item={it}
              selected={pick?.kind === "item" && pick.index === i}
              onPick={() => setPick({ kind: "item", index: i })}
            />
          ))}
          {Object.entries(plan.seats).map(([id, p]) => {
            const w = byId.get(id);
            if (!w) return null;
            const shown = numbers[id] !== undefined ? { ...w, seat_label: numbers[id] } : w;
            return (
              <SeatTile
                key={id}
                ws={shown}
                x={p.x}
                y={p.y}
                facing={p.f}
                state={null}
                selected={pick?.kind === "seat" && pick.id === id}
                onPick={() => setPick(pick?.kind === "seat" && pick.id === id ? null : { kind: "seat", id })}
              />
            );
          })}
        </PlanCanvas>
      </div>

      <aside className="flex shrink-0 flex-col gap-[12px] rounded-[20px] border border-edge bg-panel-soft p-[14px] lg:w-[280px]">
        {seat ? (
          <>
            <span className="text-[14px] font-semibold">Desk {seatNumber(numbers[seat.id] !== undefined ? { ...seat, seat_label: numbers[seat.id] } : seat)}</span>
            <label className="flex flex-col gap-[5px]">
              <span className="text-[12px] text-fg-dim">Number painted on the desk</span>
              <input
                value={numbers[seat.id] ?? seat.seat_label ?? ""}
                placeholder={seatNumber({ seat_code: seat.seat_code })}
                maxLength={12}
                onChange={(e) => {
                  setNumbers({ ...numbers, [seat.id]: e.target.value });
                  setDirty(true);
                }}
                className="rounded-[10px] border border-edge-strong bg-panel px-[10px] py-[8px] font-mono text-[14px] outline-none focus:border-accent/50"
              />
            </label>
            <button
              type="button"
              className={btn}
              onClick={() =>
                change({ ...plan, seats: { ...plan.seats, [seat.id]: { ...plan.seats[seat.id], f: nextFacing(plan.seats[seat.id].f) } } })
              }
            >
              ⟳ Turn to face the next way
            </button>
          </>
        ) : item ? (
          <>
            <span className="text-[14px] font-semibold capitalize">{item.k}</span>
            {item.k === "label" && (
              <input
                value={item.t ?? ""}
                maxLength={40}
                onChange={(e) =>
                  change({ ...plan, items: plan.items.map((v, i) => (i === (pick as { index: number }).index ? { ...v, t: e.target.value } : v)) })
                }
                className="rounded-[10px] border border-edge-strong bg-panel px-[10px] py-[8px] text-[14px] outline-none focus:border-accent/50"
              />
            )}
            <div className="flex flex-wrap gap-[6px]">
              {(
                [
                  ["Wider", 1, 0],
                  ["Narrower", -1, 0],
                  ["Taller", 0, 1],
                  ["Shorter", 0, -1],
                ] as [string, number, number][]
              ).map(([label, dw, dh]) => (
                <button
                  key={label}
                  type="button"
                  className={btn}
                  onClick={() => {
                    const index = (pick as { index: number }).index;
                    const w = item.w + dw;
                    const h = item.h + dh;
                    if (w < 1 || h < 1 || item.x + w > plan.w || item.y + h > plan.h) return;
                    change({ ...plan, items: plan.items.map((v, i) => (i === index ? { ...v, w, h } : v)) });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`${btn} text-rust`}
              onClick={() => {
                const index = (pick as { index: number }).index;
                change({ ...plan, items: plan.items.filter((_, i) => i !== index) });
                setPick(null);
              }}
            >
              Remove
            </button>
          </>
        ) : (
          <p className="text-[12.5px] text-fg-faint">Press a desk or a sign to change it.</p>
        )}

        {pick && (
          <div className="flex gap-[6px]">
            {ARROWS.map(([label, dx, dy]) => (
              <button key={label} type="button" className={`${btn} flex-1 text-[15px]`} onClick={() => nudge(dx, dy)} aria-label={`Move ${label}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-[6px] border-t border-edge pt-[12px]">
          <span className="text-[12px] text-fg-dim">Add to the room</span>
          <div className="flex flex-wrap gap-[6px]">
            <button type="button" className={btn} onClick={() => addItem("label")}>
              Sign
            </button>
            <button type="button" className={btn} onClick={() => addItem("pillar")}>
              Pillar
            </button>
            <button type="button" className={btn} onClick={() => addItem("door")}>
              Door
            </button>
          </div>
          <span className="mt-[4px] text-[12px] text-fg-dim">
            Room size: {plan.w} across × {plan.h} down
          </span>
          <div className="flex flex-wrap gap-[6px]">
            <button type="button" className={btn} onClick={() => resize(1, 0)}>+ column</button>
            <button type="button" className={btn} onClick={() => resize(-1, 0)}>− column</button>
            <button type="button" className={btn} onClick={() => resize(0, 1)}>+ row</button>
            <button type="button" className={btn} onClick={() => resize(0, -1)}>− row</button>
          </div>
          <button
            type="button"
            className={`${btn} mt-[4px]`}
            onClick={() => {
              change(autoPlan(ids));
              setPick(null);
            }}
          >
            Start again in rows
          </button>
        </div>

        {canSave && (dirty || changedNumbers.length > 0) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="cursor-pointer rounded-[12px] gold-bg px-[18px] py-[11px] text-[13px] font-bold text-[#1a1512] disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save floor plan"}
          </button>
        )}
      </aside>
    </div>
  );
}
