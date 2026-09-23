"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useConsole } from "@/lib/console-data";
import { clockAt } from "@/lib/format";
import { useNow } from "@/lib/use-clock";
import type { DutyBlock, DutyPost } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  front: "Front of house",
  admin: "Admin room",
  lab: "Lab",
  floating: "Relief",
};

/**
 * How a block's remaining time reads. Past its end is not a failure, but it
 * shows. The clock reads zero until it starts on the client, and a countdown
 * against that would be decades wrong for the frame before it does.
 */
function band(msLeft: number, live: boolean) {
  if (!live) return { text: "text-fg-faint", card: "border-edge-mid panel-bg", over: false };
  const minutes = msLeft / 60000;
  if (minutes <= 0) return { text: "text-rust", card: "border-rust/60 bg-rust/8", over: true };
  if (minutes <= 10) return { text: "text-gold-bright", card: "border-gold/45 bg-gold/8", over: false };
  return { text: "text-mint", card: "border-edge-mid panel-bg", over: false };
}

function left(ms: number) {
  const over = ms <= 0;
  const total = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const body = h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  return over ? `+${body}` : body;
}

/**
 * The duty board: who is standing where, and for how much longer.
 *
 * A post with nobody on it is not an error — a small centre does not staff
 * every post every hour — but it is shown plainly rather than hidden, because
 * an empty lab post at eleven in the morning is worth noticing.
 */
export function DutyScreen() {
  const { center, dutyPosts, dutyBlocks, rules, rpc, canCall } = useConsole();
  const now = useNow();
  const [assigning, setAssigning] = useState<DutyPost | null>(null);

  const posts = useMemo(
    () => dutyPosts.filter((p) => p.active).sort((a, b) => a.position - b.position),
    [dutyPosts],
  );

  const openOn = (postId: string) =>
    dutyBlocks.find((b) => b.post_id === postId && !b.ended_at) ?? null;

  const endsAt = (b: DutyBlock) => new Date(b.started_at).getTime() + b.minutes * 60000;

  const live = now > 0;

  const overdue = posts
    .map((p) => ({ post: p, block: openOn(p.id) }))
    .filter((x) => live && x.block && endsAt(x.block) <= now);

  const empty = posts.filter((p) => !openOn(p.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[11px]">
      {overdue.length > 0 && (
        <div className="shrink-0 rounded-[15px] border-2 border-rust bg-rust/12 px-[15px] py-[12px] text-[14px] font-bold text-rust">
          {overdue.length === 1
            ? `${overdue[0].block!.profile_name} has been on ${overdue[0].post.name} past their block`
            : `${overdue.length} posts are past their block: ${overdue.map((x) => x.post.name).join(", ")}`}
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center gap-[10px]">
        <span className="text-[11px] font-bold tracking-[0.13em] text-fg-dim uppercase">
          On duty
        </span>
        <span className="font-mono text-[13px] font-semibold text-gold">
          {posts.length - empty.length}/{posts.length}
        </span>
        <span className="h-px min-w-[12px] flex-1 bg-edge-soft" />
        <span className="text-[12px] text-fg-faint">
          Blocks run {rules.duty_block_minutes} minutes
        </span>
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-min gap-[10px] overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
        {posts.map((post) => {
          const block = openOn(post.id);
          const tone = block ? band(endsAt(block) - now, live) : null;

          return (
            <div
              key={post.id}
              className={`flex flex-col gap-[10px] rounded-[18px] border p-[14px] ${
                tone ? tone.card : "border-dashed border-edge-warm bg-panel-soft/40"
              }`}
            >
              <div className="flex items-baseline gap-[8px]">
                <span className="min-w-0 flex-1 truncate font-serif text-[18px]">{post.name}</span>
                <span className="shrink-0 font-mono text-[10px] tracking-[0.1em] text-fg-faint uppercase">
                  {KIND_LABEL[post.kind] ?? post.kind}
                </span>
              </div>

              {block ? (
                <>
                  <div className="flex items-end gap-[10px]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">
                        {block.profile_name}
                      </span>
                      <span className="block font-mono text-[11px] text-fg-faint">
                        since {clockAt(block.started_at, center.timezone)} · until{" "}
                        {clockAt(new Date(endsAt(block)).toISOString(), center.timezone)}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 font-mono text-[22px] leading-none font-semibold ${tone!.text}`}
                    >
                      {live ? left(endsAt(block) - now) : "—"}
                    </span>
                  </div>

                  {block.note && (
                    <p className="rounded-[11px] bg-panel-soft px-[10px] py-[8px] text-[12px] text-fg-muted">
                      {block.note}
                    </p>
                  )}

                  <div className="flex gap-[7px]">
                    <button
                      type="button"
                      disabled={!canCall}
                      onClick={() => setAssigning(post)}
                      className="flex-1 cursor-pointer rounded-[12px] gold-bg px-[13px] py-[10px] text-[12.5px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Hand over
                    </button>
                    <button
                      type="button"
                      disabled={!canCall}
                      onClick={() =>
                        rpc("fets_end_duty", { p_block: block.id }, `${post.name} stood down`)
                      }
                      className="cursor-pointer rounded-[12px] border border-edge px-[13px] py-[10px] text-[12.5px] font-semibold text-fg-muted hover:border-edge-warm disabled:opacity-40"
                    >
                      Stand down
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[13px] text-fg-faint">Nobody is on this post.</p>
                  <button
                    type="button"
                    disabled={!canCall}
                    onClick={() => setAssigning(post)}
                    className="cursor-pointer rounded-[12px] border border-edge-warm px-[13px] py-[10px] text-[12.5px] font-semibold hover:bg-panel disabled:opacity-40"
                  >
                    Put somebody on
                  </button>
                </>
              )}
            </div>
          );
        })}

        {posts.length === 0 && (
          <p className="rounded-[18px] border border-gold/35 bg-gold/8 p-[14px] text-[13px] text-gold sm:col-span-2 xl:col-span-3">
            This centre has no posts set up. Add them under Setup.
          </p>
        )}
      </div>

      {assigning && (
        <AssignDialog
          key={assigning.id}
          post={assigning}
          current={openOn(assigning.id)}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  );
}

/** Choosing who takes the post. The list is everybody at the centre. */
function AssignDialog({
  post,
  current,
  onClose,
}: {
  post: DutyPost;
  current: DutyBlock | null;
  onClose: () => void;
}) {
  const { operators, rules, rpc, dutyPosts, dutyBlocks } = useConsole();
  const [minutes, setMinutes] = useState(String(rules.duty_block_minutes));
  const [note, setNote] = useState("");

  const people = Object.entries(operators).sort((a, b) => a[1].localeCompare(b[1]));

  // Somebody already holding another post is not forbidden — relief covers two
  // at a busy moment — but it is worth saying before it happens by accident.
  const holds = (id: string) =>
    dutyBlocks
      .filter((b) => !b.ended_at && b.profile_id === id && b.post_id !== post.id)
      .map((b) => dutyPosts.find((p) => p.id === b.post_id)?.name)
      .filter(Boolean)
      .join(", ");

  const mins = Number(minutes);
  const sane = Number.isFinite(mins) && mins >= 15 && mins <= 480;

  return (
    <Dialog
      open
      title={post.name}
      subtitle={
        current
          ? `${current.profile_name} comes off as the next person goes on`
          : "Nobody is on this post"
      }
      onClose={onClose}
      width={480}
    >
      <div className="flex flex-col gap-[12px]">
        <label className="flex items-center gap-[10px] rounded-[13px] border border-edge-strong bg-panel-soft px-[12px] py-[10px]">
          <span className="shrink-0 text-[12px] font-semibold text-fg-faint">Block length</span>
          <input
            value={minutes}
            onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            maxLength={3}
            className={`w-[62px] rounded-[10px] border bg-panel px-[9px] py-[7px] text-center font-mono text-[13.5px] outline-none ${
              sane ? "border-edge-strong" : "border-rust text-rust"
            }`}
          />
          <span className="text-[12px] text-fg-faint">minutes</span>
        </label>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          placeholder="Anything they should know (optional)"
          className="rounded-[13px] border border-edge-strong bg-panel-soft px-[12px] py-[10px] text-[13.5px] outline-none placeholder:text-fg-faint focus:border-gold/50"
        />

        <div className="flex flex-col gap-[7px]">
          {people.map(([id, name]) => {
            const elsewhere = holds(id);
            const isCurrent = current?.profile_id === id;

            return (
              <button
                key={id}
                type="button"
                disabled={isCurrent || !sane}
                onClick={async () => {
                  const ok = await rpc(
                    "fets_start_duty",
                    {
                      p_post: post.id,
                      p_profile: id,
                      p_minutes: mins,
                      p_note: note.trim() || null,
                    },
                    `${name} is on ${post.name}`,
                  );
                  if (ok) onClose();
                }}
                className={`flex items-center gap-[10px] rounded-[13px] border px-[13px] py-[11px] text-left ${
                  isCurrent
                    ? "cursor-not-allowed border-mint/40 bg-mint/8"
                    : "cursor-pointer border-edge bg-panel-soft hover:border-gold/50 hover:bg-gold/8 disabled:cursor-not-allowed disabled:opacity-40"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{name}</span>
                  {elsewhere && (
                    <span className="block truncate font-mono text-[10.5px] text-gold">
                      already on {elsewhere}
                    </span>
                  )}
                </span>
                {isCurrent && (
                  <span className="shrink-0 font-mono text-[10.5px] tracking-[0.08em] text-mint uppercase">
                    on now
                  </span>
                )}
              </button>
            );
          })}

          {people.length === 0 && (
            <p className="font-mono text-[11.5px] text-fg-faint">
              Nobody is set up at this centre yet.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
