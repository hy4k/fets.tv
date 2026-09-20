"use client";

import { useState } from "react";
import { DisplayBoard } from "@/components/display/DisplayBoard";
import { Drawer } from "@/components/ui/Drawer";
import { useDrawers } from "@/lib/drawer-store";
import { useConsole } from "@/lib/console-data";
import { clockAt, fullName } from "@/lib/format";
import { useNow } from "@/lib/use-clock";
import type { NoticeTemplate } from "@/lib/types";

const TONE_CHIP = {
  info: "bg-iris/15 text-iris",
  warning: "bg-gold/15 text-gold",
  urgent: "bg-rust/15 text-rust",
} as const;

const HOLDS = [
  { label: "Until I clear it", minutes: null },
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
];

/**
 * Sending a message to the hall. Staff pick a template and fill its one blank —
 * the wording is fixed, and the database renders the final text, so the board
 * only ever speaks in the centre's own voice. The preview is the real board
 * component, so what staff approve here is exactly what the hall will see.
 */
export function NoticesScreen() {
  const { center, call, candidates, notice, noticeTemplates, displays, operators, rpc, canCall } =
    useConsole();
  const { open, toggle } = useDrawers("notices", { preview: true });
  const now = useNow();

  const [templateId, setTemplateId] = useState(noticeTemplates[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [holdMinutes, setHoldMinutes] = useState<number | null>(null);

  const template = noticeTemplates.find((t) => t.id === templateId) ?? null;
  const called = candidates.find((c) => c.id === call?.candidate_id) ?? null;

  function pick(t: NoticeTemplate) {
    setTemplateId(t.id);
    setValues({});
  }

  /** Mirrors what the database will render, so the preview cannot drift from it. */
  function renderBody(t: NoticeTemplate | null) {
    if (!t) return "";
    let body = t.body_template;
    for (const slot of t.slots) {
      const raw = (values[slot.key] ?? "").trim();
      body = body.replace(`{${slot.key}}`, raw || `${slot.label.toLowerCase()}…`);
    }
    return body;
  }

  const draft = renderBody(template);
  const missing = (template?.slots ?? []).filter((s) => !(values[s.key] ?? "").trim());
  const badTime = (template?.slots ?? []).some(
    (s) =>
      s.type === "time" &&
      (values[s.key] ?? "").trim() !== "" &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test((values[s.key] ?? "").trim()),
  );

  const expiresIn =
    notice?.expires_at != null
      ? Math.max(0, Math.round((new Date(notice.expires_at).getTime() - now) / 60000))
      : null;

  async function send() {
    if (!template) return;
    const ok = await rpc(
      "fets_post_notice",
      {
        p_center: center.id,
        p_template: template.id,
        p_values: values,
        p_expires_minutes: holdMinutes,
      },
      "Notice is on the board",
    );
    if (ok) setValues({});
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[12px] overflow-x-hidden overflow-y-auto">
      <div className="grid min-h-0 shrink-0 grid-cols-[repeat(auto-fit,minmax(330px,1fr))] gap-[12px]">
        <div className="flex flex-col gap-[12px] rounded-[20px] border border-edge-mid panel-bg p-[16px]">
          <span className="text-[11px] font-bold tracking-[0.14em] text-fg-dim uppercase">
            Choose a message
          </span>

          <div className="flex flex-col gap-[7px]">
            {noticeTemplates.map((t) => {
              const active = t.id === templateId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pick(t)}
                  className={`flex cursor-pointer items-center gap-[10px] rounded-[14px] border px-[12px] py-[11px] text-left transition-colors ${
                    active
                      ? "border-gold/55 bg-gold/10"
                      : "border-edge bg-panel-soft hover:border-edge-warm"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold">{t.label}</span>
                    <span className="block overflow-hidden text-[11px] text-fg-faint text-ellipsis whitespace-nowrap">
                      {t.body_template}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-[8px] px-[7px] py-[3px] text-[9px] font-bold tracking-[0.06em] uppercase ${TONE_CHIP[t.tone]}`}
                  >
                    {t.tone}
                  </span>
                </button>
              );
            })}
            {noticeTemplates.length === 0 && (
              <p className="font-mono text-[11px] text-fg-faint">No message templates are set up yet.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-[12px] rounded-[20px] border border-edge-mid panel-bg p-[16px]">
          <span className="text-[11px] font-bold tracking-[0.14em] text-fg-dim uppercase">
            Fill in and send
          </span>

          {template?.slots.map((slot) => (
            <label key={slot.key} className="flex flex-col gap-[6px]">
              <span className="text-[9.5px] font-bold tracking-[0.12em] text-fg-dim uppercase">
                {slot.label}
                {slot.type === "time" && <span className="text-fg-faint"> · 24-hour, e.g. 14:30</span>}
              </span>
              <input
                inputMode={slot.type === "time" ? "numeric" : "text"}
                maxLength={slot.type === "time" ? 5 : 40}
                placeholder={slot.type === "time" ? "14:30" : ""}
                value={values[slot.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [slot.key]: e.target.value }))}
                className="rounded-[12px] border border-edge-strong bg-panel-soft px-[11px] py-[10px] font-mono text-[13px] outline-none focus:border-gold/50"
              />
            </label>
          ))}

          {template && template.slots.length === 0 && (
            <p className="text-[11.5px] text-fg-muted">
              This message has nothing to fill in — it reads exactly as shown.
            </p>
          )}

          <div className="flex flex-col gap-[6px]">
            <span className="text-[9.5px] font-bold tracking-[0.12em] text-fg-dim uppercase">Keep it up</span>
            <div className="flex flex-wrap gap-[6px]">
              {HOLDS.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => setHoldMinutes(h.minutes)}
                  className={`cursor-pointer rounded-[11px] border px-[11px] py-[8px] text-[11px] font-semibold transition-colors ${
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

          {badTime && (
            <p className="text-[11.5px] font-semibold text-rust">
              Enter the time on a 24-hour clock, like 14:30.
            </p>
          )}

          <div className="mt-auto flex flex-wrap gap-[8px] pt-[4px]">
            <button
              type="button"
              disabled={!canCall || !template || missing.length > 0 || badTime}
              onClick={send}
              className="cursor-pointer rounded-[13px] gold-bg px-[16px] py-[12px] text-[12.5px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Put on the TV
            </button>
            <button
              type="button"
              disabled={!canCall || !notice}
              onClick={() => rpc("fets_clear_notice", { p_center: center.id }, "Notice cleared")}
              className="cursor-pointer rounded-[13px] border border-edge px-[14px] py-[12px] text-[12.5px] font-semibold text-fg-muted disabled:opacity-40"
            >
              Take it down
            </button>
          </div>

          {!canCall && (
            <p className="text-[11px] text-gold">Only an admin or a TCA can put a message on the TV.</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-[10px] rounded-[18px] border border-edge-mid bg-panel-soft px-[14px] py-[12px]">
        <span className="text-[10px] font-bold tracking-[0.14em] text-fg-dim uppercase">On the board</span>
        {notice ? (
          <>
            <span className="min-w-0 flex-1 text-[12.5px]">{notice.body}</span>
            <span className="font-mono text-[10.5px] text-fg-faint">
              {operators[notice.created_by ?? ""] ?? "—"} ·{" "}
              {clockAt(notice.created_at, center.timezone)}
              {expiresIn !== null && ` · ${expiresIn} min left`}
            </span>
          </>
        ) : (
          <span className="flex-1 font-mono text-[11.5px] text-fg-faint">
            Nothing — the board is showing calls only.
          </span>
        )}
      </div>

      <Drawer
        label="What the hall sees"
        meta={call ? "call in progress" : "idle"}
        open={open.preview}
        onToggle={toggle("preview")}
      >
        <div className="aspect-video w-full max-w-[760px] shrink-0">
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
            notice={
              template && missing.length === 0 && !badTime
                ? { body: draft, tone: template.tone }
                : notice
                  ? { body: notice.body, tone: notice.tone }
                  : null
            }
            next={candidates
              .filter((c) => c.status === "waiting" && !c.called_at)
              .slice(0, 4)
              .map((c) => ({
                token: c.public_token,
                name: center.show_name_on_tv ? fullName(c) : null,
              }))}
          />
        </div>
        <p className="shrink-0 pt-[8px] font-mono text-[10.5px] text-fg-faint">
          A message never hides a call. While someone is being called it sits underneath; when the board is
          idle it takes the whole screen.
        </p>
      </Drawer>
    </div>
  );
}
