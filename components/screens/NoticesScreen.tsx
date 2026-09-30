"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DisplayBoard } from "@/components/display/DisplayBoard";
import { useConsole } from "@/lib/console-data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clockAt, fullName } from "@/lib/format";
import { useNow } from "@/lib/use-clock";
import {
  NOTICE_BACKGROUNDS,
  NOTICE_COLOURS,
  NOTICE_FONTS,
  NOTICE_SHAPES,
  NOTICE_SIZES,
  type NoticeStyle,
} from "@/lib/notice-style";
import type { NoticeMediaKind, NoticePreset, NoticeTemplate, NoticeTone } from "@/lib/types";

const HOLDS = [
  { label: "Until I remove it", minutes: null },
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
];

const TONES: { key: NoticeTone; label: string }[] = [
  { key: "info", label: "Notice" },
  { key: "warning", label: "Please note" },
  { key: "urgent", label: "Important" },
];

const MAX_BODY = 280;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function kindOf(type: string): NoticeMediaKind {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  return "file";
}

/**
 * One path down the page: pick a message, fill the blank, change the wording if
 * it needs changing, look at it, put it up. The templates keep the centre's
 * routine wording the same every time; the custom message is for the day that
 * does not fit one, and can carry a picture or a clip.
 */
export function NoticesScreen() {
  const { center, call, candidates, notice, noticeTemplates, displays, names, rpc, notify, canCall } =
    useConsole();
  const now = useNow();

  const [mode, setMode] = useState<"template" | "custom">("template");
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [body, setBody] = useState("");
  const [tone, setTone] = useState<NoticeTone>("info");
  const [holdMinutes, setHoldMinutes] = useState<number | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // The look of a custom message, and the messages kept to be used again.
  const [style, setStyle] = useState<NoticeStyle>({});
  const [presets, setPresets] = useState<NoticePreset[]>([]);
  const [presetName, setPresetName] = useState("");

  const loadPresets = useCallback(async () => {
    const { data } = await supabaseBrowser()
      .from("notice_presets" as never)
      .select("*")
      .eq("center_id", center.id)
      .order("label");
    setPresets((data ?? []) as unknown as NoticePreset[]);
  }, [center.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPresets();
  }, [loadPresets]);

  function editPreset(p: NoticePreset) {
    setMode("custom");
    setTemplateId("");
    setValues({});
    setBody(p.body);
    setTone(p.tone);
    setStyle(p.style ?? {});
    setPresetName(p.label);
    chooseFile(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function savePreset() {
    const ok = await rpc(
      "fets_save_notice_preset",
      { p_center: center.id, p_label: presetName, p_body: draft, p_tone: tone, p_style: style },
      `Saved as "${presetName.trim()}"`,
    );
    if (ok) void loadPresets();
  }

  async function removePreset(p: NoticePreset) {
    const ok = await rpc("fets_delete_notice_preset", { p_preset: p.id }, `"${p.label}" removed`);
    if (ok) void loadPresets();
  }

  async function putUp(p: NoticePreset) {
    setBusy(true);
    await rpc(
      "fets_post_custom_notice",
      { p_center: center.id, p_body: p.body, p_tone: p.tone, p_expires_minutes: holdMinutes, p_style: p.style ?? {} },
      "The message is on the TV",
    );
    setBusy(false);
  }

  const template = noticeTemplates.find((t) => t.id === templateId) ?? null;
  const called = candidates.find((c) => c.id === call?.candidate_id) ?? null;

  function pick(t: NoticeTemplate) {
    const same = t.id === templateId;
    setTemplateId(same ? "" : t.id);
    setValues({});
    // The wording starts as the template's own; staff change it only if they
    // want to, and what they see is what goes up.
    setBody(same ? "" : t.body_template);
    setTone(same ? "info" : t.tone);
  }

  /** What the board will actually show. Slots are filled into the wording as typed. */
  const draft = (() => {
    let text = body;
    for (const slot of template?.slots ?? []) {
      const raw = (values[slot.key] ?? "").trim();
      text = text.replace(`{${slot.key}}`, raw || "…");
    }
    return text;
  })();

  const missing = (template?.slots ?? []).filter(
    (s) => body.includes(`{${s.key}}`) && !(values[s.key] ?? "").trim(),
  );
  const badTime = (template?.slots ?? []).some(
    (s) =>
      s.type === "time" &&
      (values[s.key] ?? "").trim() !== "" &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test((values[s.key] ?? "").trim()),
  );
  const tooLong = draft.length > MAX_BODY;

  const ready =
    mode === "template"
      ? !!template && missing.length === 0 && !badTime && !tooLong
      : (draft.trim().length > 0 || !!file) && !tooLong;

  const expiresIn =
    notice?.expires_at != null
      ? Math.max(0, Math.round((new Date(notice.expires_at).getTime() - now) / 60000))
      : null;

  function chooseFile(next: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next && next.type.startsWith("image/") ? URL.createObjectURL(next) : null);

    // The centre's own folder, which is what both the storage policy and the
    // posting function insist on. Decided here rather than at send time so a
    // retry after a failed send reuses the name instead of orphaning a copy.
    setFilePath(
      next
        ? `${center.id}/${crypto.randomUUID()}-${next.name.replace(/[^A-Za-z0-9._-]/g, "-").slice(-80)}`
        : null,
    );
  }

  function reset() {
    setTemplateId("");
    setValues({});
    setBody("");
    setTone("info");
    setStyle({});
    setPresetName("");
    chooseFile(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function send() {
    setBusy(true);
    try {
      if (mode === "template") {
        // The database renders the slots itself; the override is the wording,
        // slots and all, so what was previewed is what is stored.
        const ok = await rpc(
          "fets_post_notice",
          {
            p_center: center.id,
            p_template: template!.id,
            p_values: values,
            p_expires_minutes: holdMinutes,
            p_body_override: body === template!.body_template ? null : body,
          },
          "The message is on the TV",
        );
        if (ok) reset();
        return;
      }

      let mediaPath: string | null = null;
      let mediaKind: NoticeMediaKind | null = null;

      if (file) {
        if (file.size > MAX_FILE_BYTES) {
          // The bucket refuses it anyway; saying so here is kinder than a 400.
          throw new Error("That file is larger than 25 MB.");
        }

        const path = filePath!;

        const { error } = await supabaseBrowser()
          .storage.from("notice-media")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (error) throw new Error(error.message);

        mediaPath = path;
        mediaKind = kindOf(file.type);
      }

      const ok = await rpc(
        "fets_post_custom_notice",
        {
          p_center: center.id,
          p_body: draft,
          p_tone: tone,
          p_media_path: mediaPath,
          p_media_kind: mediaKind,
          p_expires_minutes: holdMinutes,
          p_style: style,
        },
        "The message is on the TV",
      );
      if (ok) reset();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Could not send that message", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-x-hidden overflow-y-auto">
      {/* What the hall is being told right now, or that it is being told nothing. */}
      <div
        className={`flex shrink-0 flex-wrap items-center gap-[14px] rounded-[18px] border px-[18px] py-[15px] ${
          notice ? "border-gold/45 bg-gold/8" : "border-edge-mid bg-panel-soft"
        }`}
      >
        <span className="text-[11px] font-semibold text-fg-dim">ON THE TV NOW</span>
        {notice ? (
          <>
            <span className="min-w-0 flex-1 text-[15px]">
              {notice.body || "(a picture, with no words)"}
              {notice.media_kind && (
                <span className="ml-[9px] rounded-[8px] bg-iris/18 px-[8px] py-[3px] text-[10.5px] font-bold text-iris uppercase">
                  {notice.media_kind}
                </span>
              )}
            </span>
            <span className="text-[12px] text-fg-faint">
              {names[notice.created_by ?? ""] ?? "—"} · {clockAt(notice.created_at, center.timezone)}
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

      <div className="flex shrink-0 gap-[8px]">
        {(
          [
            ["template", "Use a standard message"],
            ["custom", "Write your own"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMode(key);
              reset();
            }}
            className={`cursor-pointer rounded-[13px] border px-[16px] py-[11px] text-[13.5px] font-semibold transition-colors ${
              mode === key
                ? "border-accent/50 bg-accent/10 text-fg"
                : "border-edge bg-panel-soft text-fg-muted hover:border-edge-warm"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {presets.length > 0 && (
        <section className="flex shrink-0 flex-col gap-[12px] rounded-[20px] border border-edge-mid panel-bg p-[18px]">
          <span className="text-[16px] font-semibold">Saved messages</span>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-[10px]">
            {presets.map((p) => (
              <div key={p.id} className="flex flex-col gap-[10px] rounded-[16px] border border-edge bg-panel-soft p-[13px]">
                <span className="flex items-baseline gap-[8px]">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{p.label}</span>
                  <button
                    type="button"
                    disabled={!canCall}
                    onClick={() => void removePreset(p)}
                    aria-label={`Remove ${p.label}`}
                    className="cursor-pointer px-[4px] text-[15px] text-fg-faint hover:text-rust disabled:opacity-40"
                  >
                    ×
                  </button>
                </span>
                <span
                  className="line-clamp-2 rounded-[10px] px-[10px] py-[8px] text-[13px] leading-[1.35]"
                  style={{
                    background: NOTICE_BACKGROUNDS[p.style?.background ?? "tone"].css ?? "var(--color-panel)",
                    fontFamily: p.style?.font ? NOTICE_FONTS[p.style.font].family : undefined,
                    color: p.style?.color ?? (p.style?.background === "paper" ? "#1a1a1f" : undefined),
                    fontWeight: p.style?.bold ? 700 : undefined,
                  }}
                >
                  {p.body}
                </span>
                <span className="flex gap-[8px]">
                  <button
                    type="button"
                    onClick={() => editPreset(p)}
                    className="flex-1 cursor-pointer rounded-[10px] border border-edge px-[10px] py-[8px] text-[12px] font-semibold text-fg-muted hover:border-edge-warm"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={!canCall || busy}
                    onClick={() => void putUp(p)}
                    className="flex-1 cursor-pointer rounded-[10px] gold-bg px-[10px] py-[8px] text-[12px] font-bold text-[#1a1512] disabled:opacity-40"
                  >
                    Put on the TV
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {mode === "template" && (
        <Step n="1" title="Pick a message">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[10px]">
            {noticeTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t)}
                className={`cursor-pointer rounded-[16px] border p-[14px] text-left transition-colors ${
                  t.id === templateId
                    ? "border-gold/60 bg-gold/10"
                    : "border-edge bg-panel-soft hover:border-edge-warm"
                }`}
              >
                <span className="block text-[14px] leading-[1.4]">
                  {t.body_template.replace(/\{[a-z_]+\}/g, "…")}
                </span>
              </button>
            ))}
          </div>
          {noticeTemplates.length === 0 && (
            <p className="text-[13px] text-fg-faint">No messages are set up yet.</p>
          )}
        </Step>
      )}

      {(mode === "custom" || template) && (
        <Step n={mode === "custom" ? "1" : "2"} title="Write it">
          <div className="flex flex-col gap-[14px]">
            {template && template.slots.length > 0 && (
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
                      className="rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] font-mono text-[16px] outline-none focus:border-accent/50"
                    />
                  </label>
                ))}
              </div>
            )}

            <label className="flex flex-col gap-[7px]">
              <span className="flex items-baseline gap-[9px] text-[12px] text-fg-muted">
                Wording
                {template && (
                  <span className="text-fg-faint">
                    change it if you need to — the standard wording is already here
                  </span>
                )}
                <span className="flex-1" />
                <span className={`font-mono text-[11px] ${tooLong ? "text-rust" : "text-fg-faint"}`}>
                  {draft.length}/{MAX_BODY}
                </span>
              </span>
              <textarea
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={mode === "custom" ? "The lift is out of order today." : ""}
                className="resize-y rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[13px] text-[15px] leading-[1.45] outline-none placeholder:text-fg-faint focus:border-accent/50"
              />
            </label>

            {mode === "custom" && (
              <>
                <div className="flex flex-col gap-[8px]">
                  <span className="text-[12px] text-fg-muted">How it should read</span>
                  <div className="flex flex-wrap gap-[8px]">
                    {TONES.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTone(t.key)}
                        className={`cursor-pointer rounded-[12px] border px-[14px] py-[11px] text-[13px] font-semibold transition-colors ${
                          tone === t.key
                            ? "border-gold/55 bg-gold/12 text-gold-bright"
                            : "border-edge bg-panel-soft text-fg-muted hover:border-edge-warm"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <StylePicker style={style} onChange={setStyle} />

                <div className="flex flex-col gap-[8px]">
                  <span className="text-[12px] text-fg-muted">
                    A picture, clip or file{" "}
                    <span className="text-fg-faint">— optional, up to 25 MB</span>
                  </span>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,application/pdf"
                    onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
                    className="cursor-pointer rounded-[12px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] text-[13px] file:mr-[12px] file:cursor-pointer file:rounded-[9px] file:border-0 file:bg-gold file:px-[13px] file:py-[8px] file:text-[12.5px] file:font-bold file:text-[#1a1512]"
                  />
                  {file && (
                    <div className="flex items-center gap-[12px] rounded-[14px] border border-edge bg-panel-soft p-[11px]">
                      {preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preview} alt="" className="h-[52px] w-[52px] rounded-[10px] object-cover" />
                      ) : (
                        <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[10px] bg-panel font-mono text-[11px] text-fg-dim">
                          {kindOf(file.type).slice(0, 3)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{file.name}</span>
                        <span className="block font-mono text-[11px] text-fg-faint">
                          {(file.size / 1024 / 1024).toFixed(1)} MB · {kindOf(file.type)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          chooseFile(null);
                          if (fileInput.current) fileInput.current.value = "";
                        }}
                        className="cursor-pointer rounded-[10px] border border-edge px-[12px] py-[8px] text-[12px] text-fg-muted"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  {file && kindOf(file.type) === "file" && (
                    <p className="text-[12px] text-gold">
                      A TV cannot show a PDF. It will be kept with the message, but the hall sees only
                      the words.
                    </p>
                  )}
                </div>
              </>
            )}

            {badTime && (
              <p className="text-[13px] font-semibold text-rust">
                Write the time on a 24-hour clock, like 14:30.
              </p>
            )}
            {tooLong && (
              <p className="text-[13px] font-semibold text-rust">
                That is too long for a television. Keep it to {MAX_BODY} characters.
              </p>
            )}
          </div>
        </Step>
      )}

      {(mode === "custom" || template) && (
        <Step n={mode === "custom" ? "2" : "3"} title="Check it, then put it up">
          <div className="flex flex-wrap items-start gap-[18px]">
            <div className="aspect-video w-full max-w-[520px] shrink-0">
              <DisplayBoard
                className="h-full"
                hallLabel={displays[0]?.hall_label ?? "HALL 1"}
                centre={center.name}
        siteLabel={center.site_code}
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
                  ready
                    ? {
                        body: draft,
                        tone: mode === "custom" ? tone : (template?.tone ?? "info"),
                        mediaUrl: preview,
                        mediaKind: file ? kindOf(file.type) : null,
                        style: mode === "custom" ? style : null,
                      }
                    : null
                }
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
                disabled={!canCall || !ready || busy}
                onClick={send}
                className="cursor-pointer rounded-[14px] gold-bg px-[24px] py-[15px] text-[15px] font-bold text-[#1a1512] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Sending…" : "Put it on the TV"}
              </button>

              {mode === "custom" && canCall && (
                <div className="flex flex-col gap-[8px] rounded-[14px] border border-edge-soft bg-panel-soft/50 p-[12px]">
                  <span className="text-[12px] text-fg-muted">Save it to use again</span>
                  <div className="flex gap-[8px]">
                    <input
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      maxLength={60}
                      placeholder="A name, like Phones off"
                      className="min-w-0 flex-1 rounded-[11px] border border-edge-strong bg-panel-soft px-[12px] py-[10px] text-[13px] outline-none focus:border-accent/50"
                    />
                    <button
                      type="button"
                      disabled={!presetName.trim() || !draft.trim() || tooLong}
                      onClick={() => void savePreset()}
                      className="cursor-pointer rounded-[11px] border border-accent/50 px-[14px] text-[12.5px] font-semibold text-accent disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                  <span className="text-[11px] text-fg-faint">Saves the words and the look. The same name replaces the old one.</span>
                </div>
              )}

              {!canCall && (
                <p className="text-[12.5px] text-gold">
                  Only staff can put a message on the TV.
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

/** Font, size, colour, background, shape, alignment and weight, from a short list. */
function StylePicker({ style, onChange }: { style: NoticeStyle; onChange: (s: NoticeStyle) => void }) {
  const set = <K extends keyof NoticeStyle>(k: K, v: NoticeStyle[K] | undefined) => {
    const next = { ...style, [k]: v };
    if (v === undefined) delete next[k];
    onChange(next);
  };
  const chip = (on: boolean) =>
    `cursor-pointer rounded-[11px] border px-[12px] py-[8px] text-[12.5px] font-semibold transition-colors ${
      on ? "border-gold/55 bg-gold/12 text-gold-bright" : "border-edge bg-panel-soft text-fg-muted hover:border-edge-warm"
    }`;

  return (
    <div className="flex flex-col gap-[14px] rounded-[16px] border border-edge-soft bg-panel-soft/40 p-[14px]">
      <span className="flex items-center gap-[10px] text-[12px] text-fg-muted">
        How it looks
        <span className="flex-1" />
        {Object.keys(style).length > 0 && (
          <button type="button" onClick={() => onChange({})} className="cursor-pointer text-[11.5px] text-fg-faint hover:text-fg">
            Reset
          </button>
        )}
      </span>

      <Row label="Font">
        {(Object.keys(NOTICE_FONTS) as (keyof typeof NOTICE_FONTS)[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => set("font", style.font === f ? undefined : f)}
            style={{ fontFamily: NOTICE_FONTS[f].family }}
            className={chip((style.font ?? "serif") === f)}
          >
            {NOTICE_FONTS[f].label}
          </button>
        ))}
      </Row>

      <Row label="Size">
        {(Object.keys(NOTICE_SIZES) as (keyof typeof NOTICE_SIZES)[]).map((z) => (
          <button key={z} type="button" onClick={() => set("size", z === "l" ? undefined : z)} className={chip((style.size ?? "l") === z)}>
            {NOTICE_SIZES[z].label}
          </button>
        ))}
        <button type="button" onClick={() => set("bold", style.bold ? undefined : true)} className={chip(!!style.bold)}>
          Bold
        </button>
        <button type="button" onClick={() => set("align", style.align === "left" ? undefined : "left")} className={chip(style.align === "left")}>
          Left aligned
        </button>
      </Row>

      <Row label="Colour">
        <button type="button" onClick={() => set("color", undefined)} className={chip(!style.color)}>
          Auto
        </button>
        {NOTICE_COLOURS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Text colour ${c}`}
            aria-pressed={style.color === c}
            onClick={() => set("color", c)}
            style={{ background: c }}
            className={`h-[34px] w-[34px] cursor-pointer rounded-full border-2 ${style.color === c ? "border-gold" : "border-edge-strong"}`}
          />
        ))}
      </Row>

      <Row label="Background">
        {(Object.keys(NOTICE_BACKGROUNDS) as (keyof typeof NOTICE_BACKGROUNDS)[]).map((b) => {
          const on = (style.background ?? "tone") === b;
          return (
            <button
              key={b}
              type="button"
              onClick={() => set("background", b === "tone" ? undefined : b)}
              className={`flex w-[84px] cursor-pointer flex-col items-stretch gap-[5px] rounded-[12px] border p-[5px] text-[11px] font-semibold ${
                on ? "border-gold/60 text-gold-bright" : "border-edge text-fg-muted hover:border-edge-warm"
              }`}
            >
              <span
                className="h-[34px] rounded-[8px] border border-white/10"
                style={{ background: NOTICE_BACKGROUNDS[b].css ?? "linear-gradient(135deg, oklch(0.78 0.14 268 / 0.3), oklch(0.83 0.16 82 / 0.3))" }}
              />
              {NOTICE_BACKGROUNDS[b].label}
            </button>
          );
        })}
      </Row>

      <Row label="Shape">
        {(Object.keys(NOTICE_SHAPES) as (keyof typeof NOTICE_SHAPES)[]).map((sh) => (
          <button
            key={sh}
            type="button"
            onClick={() => set("shape", sh === "rounded" ? undefined : sh)}
            style={{ borderRadius: NOTICE_SHAPES[sh].radius === "44px" ? "18px" : NOTICE_SHAPES[sh].radius === "6px" ? "4px" : "11px" }}
            className={chip((style.shape ?? "rounded") === sh)}
          >
            {NOTICE_SHAPES[sh].label}
          </button>
        ))}
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[7px] sm:flex-row sm:items-start sm:gap-[14px]">
      <span className="w-[86px] shrink-0 pt-[8px] font-mono text-[10.5px] tracking-[0.12em] text-fg-faint uppercase">{label}</span>
      <div className="flex flex-wrap gap-[7px]">{children}</div>
    </div>
  );
}
