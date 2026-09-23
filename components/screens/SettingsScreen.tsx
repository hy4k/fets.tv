"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useConsole } from "@/lib/console-data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { HEADER_ALIASES } from "@/lib/roster/parse";
import type { DutyPostKind, ExamProgramme, Lab, ScheduleRules, SectionKind } from "@/lib/types";

const SECTIONS = [
  { key: "centre", label: "Centre", blurb: "Name, timezone, and what the TV shows" },
  { key: "labs", label: "Labs and seats", blurb: "How many seats each lab has" },
  { key: "exams", label: "Exams", blurb: "Which exams run here, how long, and their parts" },
  { key: "day", label: "The day", blurb: "Start, end, break and how candidates are spread out" },
  { key: "flow", label: "Check in and calling", blurb: "Which steps a candidate passes through" },
  { key: "duty", label: "Duty posts", blurb: "The posts staff rotate through, and how long a block runs" },
  { key: "roster", label: "Roster columns", blurb: "Which spreadsheet headings the importer reads" },
  { key: "screens", label: "TV screens", blurb: "The displays in the hall" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

/**
 * Setup, one subject at a time. Everything here changes how the console behaves
 * rather than what happens today, so it is kept off the working pages and split
 * so that no screen asks about two unrelated things at once.
 */
export function SettingsScreen() {
  const [section, setSection] = useState<SectionKey>("centre");
  const { isAdmin } = useConsole();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[12px] lg:flex-row">
      <nav
        className="flex shrink-0 gap-[6px] overflow-x-auto rounded-[18px] border border-edge-soft bg-panel-soft p-[8px] lg:w-[236px] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto"
        aria-label="Setup sections"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            aria-current={section === s.key ? "page" : undefined}
            className={`shrink-0 cursor-pointer rounded-[13px] px-[13px] py-[11px] text-left transition-colors ${
              section === s.key
                ? "bg-gold/12 text-fg"
                : "text-fg-dim hover:bg-panel hover:text-fg"
            }`}
          >
            <span className="block text-[13.5px] font-semibold whitespace-nowrap">{s.label}</span>
            <span className="hidden text-[11.5px] text-fg-faint lg:block">{s.blurb}</span>
          </button>
        ))}
      </nav>

      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[20px] border border-edge-mid panel-bg p-[18px]">
        {!isAdmin && (
          <p className="mb-[14px] rounded-[14px] border border-gold/35 bg-gold/8 p-[13px] text-[12.5px] text-gold">
            You can see these settings but not change them. Only an admin can.
          </p>
        )}

        {section === "centre" && <CentreSection />}
        {section === "labs" && <LabsSection />}
        {section === "exams" && <ExamsSection />}
        {section === "day" && <DaySection />}
        {section === "flow" && <FlowSection />}
        {section === "duty" && <DutySection />}
        {section === "roster" && <RosterSection />}
        {section === "screens" && <ScreensSection />}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- centre -- */

function CentreSection() {
  const { center, notify, refresh, isAdmin } = useConsole();

  async function save(patch: { show_name_on_tv: boolean }) {
    const { error } = await supabaseBrowser().from("centers").update(patch).eq("id", center.id);
    if (error) notify(error.message, "error");
    else await refresh();
  }

  return (
    <Panel title="Centre" note="Who this console belongs to.">
      <Facts
        rows={[
          ["Name", center.name],
          ["Site code", center.site_code],
          ["Timezone", center.timezone],
        ]}
      />
      <Toggle
        label="Show candidate names on the TV"
        note="With this off the board shows tokens only, which some exams require."
        on={center.show_name_on_tv}
        disabled={!isAdmin}
        onChange={(v) => save({ show_name_on_tv: v })}
      />
    </Panel>
  );
}

/* ------------------------------------------------------------------ labs -- */

function LabsSection() {
  const { center, labs, workstations, rpc, isAdmin } = useConsole();
  const [draft, setDraft] = useState<{ name: string; capacity: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = draft ?? labs.map((l) => ({ name: l.name, capacity: String(l.capacity) }));
  const dirty = draft !== null;

  function edit(i: number, patch: Partial<{ name: string; capacity: string }>) {
    setDraft(rows.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true);
    const ok = await rpc(
      "fets_configure_labs",
      {
        p_center: center.id,
        p_labs: rows.map((r) => ({ name: r.name.trim(), capacity: Number(r.capacity) })),
      },
      "Labs updated",
    );
    setBusy(false);
    if (ok) setDraft(null);
  }

  return (
    <Panel
      title="Labs and seats"
      note="Changing a number here adds or removes seats. A seat somebody is sitting at is never removed — it is kept and reported instead."
    >
      <div className="flex flex-col gap-[10px]">
        {rows.map((row, i) => {
          const lab = labs[i] as Lab | undefined;
          const inUse = lab
            ? workstations.filter((w) => w.lab_id === lab.id && w.status !== "free").length
            : 0;
          return (
            <div
              key={lab?.id ?? i}
              className="flex flex-wrap items-end gap-[12px] rounded-[16px] border border-edge bg-panel-soft p-[13px]"
            >
              <label className="flex min-w-[140px] flex-1 flex-col gap-[6px]">
                <span className="text-[11px] font-semibold text-fg-dim">Name</span>
                <input
                  value={row.name}
                  disabled={!isAdmin}
                  onChange={(e) => edit(i, { name: e.target.value })}
                  className="rounded-[11px] border border-edge-strong bg-panel px-[12px] py-[10px] text-[14px] outline-none focus:border-gold/50 disabled:opacity-60"
                />
              </label>
              <label className="flex w-[110px] flex-col gap-[6px]">
                <span className="text-[11px] font-semibold text-fg-dim">Seats</span>
                <input
                  inputMode="numeric"
                  value={row.capacity}
                  disabled={!isAdmin}
                  onChange={(e) => edit(i, { capacity: e.target.value })}
                  className="rounded-[11px] border border-edge-strong bg-panel px-[12px] py-[10px] font-mono text-[14px] outline-none focus:border-gold/50 disabled:opacity-60"
                />
              </label>
              <span className="pb-[10px] text-[12px] text-fg-faint">
                {inUse > 0 ? `${inUse} in use` : "all free"}
              </span>
              {isAdmin && rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setDraft(rows.filter((_, j) => j !== i))}
                  className="mb-[4px] cursor-pointer rounded-[11px] border border-edge px-[12px] py-[9px] text-[12px] text-fg-muted hover:border-rust/50 hover:text-rust"
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-[9px]">
          <button
            type="button"
            onClick={() => setDraft([...rows, { name: `Lab ${rows.length + 1}`, capacity: "10" }])}
            className="cursor-pointer rounded-[12px] border border-edge-warm px-[15px] py-[11px] text-[13px] font-semibold"
          >
            Add a lab
          </button>
          {dirty && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={save}
                className="cursor-pointer rounded-[12px] gold-bg px-[18px] py-[11px] text-[13px] font-bold text-[#1a1512] disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save the labs"}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="cursor-pointer rounded-[12px] border border-edge px-[15px] py-[11px] text-[13px] font-semibold text-fg-muted"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------------- exams -- */

function ExamsSection() {
  const { programmes, programmeSections, notify, refresh, isAdmin } = useConsole();
  const [editing, setEditing] = useState<ExamProgramme | null>(null);

  const partsCount = (id: string) => programmeSections.filter((s) => s.programme_id === id).length;

  async function save(id: string, minutes: number) {
    const { error } = await supabaseBrowser()
      .from("exam_programmes")
      .update({ default_duration_minutes: minutes })
      .eq("id", id);
    if (error) notify(error.message, "error");
    else await refresh();
  }

  return (
    <Panel
      title="Exams"
      note="How long each exam runs. Seating a candidate starts their clock at the length shown here, and it can still be corrected on the Live Floor."
    >
      {programmes.length === 0 ? (
        <p className="rounded-[14px] border border-gold/35 bg-gold/8 p-[13px] text-[12.5px] text-gold">
          No exams are set up for this centre yet, so a seated candidate falls back to the centre&rsquo;s
          default length.
        </p>
      ) : (
        <div className="flex flex-col gap-[8px]">
          {programmes.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-[12px] rounded-[15px] border border-edge bg-panel-soft p-[12px]"
            >
              <span className="w-[86px] shrink-0 font-mono text-[13px] font-semibold">{p.code}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">{p.name}</span>
              <Minutes
                value={p.default_duration_minutes}
                disabled={!isAdmin}
                onCommit={(m) => save(p.id, m)}
              />
              <span className="text-[12px] text-fg-faint">min</span>
              <button
                type="button"
                onClick={() => setEditing(p)}
                className="shrink-0 cursor-pointer rounded-[11px] border border-edge-warm px-[12px] py-[8px] text-[12px] font-semibold hover:bg-panel"
              >
                {partsCount(p.id) > 0 ? `${partsCount(p.id)} parts` : "Add parts"}
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && <SectionsEditor key={editing.id} programme={editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

/**
 * The parts of one exam, as a plan.
 *
 * Edited as a whole list and saved in one go, because that is how somebody
 * thinks about it -- "CELPIP is these four things in this order" -- and a
 * save-per-row would let a half-finished plan reach the floor.
 */
function SectionsEditor({ programme, onClose }: { programme: ExamProgramme; onClose: () => void }) {
  const { programmeSections, rpc, isAdmin } = useConsole();
  const [rows, setRows] = useState<Draft[]>(() =>
    programmeSections
      .filter((s) => s.programme_id === programme.id)
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ key: String(s.id), name: s.name, minutes: String(s.minutes), kind: s.kind })),
  );
  const [saving, setSaving] = useState(false);

  const planned = rows.reduce((n, r) => n + (Number(r.minutes) || 0), 0);
  const gap = planned - programme.default_duration_minutes;

  function add() {
    setRows((list) => [
      ...list,
      { key: `new-${crypto.randomUUID()}`, name: "", minutes: "30", kind: "section" },
    ]);
  }

  function patch(key: string, change: Partial<Draft>) {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  function move(key: string, by: number) {
    setRows((list) => {
      const i = list.findIndex((r) => r.key === key);
      const j = i + by;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const ok = await rpc(
      "fets_set_programme_sections",
      {
        p_programme: programme.id,
        p_sections: rows.map((r) => ({
          name: r.name.trim(),
          minutes: Number(r.minutes) || 0,
          kind: r.kind,
        })),
      },
      `${programme.code} parts saved`,
    );
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      title={`${programme.code} — the parts`}
      subtitle="In the order they are sat. The Live Floor works out when each one is due from these."
      onClose={onClose}
      width={620}
      footer={
        <>
          <button
            type="button"
            disabled={!isAdmin || saving || rows.some((r) => !r.name.trim())}
            onClick={save}
            className="flex-1 cursor-pointer rounded-[14px] gold-bg px-[20px] py-[14px] text-[14px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : rows.length === 0 ? "Save with no parts" : `Save ${rows.length} parts`}
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
      <div className="flex flex-col gap-[8px]">
        {rows.map((r, i) => (
          <div
            key={r.key}
            className="flex flex-wrap items-center gap-[8px] rounded-[14px] border border-edge bg-panel-soft p-[10px]"
          >
            <span className="w-[22px] shrink-0 text-center font-mono text-[12px] text-fg-faint">
              {i + 1}
            </span>
            <input
              value={r.name}
              onChange={(e) => patch(r.key, { name: e.target.value })}
              placeholder="Listening"
              maxLength={60}
              className="min-w-[110px] flex-1 rounded-[11px] border border-edge-strong bg-panel px-[11px] py-[9px] text-[13.5px] outline-none placeholder:text-fg-faint focus:border-gold/50"
            />
            <input
              value={r.minutes}
              onChange={(e) => patch(r.key, { minutes: e.target.value.replace(/[^0-9]/g, "") })}
              inputMode="numeric"
              maxLength={3}
              className="w-[62px] rounded-[11px] border border-edge-strong bg-panel px-[10px] py-[9px] text-center font-mono text-[13.5px] outline-none focus:border-gold/50"
            />
            <span className="text-[11.5px] text-fg-faint">min</span>
            <select
              value={r.kind}
              onChange={(e) => patch(r.key, { kind: e.target.value as SectionKind })}
              className="rounded-[11px] border border-edge-strong bg-panel px-[9px] py-[9px] text-[12.5px] outline-none focus:border-gold/50"
            >
              <option value="section">Scored</option>
              <option value="tutorial">Tutorial</option>
              <option value="break">Break</option>
            </select>
            <span className="flex gap-[4px]">
              <button
                type="button"
                onClick={() => move(r.key, -1)}
                disabled={i === 0}
                aria-label="Move up"
                className="h-[32px] w-[28px] cursor-pointer rounded-[9px] border border-edge text-[12px] text-fg-muted hover:bg-panel disabled:opacity-25"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(r.key, 1)}
                disabled={i === rows.length - 1}
                aria-label="Move down"
                className="h-[32px] w-[28px] cursor-pointer rounded-[9px] border border-edge text-[12px] text-fg-muted hover:bg-panel disabled:opacity-25"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                aria-label="Remove"
                className="h-[32px] w-[28px] cursor-pointer rounded-[9px] border border-edge text-[13px] text-fg-faint hover:border-rust/50 hover:text-rust"
              >
                ×
              </button>
            </span>
          </div>
        ))}

        <button
          type="button"
          onClick={add}
          className="cursor-pointer rounded-[13px] border border-dashed border-edge-warm px-[14px] py-[11px] text-[12.5px] font-semibold text-fg-muted hover:bg-panel-soft"
        >
          + Add a part
        </button>

        {rows.length > 0 && (
          <p
            className={`rounded-[12px] px-[12px] py-[10px] font-mono text-[11.5px] ${
              gap === 0 ? "bg-panel-soft text-fg-faint" : "bg-gold/8 text-gold"
            }`}
          >
            {planned} min of parts against {programme.default_duration_minutes} min for the exam
            {gap === 0 ? " — they agree" : gap > 0 ? ` — ${gap} min over` : ` — ${-gap} min under`}
          </p>
        )}
      </div>
    </Dialog>
  );
}

type Draft = { key: string; name: string; minutes: string; kind: SectionKind };

/* ------------------------------------------------------------------ duty -- */

/**
 * The posts staff rotate through, and how long a turn on one lasts.
 *
 * Retiring a post here does not delete it: the duties already served on it stay
 * readable, and putting the name back brings the same post — and its history —
 * along with it.
 */
function DutySection() {
  const { center, dutyPosts, labs, rules, notify, refresh, rpc, isAdmin } = useConsole();
  const [rows, setRows] = useState<PostDraft[]>(() =>
    dutyPosts
      .filter((p) => p.active)
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ key: p.id, name: p.name, kind: p.kind, lab_id: p.lab_id ?? "" })),
  );
  const [saving, setSaving] = useState(false);

  const retired = dutyPosts.filter((p) => !p.active);

  async function saveMinutes(patch: Partial<ScheduleRules>) {
    const { error } = await supabaseBrowser()
      .from("schedule_rules")
      .update(patch)
      .eq("center_id", center.id);
    if (error) notify(error.message, "error");
    else await refresh();
  }

  async function savePosts() {
    setSaving(true);
    await rpc(
      "fets_configure_duty_posts",
      {
        p_center: center.id,
        p_posts: rows.map((r) => ({
          name: r.name.trim(),
          kind: r.kind,
          lab_id: r.kind === "lab" && r.lab_id ? r.lab_id : null,
        })),
      },
      "Posts saved",
    );
    setSaving(false);
  }

  return (
    <>
      <Panel
        title="The rhythm of a shift"
        note="A turn on a post, and how often whoever has the floor walks it. Ninety and ten are what FETS runs; a centre that works differently can say so here."
      >
        <div className="flex flex-col gap-[8px]">
          <div className="flex items-center gap-[12px] rounded-[15px] border border-edge bg-panel-soft p-[12px]">
            <span className="min-w-0 flex-1 text-[13px] text-fg-muted">Default block length</span>
            <Minutes
              value={rules.duty_block_minutes}
              disabled={!isAdmin}
              onCommit={(m) => saveMinutes({ duty_block_minutes: m })}
            />
            <span className="text-[12px] text-fg-faint">min</span>
          </div>

          <div className="flex items-center gap-[12px] rounded-[15px] border border-edge bg-panel-soft p-[12px]">
            <span className="min-w-0 flex-1 text-[13px] text-fg-muted">
              Walk the floor every
            </span>
            <Minutes
              value={rules.walkthrough_minutes}
              disabled={!isAdmin}
              onCommit={(m) => saveMinutes({ walkthrough_minutes: m })}
            />
            <span className="text-[12px] text-fg-faint">min</span>
          </div>
        </div>
      </Panel>

      <Panel
        title="Posts"
        note="Every place somebody stands. A lab post is the one that has to walk its floor, so point it at the lab it covers."
      >
        <div className="flex flex-col gap-[8px]">
          {rows.map((r, i) => (
            <div
              key={r.key}
              className="flex flex-wrap items-center gap-[8px] rounded-[15px] border border-edge bg-panel-soft p-[10px]"
            >
              <span className="w-[22px] shrink-0 text-center font-mono text-[12px] text-fg-faint">
                {i + 1}
              </span>
              <input
                value={r.name}
                onChange={(e) =>
                  setRows((list) =>
                    list.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)),
                  )
                }
                placeholder="Front desk"
                maxLength={60}
                className="min-w-[120px] flex-1 rounded-[11px] border border-edge-strong bg-panel px-[11px] py-[9px] text-[13.5px] outline-none placeholder:text-fg-faint focus:border-gold/50"
              />
              <select
                value={r.kind}
                onChange={(e) =>
                  setRows((list) =>
                    list.map((x) =>
                      x.key === r.key ? { ...x, kind: e.target.value as DutyPostKind } : x,
                    ),
                  )
                }
                className="rounded-[11px] border border-edge-strong bg-panel px-[9px] py-[9px] text-[12.5px] outline-none focus:border-gold/50"
              >
                <option value="front">Front of house</option>
                <option value="admin">Admin room</option>
                <option value="lab">Lab</option>
                <option value="floating">Relief</option>
              </select>
              {r.kind === "lab" && (
                <select
                  value={r.lab_id}
                  onChange={(e) =>
                    setRows((list) =>
                      list.map((x) => (x.key === r.key ? { ...x, lab_id: e.target.value } : x)),
                    )
                  }
                  className="rounded-[11px] border border-edge-strong bg-panel px-[9px] py-[9px] text-[12.5px] outline-none focus:border-gold/50"
                >
                  <option value="">which lab?</option>
                  {labs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                aria-label="Retire this post"
                className="h-[32px] w-[28px] cursor-pointer rounded-[9px] border border-edge text-[13px] text-fg-faint hover:border-rust/50 hover:text-rust"
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setRows((list) => [
                ...list,
                { key: `new-${crypto.randomUUID()}`, name: "", kind: "floating", lab_id: "" },
              ])
            }
            className="cursor-pointer rounded-[13px] border border-dashed border-edge-warm px-[14px] py-[11px] text-[12.5px] font-semibold text-fg-muted hover:bg-panel-soft"
          >
            + Add a post
          </button>

          <button
            type="button"
            disabled={!isAdmin || saving || rows.some((r) => !r.name.trim())}
            onClick={savePosts}
            className="cursor-pointer rounded-[13px] gold-bg px-[14px] py-[12px] text-[13.5px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : `Save ${rows.length} posts`}
          </button>

          {retired.length > 0 && (
            <p className="font-mono text-[10.5px] text-fg-faint">
              Retired, and kept for the record: {retired.map((p) => p.name).join(", ")}. Adding the
              name back brings the post and its history with it.
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}

type PostDraft = { key: string; name: string; kind: DutyPostKind; lab_id: string };

/* ------------------------------------------------------------------- day -- */

function DaySection() {
  const { center, rules, notify, refresh, isAdmin } = useConsole();

  async function save(patch: Partial<ScheduleRules>) {
    const { error } = await supabaseBrowser()
      .from("schedule_rules")
      .update(patch)
      .eq("center_id", center.id);
    if (error) notify(error.message, "error");
    else await refresh();
  }

  return (
    <Panel
      title="The day"
      note="When the day runs, and how far apart imported candidates are scheduled."
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[12px]">
        {(
          [
            ["Doors open", "exam_start", rules.exam_start.slice(0, 5)],
            ["Doors close", "exam_end", rules.exam_end.slice(0, 5)],
            ["Break starts", "break_start", rules.break_start?.slice(0, 5) ?? "13:00"],
          ] as const
        ).map(([label, field, value]) => (
          <label key={field} className="flex flex-col gap-[7px] rounded-[15px] border border-edge bg-panel-soft p-[13px]">
            <span className="text-[11px] font-semibold text-fg-dim">{label}</span>
            <TimeField
              value={value}
              disabled={!isAdmin}
              onCommit={(next) => save({ [field]: next } as Partial<ScheduleRules>)}
            />
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-[8px]">
        {(
          [
            ["Break length", "break_minutes", "minutes"],
            ["Gap between arrivals", "slot_interval_minutes", "minutes"],
            ["Default exam length", "exam_duration_minutes", "minutes"],
          ] as const
        ).map(([label, field, unit]) => (
          <div
            key={field}
            className="flex items-center gap-[12px] rounded-[15px] border border-edge bg-panel-soft p-[12px]"
          >
            <span className="min-w-0 flex-1 text-[13px]">{label}</span>
            <Minutes
              value={rules[field] as number}
              disabled={!isAdmin}
              onCommit={(v) => save({ [field]: v } as Partial<ScheduleRules>)}
            />
            <span className="text-[12px] text-fg-faint">{unit}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ flow -- */

function FlowSection() {
  const { center, rules, notify, refresh, isAdmin } = useConsole();

  async function save(patch: Partial<ScheduleRules>) {
    const { error } = await supabaseBrowser()
      .from("schedule_rules")
      .update(patch)
      .eq("center_id", center.id);
    if (error) notify(error.message, "error");
    else await refresh();
  }

  const toggles: { label: string; note: string; field: keyof ScheduleRules }[] = [
    {
      label: "Locker key required",
      note: "The front desk cannot finish a check-in until a key is issued.",
      field: "locker_key_required",
    },
    {
      label: "Frisking checkpoint",
      note: "Candidates go to frisking after being called, before biometrics.",
      field: "frisking_enabled",
    },
    {
      label: "Biometrics gate",
      note: "A biometrics step before the lab.",
      field: "biometrics_enabled",
    },
    {
      label: "Re-number automatically",
      note: "Keeps the calling order tidy when somebody is marked no-show.",
      field: "auto_resequence",
    },
    {
      label: "Record admin overrides",
      note: "Every manual stage change is written to the audit trail with its reason.",
      field: "admin_override_log",
    },
  ];

  return (
    <Panel title="Check in and calling" note="Which steps a candidate passes through on the way in.">
      {toggles.map((t) => (
        <Toggle
          key={t.field}
          label={t.label}
          note={t.note}
          on={rules[t.field] as boolean}
          disabled={!isAdmin}
          onChange={(v) => save({ [t.field]: v } as Partial<ScheduleRules>)}
        />
      ))}
    </Panel>
  );
}

/* ---------------------------------------------------------------- roster -- */

const FIELD_LABELS: Record<string, string> = {
  roster_number: "Roster number",
  full_name: "Name (one column)",
  first_name: "First name",
  last_name: "Last name",
  part: "Part",
  phone: "Contact number",
  place: "Place",
  roster_flag: "No-show flag",
  exam_name: "Exam name",
};

function RosterSection() {
  const { center, columnAliases, rpc, isAdmin } = useConsole();
  const [field, setField] = useState("roster_number");
  const [alias, setAlias] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!alias.trim()) return;
    setBusy(true);
    const ok = await rpc(
      "fets_add_column_alias",
      { p_center: center.id, p_field: field, p_alias: alias },
      `The importer will now read “${alias.trim()}”`,
    );
    setBusy(false);
    if (ok) setAlias("");
  }

  return (
    <Panel
      title="Roster columns"
      note="The importer reads a spreadsheet by its column headings. These are the headings it already knows; add your own if a board sends a layout it does not recognise."
    >
      {isAdmin && (
        <div className="flex flex-wrap items-end gap-[10px] rounded-[16px] border border-edge bg-panel-soft p-[13px]">
          <label className="flex min-w-[170px] flex-1 flex-col gap-[6px]">
            <span className="text-[11px] font-semibold text-fg-dim">This column holds</span>
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="rounded-[11px] border border-edge-strong bg-panel px-[11px] py-[10px] text-[13px] outline-none"
            >
              {Object.keys(FIELD_LABELS).map((key) => (
                <option key={key} value={key}>
                  {FIELD_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[180px] flex-[2] flex-col gap-[6px]">
            <span className="text-[11px] font-semibold text-fg-dim">
              Heading in the file <span className="font-normal text-fg-faint">— exactly as it appears</span>
            </span>
            <input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Examinee"
              className="rounded-[11px] border border-edge-strong bg-panel px-[12px] py-[10px] text-[13px] outline-none focus:border-gold/50"
            />
          </label>
          <button
            type="button"
            disabled={busy || !alias.trim()}
            onClick={add}
            className="cursor-pointer rounded-[12px] gold-bg px-[16px] py-[11px] text-[13px] font-bold text-[#1a1512] disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}

      {columnAliases.length > 0 && (
        <div className="flex flex-col gap-[7px]">
          <span className="text-[11.5px] font-semibold text-fg-dim">Headings you added</span>
          {columnAliases.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-[11px] rounded-[13px] border border-gold/35 bg-gold/6 px-[12px] py-[10px]"
            >
              <span className="font-mono text-[13px] text-gold-bright">{a.alias}</span>
              <span className="text-[12px] text-fg-faint">→ {FIELD_LABELS[a.field] ?? a.field}</span>
              <span className="flex-1" />
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => rpc("fets_remove_column_alias", { p_alias: a.id }, "Heading removed")}
                  className="cursor-pointer rounded-[10px] border border-edge px-[11px] py-[7px] text-[12px] text-fg-muted hover:border-rust/50 hover:text-rust"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-[9px]">
        <span className="text-[11.5px] font-semibold text-fg-dim">Headings it already knows</span>
        {Object.entries(HEADER_ALIASES).map(([key, list]) => (
          <div key={key} className="rounded-[13px] border border-edge bg-panel-soft px-[12px] py-[10px]">
            <span className="block text-[12.5px] font-semibold">{FIELD_LABELS[key] ?? key}</span>
            <span className="mt-[3px] block font-mono text-[11px] leading-[1.55] text-fg-faint">
              {list.join(" · ")}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* --------------------------------------------------------------- screens -- */

function ScreensSection() {
  const { displays } = useConsole();

  return (
    <Panel
      title="TV screens"
      note="Each screen has its own address. Open it on the TV's browser and leave it there — it reconnects by itself."
    >
      {displays.length === 0 ? (
        <p className="text-[13px] text-fg-faint">No screens are set up for this centre.</p>
      ) : (
        <div className="flex flex-col gap-[8px]">
          {displays.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center gap-[11px] rounded-[15px] border border-edge bg-panel-soft p-[12px]"
            >
              <span className="text-[13.5px] font-semibold">{d.label}</span>
              <span className="rounded-[9px] bg-panel px-[9px] py-[5px] font-mono text-[11px] text-fg-muted">
                {d.hall_label}
              </span>
              <span className="flex-1" />
              <span
                className={`rounded-[9px] px-[10px] py-[5px] text-[11px] font-semibold ${
                  d.active ? "bg-mint/15 text-mint" : "bg-panel text-fg-faint"
                }`}
              >
                {d.active ? "Active" : "Off"}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[12px] leading-[1.5] text-fg-faint">
        A screen&rsquo;s address is secret and is not shown here. Ask an admin to look it up if a TV needs
        setting up again.
      </p>
    </Panel>
  );
}

/* ----------------------------------------------------------------- parts -- */

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[16px]">
      <div>
        <h2 className="font-serif text-[24px] leading-[1.15]">{title}</h2>
        <p className="mt-[5px] max-w-[62ch] text-[12.5px] leading-[1.5] text-fg-faint">{note}</p>
      </div>
      {children}
    </div>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[10px]">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-[15px] border border-edge bg-panel-soft p-[13px]">
          <span className="text-[11px] font-semibold text-fg-dim">{label}</span>
          <span className="mt-[4px] block text-[15px]">{value}</span>
        </div>
      ))}
    </div>
  );
}

function Toggle({
  label,
  note,
  on,
  disabled,
  onChange,
}: {
  label: string;
  note: string;
  on: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex cursor-pointer items-center gap-[14px] rounded-[16px] border border-edge bg-panel-soft p-[13px] text-left disabled:cursor-default disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold">{label}</span>
        <span className="mt-[2px] block text-[12px] leading-[1.45] text-fg-faint">{note}</span>
      </span>
      <span
        className={`flex h-[26px] w-[46px] shrink-0 items-center rounded-full p-[3px] transition-colors ${
          on ? "bg-mint/70" : "bg-[#30291f]"
        }`}
      >
        <span
          className={`h-[20px] w-[20px] rounded-full bg-[#141110] transition-transform ${
            on ? "translate-x-[20px]" : ""
          }`}
        />
      </span>
    </button>
  );
}

function Minutes({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (minutes: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    const next = draft;
    setDraft(null);
    const minutes = Number(next);
    if (next && Number.isFinite(minutes) && minutes >= 0 && minutes <= 1440 && minutes !== value) {
      onCommit(minutes);
    }
  }

  return (
    <input
      inputMode="numeric"
      disabled={disabled}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="w-[64px] shrink-0 rounded-[10px] border border-edge-strong bg-panel px-[9px] py-[8px] text-center font-mono text-[13.5px] font-semibold outline-none disabled:opacity-60"
    />
  );
}

/** 24-hour time entry. A native time input renders 12-hour on most locales. */
function TimeField({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    const next = draft;
    setDraft(null);
    if (next && next !== value && /^([01]\d|2[0-3]):[0-5]\d$/.test(next)) onCommit(next);
  }

  return (
    <input
      inputMode="numeric"
      maxLength={5}
      placeholder="HH:MM"
      disabled={disabled}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="w-full bg-transparent font-mono text-[20px] font-semibold outline-none disabled:opacity-60"
    />
  );
}
