"use client";

import { useState } from "react";
import { DisplayBoard } from "@/components/display/DisplayBoard";
import { useConsole } from "@/lib/console-data";
import { clockAt, fullName } from "@/lib/format";
import { useNow } from "@/lib/use-clock";
import type { NoticeTemplate } from "@/lib/types";

const HOLDS = [
  { label: "Until I remove it", minutes: null },
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
];

/**
 * One path down the page: pick a message, fill the blank if it has one, look at
 * it, put it up. The wording is fixed and rendered in the database, so the
 * board only ever speaks in the centre's own voice.
 */
export function NoticesScreen() {
  const { center, call, candidates, notice, noticeTemplates, displays, operators, rpc, canCall } =
    useConsole();
  const now = useNow();

  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [holdMinutes, setHoldMinutes] = useState<number | null>(null);

  const template = noticeTemplates.find((t) => t.id === templateId) ?? null;
  const called = candidates.find((c) => c.id === call?.candidate_id) ?? null;

  function pick(t: NoticeTemplate) {
    setTemplateId(t.id === templateId ? "" : t.id);
    setValues({});
  }

  /** Mirrors what the database will render, so the preview cannot drift from it. */
  const draft = (() => {
    if (!template) return "";
    let body = template.body_template;
    for (const slot of template.slots) {
      const raw = (values[slot.key] ?? "").trim();
      body = body.replace(`{${slot.key}}`, raw || "…");
    }
    return body;
  })();

  const missing = (template?.slots ?? []).filter((s) => !(values[s.key] ?? "").trim());
  const badTime = (template?.slots ?? []).some(
    (s) =>
      s.type === "time" &&
      (values[s.key] ?? "").trim() !== "" &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test((values[s.key] ?? "").trim()),
  );
  const ready = !!template && missing.length === 0 && !badTime;

  const expiresIn =
    notice?.expires_at != null
      ? Math.max(0, Math.round((new Date(notice.expires_at).getTime() - now) / 60000))
      : null;

  async function send() {
    if (!template) return;
    const ok = await rpc(
      "fets_post_notice",
      { p_center: center.id, p_template: template.id, p_values: values, p_expires_minutes: holdMinutes },
      "The message is on the TV",
    );
    if (ok) {
      setTemplateId("");
      setValues({});
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-x-hidden overflow-y-auto">
      {/* What the hall is being told right now, or that it is being told nothing. */}
      <div
        className={`flex shrink-0 flex-wrap items-center gap-[14px] rounded-[18px] border px-[18px] py-[15px] ${
          notice ? "border-gold/45 bg-gold/8" : "border-edge-mid bg-panel-soft"
        }`}
      >
        <span className="text-[11px] font-semibold text-fg-dim">ON THE TV NOW</span>
        {notice ? (
          <>
            <span className="min-w-0 flex-1 text-[15px]">{notice.body}</span>
            <span className="text-[12px] text-fg-faint">
              {operators[notice.created_by ?? ""] ?? "—"} · {clockAt(notice.created_at, center.timezone)}
              {expiresIn !== null && ` · ${expiresIn} min left`}
            </span>
            <button
              type="button"
              disabled={!canCall}
              onClick={() => rpc("fets_clear_notice", { p_center: center.id }, "Message removed")}
              className="cursor-pointer rounded-[12px] border border-edge-warm bg-panel px-[16px] py-[10px] text-[13px] font-semibold disabled:opacity-40"
            >
              Remove it
            </button>
          </>
        ) : (
          <span className="flex-1 text-[14px] text-fg-faint">
            No message. The TV is showing calls only.
          </span>
        )}
      </div>

      {/* Step 1 */}
      <Step n="1" title="Pick a message">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[10px]">
          {noticeTemplates.map((t) => {
            const active = t.id === templateId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t)}
                className={`cursor-pointer rounded-[16px] border p-[14px] text-left transition-colors ${
                  active
                    ? "border-gold/60 bg-gold/10"
                    : "border-edge bg-panel-soft hover:border-edge-warm"
                }`}
              >
                <span className="block text-[14px] leading-[1.4]">
                  {t.body_template.replace(/\{[a-z_]+\}/g, "…")}
                </span>
              </button>
            );
          })}
        </div>
        {noticeTemplates.length === 0 && (
          <p className="text-[13px] text-fg-faint">No messages are set up yet.</p>
        )}
      </Step>

      {/* Step 2 — only when there is something to fill in */}
      {template && (
        <Step n="2" title={template.slots.length > 0 ? "Fill in the blank" : "Nothing to fill in"}>
          {template.slots.length > 0 ? (
            <div className="flex flex-wrap gap-[14px]">
              {template.slots.map((slot) => (
                <label key={slot.key} className="flex w-[220px] flex-col gap-[7px]">
                  <span className="text-[12px] text-fg-muted">
                    {slot.label}
                    {slot.type === "time" && " — like 14:30"}
                  </span>
                  <input
                    inputMode={slot.type === "time" ? "numeric" : "text"}
                    maxLength={slot.type === "time" ? 5 : 40}
                    placeholder={slot.type === "time" ? "14:30" : ""}
                    value={values[slot.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [slot.key]: e.target.value }))}
                    className="rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] font-mono text-[16px] outline-none focus:border-gold/50"
                  />
                </label>
              ))}
            </div>
          ) : (
            <p className="text-[14px] text-fg-muted">This message reads exactly as shown above.</p>
          )}
          {badTime && (
            <p className="text-[13px] font-semibold text-rust">
              Write the time on a 24-hour clock, like 14:30.
            </p>
          )}
        </Step>
      )}

      {/* Step 3 */}
      {template && (
        <Step n="3" title="Check it, then put it up">
          <div className="flex flex-wrap items-start gap-[18px]">
            <div className="aspect-video w-full max-w-[520px] shrink-0">
              <DisplayBoard
                className="h-full"
                hallLabel={displays[0]?.hall_label ?? "HALL 1"}
                siteLabel={`${center.site_code} · ${center.name.replace(/^FETS\s+/i, "").toUpperCase()}`}
                timezone={center.timezone}
                nonce={call?.call_nonce ?? 0}
                call={
                  called
                    ? {
                        token: called.public_token,
                        name: center.show_name_on_tv ? fullName(called) : null,
                        room: call?.room_label ?? null,
                        instruction: call?.instruction ?? null,
                      }
                    : null
                }
                notice={ready ? { body: draft, tone: template.tone } : null}
                next={candidates
                  .filter((c) => c.status === "waiting" && !c.called_at)
                  .slice(0, 3)
                  .map((c) => ({
                    token: c.public_token,
                    name: center.show_name_on_tv ? fullName(c) : null,
                  }))}
              />
            </div>

            <div className="flex min-w-[240px] flex-1 flex-col gap-[16px]">
              <div className="flex flex-col gap-[8px]">
                <span className="text-[12px] text-fg-muted">Keep it up for</span>
                <div className="flex flex-wrap gap-[8px]">
                  {HOLDS.map((h) => (
                    <button
                      key={h.label}
                      type="button"
                      onClick={() => setHoldMinutes(h.minutes)}
                      className={`cursor-pointer rounded-[12px] border px-[14px] py-[11px] text-[13px] font-semibold transition-colors ${
                        holdMinutes === h.minutes
                          ? "border-gold/55 bg-gold/12 text-gold-bright"
                          : "border-edge bg-panel-soft text-fg-muted hover:border-edge-warm"
                      }`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={!canCall || !ready}
                onClick={send}
                className="cursor-pointer rounded-[14px] gold-bg px-[24px] py-[15px] text-[15px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Put it on the TV
              </button>

              {!canCall && (
                <p className="text-[12.5px] text-gold">
                  Only an admin or a TCA can put a message on the TV.
                </p>
              )}

              <p className="text-[12.5px] leading-[1.5] text-fg-faint">
                A message never hides a call. While somebody is being called it sits underneath; when the
                TV is idle it fills the screen.
              </p>
            </div>
          </div>
        </Step>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex shrink-0 flex-col gap-[14px] rounded-[20px] border border-edge-mid panel-bg p-[18px]">
      <div className="flex items-center gap-[11px]">
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] bg-panel-soft font-mono text-[13px] font-semibold text-fg-dim">
          {n}
        </span>
        <span className="text-[16px] font-semibold">{title}</span>
      </div>
      {children}
    </section>
  );
}
