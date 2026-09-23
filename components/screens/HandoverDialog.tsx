"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useConsole } from "@/lib/console-data";
import { clockAt, sinceLabel } from "@/lib/format";
import { handoverState, isQuiet } from "@/lib/handover";
import { useNow } from "@/lib/use-clock";
import type { DutyBlock, DutyPost } from "@/lib/types";

/**
 * Handing a post over.
 *
 * Three things in one screen, in the order they happen at the desk. What the
 * room is doing right now, which the outgoing person reads out and the incoming
 * person reads along with. Anything the outgoing person wants to add in their
 * own words. Then the incoming person's PIN, typed on this screen, which is
 * what turns "I told them" into a record that they were actually there.
 *
 * The state is read from the snapshot already in memory rather than fetched.
 * A handover happens at the worst moment of the day and a spinner here is a
 * screen that gets skipped.
 */
export function HandoverDialog({
  post,
  current,
  onClose,
}: {
  post: DutyPost;
  current: DutyBlock;
  onClose: () => void;
}) {
  const {
    center,
    candidates,
    incidents,
    materials,
    materialKinds,
    openBreaks,
    walkthroughs,
    workstations,
    rules,
    operators,
    pinSetAt,
    dutyBlocks,
    dutyPosts,
    rpc,
  } = useConsole();

  const now = useNow();
  const live = now > 0;

  const [taking, setTaking] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const state = useMemo(
    () =>
      handoverState(
        {
          candidates,
          incidents,
          materials,
          materialKinds,
          openBreaks,
          walkthroughs,
          workstations,
          walkthroughMinutes: rules.walkthrough_minutes,
        },
        now,
      ),
    [
      candidates,
      incidents,
      materials,
      materialKinds,
      openBreaks,
      walkthroughs,
      workstations,
      rules,
      now,
    ],
  );

  const people = Object.entries(operators)
    .filter(([id]) => id !== current.profile_id)
    .sort((a, b) => a[1].localeCompare(b[1]));

  // Somebody already on another post can still take this one — relief doubles
  // up at a busy moment — but it is worth saying before it happens by accident.
  const holds = (id: string) =>
    dutyBlocks
      .filter((b) => !b.ended_at && b.profile_id === id && b.post_id !== post.id)
      .map((b) => dutyPosts.find((p) => p.id === b.post_id)?.name)
      .filter(Boolean)
      .join(", ");

  const ready = taking !== null && /^[0-9]{4,6}$/.test(pin) && pinSetAt[taking] !== null;

  async function accept() {
    if (!ready || busy) return;
    setBusy(true);
    const ok = await rpc(
      "fets_accept_handover",
      {
        p_post: post.id,
        p_profile: taking,
        p_pin: pin,
        p_handover_note: note.trim() || null,
      },
      `${operators[taking!]} has ${post.name}`,
    );
    setBusy(false);
    setPin("");
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      title={`Hand over ${post.name}`}
      subtitle={`${current.profile_name} has held it since ${clockAt(current.started_at, center.timezone)}`}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={accept}
            className="flex-1 cursor-pointer rounded-[14px] gold-bg px-[20px] py-[14px] text-[14px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {taking === null
              ? "Who is taking it?"
              : pinSetAt[taking] === null
                ? `${operators[taking]} has no PIN yet`
                : /^[0-9]{4,6}$/.test(pin)
                  ? busy
                    ? "Checking…"
                    : `${operators[taking]} accepts ${post.name}`
                  : `${operators[taking]}, type your PIN`}
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
      <div className="flex flex-col gap-[13px]">
        {/* 1. What the room is doing. */}
        <section className="flex flex-col gap-[9px] rounded-[15px] border border-edge bg-panel-soft p-[12px]">
          <h3 className="text-[10.5px] font-bold tracking-[0.13em] text-fg-dim uppercase">
            The room right now
          </h3>

          {isQuiet(state) ? (
            <p className="text-[13px] text-fg-muted">
              Nothing outstanding. Nobody is sitting, nothing is out, no incident is open.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-[7px]">
                <Tally n={state.seated.length} label="sitting" tone={state.seated.length > 0} />
                <Tally n={state.inProcess} label="in, not yet seated" tone={state.inProcess > 0} />
                <Tally
                  n={state.awaitingSignOut}
                  label="waiting to sign out"
                  tone={state.awaitingSignOut > 0}
                />
                <Tally n={state.notArrived} label="not arrived" tone={false} />
              </div>

              {state.seated.length > 0 && (
                <ul className="flex flex-col gap-[4px]">
                  {state.seated.map((c) => {
                    const over = live && c.endsAt !== null && now >= c.endsAt;
                    return (
                      <li
                        key={c.id}
                        className={`flex items-baseline gap-[8px] rounded-[10px] px-[9px] py-[6px] text-[12.5px] ${
                          c.onBreak ? "bg-gold/10" : "bg-panel"
                        }`}
                      >
                        <span className="shrink-0 font-mono text-[11.5px] text-gold">
                          {c.seat ?? "—"}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        {c.onBreak && c.breakSince !== null && (
                          <span className="shrink-0 font-mono text-[10.5px] text-gold-bright">
                            on break {live ? sinceLabel(new Date(c.breakSince).toISOString(), now) : ""}
                          </span>
                        )}
                        <span
                          className={`shrink-0 font-mono text-[11.5px] ${over ? "text-rust" : "text-fg-faint"}`}
                        >
                          {c.endsAt === null
                            ? "no clock"
                            : `until ${clockAt(new Date(c.endsAt).toISOString(), center.timezone)}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {state.openIncidents.length > 0 && (
                <ul className="flex flex-col gap-[4px]">
                  {state.openIncidents.map((i) => (
                    <li
                      key={i.id}
                      className="flex items-baseline gap-[8px] rounded-[10px] bg-rust/10 px-[9px] py-[6px] text-[12.5px] text-rust"
                    >
                      <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase">
                        open
                      </span>
                      <span className="min-w-0 flex-1 truncate">{i.summary}</span>
                      <span className="shrink-0 font-mono text-[10.5px]">
                        {clockAt(i.started_at, center.timezone)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {state.materialsOut.length > 0 && (
                <p className="text-[12.5px] text-fg-muted">
                  <span className="font-semibold text-fg">Still out:</span>{" "}
                  {state.materialsOut
                    .map((m) => `${m.count} × ${m.label} to ${m.token}`)
                    .join(" · ")}
                </p>
              )}
            </>
          )}

          <p
            className={`font-mono text-[11px] ${
              state.walkOverdueMinutes !== null && state.walkOverdueMinutes > 0
                ? "text-rust"
                : "text-fg-faint"
            }`}
          >
            {state.lastWalk
              ? `Floor last walked ${clockAt(state.lastWalk.walked_at, center.timezone)} by ${state.lastWalk.walked_by_name}` +
                (state.walkOverdueMinutes !== null && state.walkOverdueMinutes > 0
                  ? ` — ${state.walkOverdueMinutes}m overdue`
                  : "")
              : "The floor has not been walked yet today."}
          </p>
        </section>

        {/* 2. The outgoing person's own words. */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder={`Anything else ${current.profile_name} is handing over (optional)`}
          className="resize-none rounded-[13px] border border-edge-strong bg-panel-soft px-[12px] py-[10px] text-[13.5px] outline-none placeholder:text-fg-faint focus:border-gold/50"
        />

        {/* 3. The incoming person's signature. */}
        <section className="flex flex-col gap-[9px]">
          <h3 className="text-[10.5px] font-bold tracking-[0.13em] text-fg-dim uppercase">
            Who is taking it
          </h3>

          <div className="flex flex-wrap gap-[7px]">
            {people.map(([id, name]) => {
              const elsewhere = holds(id);
              const chosen = taking === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setTaking(chosen ? null : id);
                    setPin("");
                  }}
                  className={`cursor-pointer rounded-[12px] border px-[12px] py-[9px] text-left text-[13px] font-semibold ${
                    chosen
                      ? "border-gold/55 bg-gold/12 text-gold-bright"
                      : "border-edge bg-panel-soft hover:border-edge-warm"
                  }`}
                >
                  {name}
                  {(elsewhere || pinSetAt[id] === null) && (
                    <span className="block font-mono text-[10px] font-normal text-fg-faint">
                      {pinSetAt[id] === null ? "no PIN" : `on ${elsewhere}`}
                    </span>
                  )}
                </button>
              );
            })}

            {people.length === 0 && (
              <p className="font-mono text-[11.5px] text-fg-faint">
                There is nobody else at this centre to hand it to.
              </p>
            )}
          </div>

          {taking !== null &&
            (pinSetAt[taking] === null ? (
              <p className="rounded-[12px] border border-gold/35 bg-gold/8 px-[11px] py-[9px] text-[12.5px] text-gold">
                {operators[taking]} has not set a PIN. An admin can set one under Setup, or use
                Put somebody on to place them without a signature.
              </p>
            ) : (
              <label className="flex items-center gap-[10px] rounded-[13px] border border-gold/45 bg-gold/8 px-[12px] py-[10px]">
                <span className="shrink-0 text-[12.5px] font-semibold text-gold-bright">
                  {operators[taking]}, type your PIN
                </span>
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  placeholder="••••"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void accept();
                  }}
                  className="w-[110px] rounded-[10px] border border-edge-strong bg-panel px-[11px] py-[8px] text-center font-mono text-[18px] tracking-[0.3em] outline-none focus:border-gold/60"
                />
              </label>
            ))}
        </section>
      </div>
    </Dialog>
  );
}

function Tally({ n, label, tone }: { n: number; label: string; tone: boolean }) {
  return (
    <span
      className={`rounded-[10px] px-[9px] py-[6px] text-[12px] ${
        tone ? "bg-gold/12 text-gold-bright" : "bg-panel text-fg-faint"
      }`}
    >
      <span className="font-mono text-[13.5px] font-semibold">{n}</span> {label}
    </span>
  );
}
