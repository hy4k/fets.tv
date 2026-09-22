"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useConsole } from "@/lib/console-data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clockAt, fullName, statusChip } from "@/lib/format";
import type { Candidate, ExamSession } from "@/lib/types";

/** The report's own columns, the same six the working list shows. */
const COLUMNS = "104px 1fr 92px 130px 128px 118px";

/**
 * Days that are over. A closed day keeps every candidate, event and break it
 * had; it is only out of the way, not gone. This is where it is looked at
 * again — and where a rehearsal is deleted, which is the one thing here that
 * cannot be undone.
 */
export function HistoryScreen() {
  const { center, session, rpc, isAdmin, refresh } = useConsole();

  const [days, setDays] = useState<ExamSession[] | null>(null);
  const [openDay, setOpenDay] = useState<ExamSession | null>(null);
  const [deleting, setDeleting] = useState<ExamSession | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      supabaseBrowser()
        .from("exam_sessions")
        .select("*")
        .eq("center_id", center.id)
        .eq("status", "closed")
        .order("exam_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(120)
        .then(({ data }) => setDays(data ?? [])),
    [center.id],
  );

  // A day leaving the working screens is what puts it in this list, so the list
  // is rebuilt whenever the open day changes. The flag drops a reply that
  // arrives after the centre or the day has moved on.
  const openDayId = session?.id ?? null;
  useEffect(() => {
    let current = true;
    void supabaseBrowser()
      .from("exam_sessions")
      .select("*")
      .eq("center_id", center.id)
      .eq("status", "closed")
      .order("exam_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(120)
      .then(({ data }) => {
        if (current) setDays(data ?? []);
      });
    return () => {
      current = false;
    };
  }, [center.id, openDayId]);

  async function closeToday() {
    setBusy(true);
    const ok = await rpc("fets_close_day", { p_center: center.id }, "The day is closed");
    setBusy(false);
    if (ok) {
      await refresh();
      await load();
    }
  }

  async function purge() {
    if (!deleting) return;
    setBusy(true);
    const ok = await rpc("fets_purge_session", { p_session: deleting.id }, "That day was deleted");
    setBusy(false);
    if (ok) {
      setDeleting(null);
      await load();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px]">
      {session ? (
        <div className="flex shrink-0 flex-wrap items-center gap-[14px] rounded-[18px] border border-mint/35 bg-mint/6 px-[18px] py-[15px]">
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">
              {session.exam_name} is open
            </span>
            <span className="block text-[12px] text-fg-faint">
              Closing it clears the TV, frees every seat and moves the day into this list. Nothing is
              deleted.
            </span>
          </span>
          <button
            type="button"
            disabled={!isAdmin || busy}
            onClick={closeToday}
            className="cursor-pointer rounded-[13px] border border-mint/50 bg-mint/15 px-[18px] py-[12px] text-[13.5px] font-bold text-mint disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Closing…" : "Close the day"}
          </button>
        </div>
      ) : (
        <div className="shrink-0 rounded-[18px] border border-edge-mid bg-panel-soft px-[18px] py-[15px] text-[13.5px] text-fg-faint">
          No day is open. Import a roster to start one.
        </div>
      )}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-edge-mid panel-bg">
        <div className="flex shrink-0 items-center gap-[10px] border-b border-edge-soft px-[16px] py-[12px]">
          <span className="text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">
            Finished days
          </span>
          <span className="h-px flex-1 bg-edge-soft" />
          <span className="font-mono text-[13px] text-fg-faint">{days?.length ?? "…"}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {days === null && <p className="p-[24px] text-center text-[13px] text-fg-faint">Loading…</p>}

          {days?.length === 0 && (
            <p className="p-[26px] text-center text-[13px] text-fg-faint">
              No finished days yet. A day appears here once it is closed.
            </p>
          )}

          {days?.map((day) => (
            <div
              key={day.id}
              className="flex flex-wrap items-center gap-[12px] border-b border-edge-soft/60 px-[14px] py-[12px] md:px-[18px]"
            >
              <span className="w-[102px] shrink-0 font-mono text-[13px] font-semibold">
                {day.exam_date}
              </span>
              <span className="block min-w-0 flex-1">
                <span className="block truncate text-[14px]">{day.exam_name}</span>
                <span className="block truncate font-mono text-[10.5px] text-fg-faint">
                  {day.source_filename ?? "entered by hand"} · closed{" "}
                  {clockAt(day.created_at, center.timezone)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setOpenDay(day)}
                className="shrink-0 cursor-pointer rounded-[12px] border border-edge-warm px-[15px] py-[10px] text-[12.5px] font-semibold"
              >
                Look at it
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setDeleting(day)}
                  className="shrink-0 cursor-pointer rounded-[12px] border border-edge px-[13px] py-[10px] text-[12.5px] text-fg-muted hover:border-rust/50 hover:text-rust"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {openDay && <DayDialog key={openDay.id} day={openDay} onClose={() => setOpenDay(null)} />}

      <Dialog
        open={deleting !== null}
        title="Delete this day for good?"
        subtitle={deleting ? `${deleting.exam_name} · ${deleting.exam_date}` : ""}
        onClose={() => setDeleting(null)}
        footer={
          <>
            <button
              type="button"
              disabled={busy}
              onClick={purge}
              className="flex-1 cursor-pointer rounded-[14px] border border-rust bg-rust/20 px-[22px] py-[14px] text-[14px] font-bold text-rust disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete it permanently"}
            </button>
            <button
              type="button"
              onClick={() => setDeleting(null)}
              className="cursor-pointer rounded-[14px] border border-edge px-[20px] py-[14px] text-[14px] font-semibold text-fg-muted"
            >
              Keep it
            </button>
          </>
        }
      >
        <p className="text-[13.5px] leading-[1.55] text-fg-muted">
          Every candidate, every event and every break from this day is removed and cannot be brought
          back.
        </p>
        <p className="mt-[12px] rounded-[14px] border border-gold/35 bg-gold/8 p-[13px] text-[12.5px] leading-[1.5] text-gold">
          This is for a rehearsal or a demonstration. A day that really happened should be kept — it
          costs nothing to leave it here.
        </p>
      </Dialog>
    </div>
  );
}

/** One finished day, read only. */
function DayDialog({ day, onClose }: { day: ExamSession; onClose: () => void }) {
  const { center } = useConsole();
  const [rows, setRows] = useState<Candidate[] | null>(null);

  useEffect(() => {
    let current = true;
    void supabaseBrowser()
      .from("candidates")
      .select("*")
      .eq("exam_session_id", day.id)
      .order("public_token")
      .then(({ data }) => {
        if (current) setRows(data ?? []);
      });
    return () => {
      current = false;
    };
  }, [day.id]);

  return (
    <Dialog
      open
      title={day.exam_name}
      subtitle={`${day.exam_date} · ${rows?.length ?? "…"} candidates · finished`}
      onClose={onClose}
      width={980}
    >
      <div
        style={{ gridTemplateColumns: COLUMNS }}
        className="hidden gap-[12px] border-b border-edge-soft pb-[10px] text-[11px] font-semibold text-fg-dim md:grid"
      >
        <span>Token</span>
        <span>Name</span>
        <span>Part</span>
        <span>Place</span>
        <span>Contact number</span>
        <span>Status</span>
      </div>

      {rows === null && <p className="py-[20px] text-center text-[13px] text-fg-faint">Loading…</p>}

      {rows?.map((c) => {
        const chip = statusChip(c);
        return (
          <div
            key={c.id}
            style={{ gridTemplateColumns: COLUMNS }}
            className="block border-b border-edge-soft/60 py-[11px] md:grid md:items-center md:gap-[12px]"
          >
            <span className="font-mono text-[12.5px] font-semibold">{c.public_token}</span>
            <span className="block min-w-0 truncate text-[13.5px]">{fullName(c)}</span>
            <span className="truncate text-[12.5px] text-fg-muted">{c.part ?? "—"}</span>
            <span className="truncate text-[12.5px] text-fg-muted">{c.place ?? "—"}</span>
            <span className="truncate font-mono text-[12.5px] text-fg-muted">{c.phone ?? "—"}</span>
            <span>
              <span className={`inline-block rounded-[9px] px-[9px] py-[5px] text-[11px] font-semibold ${chip.className}`}>
                {chip.label}
              </span>
            </span>
          </div>
        );
      })}

      {rows?.length === 0 && (
        <p className="py-[20px] text-center text-[13px] text-fg-faint">
          This day has no candidates on it.
        </p>
      )}

      <p className="pt-[14px] text-[12px] text-fg-faint">
        Times are shown at {center.timezone}. This day is finished, so nothing here can be changed.
      </p>
    </Dialog>
  );
}
