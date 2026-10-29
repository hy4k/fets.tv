"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { encode } from "uqr";
import { ChannelSlide } from "@/components/display/ChannelSlide";
import { DisplayBoard } from "@/components/display/DisplayBoard";
import { QrCode } from "@/components/display/QrCode";
import { Dialog } from "@/components/ui/Dialog";
import { centreLook, shortName } from "@/lib/centres";
import { useConsole } from "@/lib/console-data";
import { useDisplayHome } from "@/lib/display-home";
import { useDisplaySlides, useSlideStats, type SlideNumbers } from "@/lib/display-slides";
import { roomFloor } from "@/lib/room";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  ALL_DAYS,
  BOOKING_LINK,
  DAY_NAMES,
  DESIGNS,
  MAX_SECONDS,
  MIN_SECONDS,
  adSound,
  cleanLink,
  designOf,
  lengthText,
  localNow,
  nextOn,
  playlist,
  scheduleLine,
  shortLink,
  slideStatus,
  type SlideKind,
  type SlideStatus,
  type TvSlide,
} from "@/lib/tv-channel";
import { useNow } from "@/lib/use-clock";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** A video ad may be longer: about two minutes of 1080p. */
const MAX_AD_BYTES = 50 * 1024 * 1024;

type Draft = Omit<TvSlide, "id" | "center_id" | "position"> & { id: string | null };

function newDraft(kind: SlideKind): Draft {
  const d = designOf(kind);
  return {
    id: null,
    kind,
    label: "",
    fields: { ...d.sample },
    link: d.qr === "default" ? BOOKING_LINK : null,
    media_path: null,
    media_url: null,
    media_kind: null,
    seconds: d.seconds,
    starts_on: null,
    ends_on: null,
    days: ALL_DAYS,
    from_time: null,
    to_time: null,
    everywhere: false,
    active: true,
  };
}

const toDraft = (s: TvSlide): Draft => ({ ...s, fields: { ...s.fields }, days: [...(s.days ?? ALL_DAYS)] });

/** What fets_save_slide takes: the slide without what only this browser needs. */
function payload(d: Draft) {
  return {
    id: d.id,
    kind: d.kind,
    label: d.label,
    fields: d.fields,
    link: d.link,
    media_path: d.media_path,
    media_kind: d.media_kind,
    seconds: d.seconds,
    starts_on: d.starts_on,
    ends_on: d.ends_on,
    days: d.days,
    from_time: d.from_time ? d.from_time.slice(0, 5) : null,
    to_time: d.to_time ? d.to_time.slice(0, 5) : null,
    everywhere: d.everywhere,
    active: d.active,
  };
}

const STATUS: Record<SlideStatus, { label: string; className: string }> = {
  on: { label: "On now", className: "border-mint/50 bg-mint/12 text-mint" },
  later: { label: "Scheduled", className: "border-iris/45 bg-iris/12 text-iris" },
  ended: { label: "Ended", className: "border-edge-strong bg-panel-soft text-fg-faint" },
  off: { label: "Off", className: "border-edge-strong bg-panel-soft text-fg-faint" },
};

/** A QR code as a print-ready PNG, for posters, standees and WhatsApp. */
function downloadQr(link: string) {
  const { data, size } = encode(link, { ecc: "Q", border: 4 });
  const scale = Math.max(8, Math.floor(1600 / size));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111";
  data.forEach((row, y) => row.forEach((dark, x) => dark && ctx.fillRect(x * scale, y * scale, scale, scale)));
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `qr-${shortLink(link).replace(/[^A-Za-z0-9]+/g, "-")}.png`;
  a.click();
}

/**
 * The TV Channel: the slides that take turns on the hall TV between calls.
 * Pick a design, fill a few words, choose when it plays. The loop on the right
 * is the hall TV as it will look, playing what is scheduled now.
 */
export function ChannelScreen() {
  const { center, candidates, workstations, programmes, displays, rpc, notify, canCall } = useConsole();
  const { slides, ready, reload } = useDisplaySlides(center.id);
  const { home } = useDisplayHome(center.id);
  const now = useNow();
  const tone = centreLook(center.name).tone;
  const locked = !canCall;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // The centre's date, for "today" and "last 7 days"; empty until the clock is known.
  const today = now ? localNow(now, center.timezone).date : "";
  const stats = useSlideStats(center.id, today);
  const totals = [...stats.values()].reduce(
    (t, n) => ({ shown: t.shown + n.shown, scans: t.scans + n.scans }),
    { shown: 0, scans: 0 },
  );
  const mine = slides.filter((s) => s.center_id === center.id && s.kind !== "ticker");
  const tickers = slides.filter((s) => s.center_id === center.id && s.kind === "ticker");
  const shared = slides.filter((s) => s.center_id !== center.id);
  const loop = playlist(slides, now, center.timezone);
  const floor = roomFloor(candidates, workstations, programmes);

  function open(d: Draft) {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFile(null);
    setFilePreview(null);
    setDraft(d);
  }

  // Stable, because this screen redraws every second and the pop-up would
  // otherwise take the focus back from whatever box is being typed in.
  const close = useCallback(() => {
    setFilePreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setFile(null);
    setDraft(null);
  }, []);

  function chooseFile(next: File | null) {
    if (filePreview) URL.revokeObjectURL(filePreview);
    const ad = draft?.kind === "ad";
    if (next && next.size > (ad ? MAX_AD_BYTES : MAX_FILE_BYTES)) {
      notify(ad ? "That video is larger than 50 MB." : "That file is larger than 25 MB.", "error");
      return;
    }
    if (next && !(ad ? /^video\//.test(next.type) : /^(image|video)\//.test(next.type))) {
      notify(ad ? "A video ad needs an MP4 or WebM video." : "A poster is an image or a video.", "error");
      return;
    }
    setFile(next);
    setFilePreview(next ? URL.createObjectURL(next) : null);
  }

  async function save() {
    if (!draft) return;
    const link = draft.link === null ? null : cleanLink(draft.link);
    if (draft.link !== null && !link) {
      notify("The QR code needs a web link, like https://fets.in/testdrive/", "error");
      return;
    }
    setBusy(true);
    try {
      let next = { ...draft, link };
      if (file) {
        const path = `${center.id}/slides/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "-").slice(-80)}`;
        const { error } = await supabaseBrowser()
          .storage.from("notice-media")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (error) throw new Error(error.message);
        next = { ...next, media_path: path, media_kind: file.type.startsWith("video/") ? "video" : "image" };
      }
      if (next.kind === "poster" && !next.media_path && !next.fields.caption?.trim()) {
        throw new Error("Choose an image or a video for the poster.");
      }
      if (next.kind === "ad" && (!next.media_path || next.media_kind !== "video")) {
        throw new Error("Choose the video for the ad.");
      }
      if (next.kind === "ticker" && !next.fields.text?.trim()) {
        throw new Error("Write the line for the ticker.");
      }
      const done =
        next.kind === "ticker"
          ? draft.id ? "Ticker line saved" : "Ticker line added"
          : draft.id ? "Slide saved" : "Slide added to the TV Channel";
      const ok = await rpc("fets_save_slide", { p_center: center.id, p_slide: payload(next) }, done);
      if (ok) {
        close();
        await reload();
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: TvSlide) {
    const ok = await rpc(
      "fets_save_slide",
      { p_center: center.id, p_slide: payload({ ...toDraft(s), active: !s.active }) },
      s.active ? "Slide switched off" : "Slide switched on",
    );
    if (ok) await reload();
  }

  async function remove(s: TvSlide) {
    const ok = await rpc("fets_delete_slide", { p_center: center.id, p_slide: s.id }, "Slide deleted");
    if (ok && s.media_path) void supabaseBrowser().storage.from("notice-media").remove([s.media_path]);
    if (ok) await reload();
  }

  async function move(list: TvSlide[], i: number, by: -1 | 1) {
    const order = list.map((s) => s.id);
    const [id] = order.splice(i, 1);
    order.splice(i + by, 0, id);
    if (await rpc("fets_order_slides", { p_center: center.id, p_slides: order })) await reload();
  }

  const previewSlide: TvSlide | null = draft
    ? {
        ...draft,
        id: draft.id ?? "draft",
        center_id: center.id,
        position: 0,
        link: draft.link === null ? null : cleanLink(draft.link),
        media_url: filePreview ?? draft.media_url ?? null,
        media_kind: file ? (file.type.startsWith("video/") ? "video" : "image") : draft.media_kind,
      }
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto">
      {!ready && (
        <p className="rounded-[16px] border border-gold/40 bg-gold/10 px-[16px] py-[12px] text-[13px] text-fg">
          The TV Channel needs its SQL run once in Supabase (fets-online-tv-channel.sql). Until then the TV shows the home
          screen and messages as before.
        </p>
      )}

      <div className="grid grid-cols-1 gap-[16px] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="flex min-w-0 flex-col gap-[14px]">
          <section className="flex flex-col gap-[6px] rounded-[22px] border border-edge-mid panel-bg p-[18px]">
            <span className="text-[16px] font-semibold">TV Channel</span>
            <span className="text-[12.5px] leading-relaxed text-fg-faint">
              Slides take turns on the hall TV between calls. A call always takes the whole screen first, and a message
              put up from Messages comes before the loop. The home screen keeps a turn in the loop so people still read
              that they will be called by name.
            </span>
          </section>

          <section className="flex flex-col gap-[10px] rounded-[22px] border border-edge-mid panel-bg p-[16px]">
            <div className="flex items-baseline gap-[10px]">
              <span className="text-[14px] font-semibold">Playlist</span>
              <span className="text-[11.5px] text-fg-faint">Plays top to bottom, then starts again</span>
              <span className="flex-1" />
              <span className="font-mono text-[11px] text-fg-faint">{loop.length > 0 ? `${loop.length} on now` : "nothing on now"}</span>
            </div>
            {stats.size > 0 && (
              <div className="grid grid-cols-3 gap-[8px]">
                <Stat label="Shown, last 7 days" value={totals.shown} />
                <Stat label="QR scans, last 7 days" value={totals.scans} />
                <Stat
                  label="Scans per 100 showings"
                  value={totals.shown ? Math.round((totals.scans / totals.shown) * 1000) / 10 : 0}
                />
              </div>
            )}
            {mine.length === 0 && (
              <p className="text-[12.5px] text-fg-faint">No slides yet. Pick a design below to make the first one.</p>
            )}
            {mine.map((s, i) => (
              <SlideRow
                key={s.id}
                slide={s}
                tone={tone}
                status={slideStatus(s, now, center.timezone)}
                hint={nextOn(s, now, center.timezone)}
                numbers={stats.get(s.id)}
                locked={locked}
                first={i === 0}
                last={i === mine.length - 1}
                onUp={() => void move(mine, i, -1)}
                onDown={() => void move(mine, i, 1)}
                onEdit={() => open(toDraft(s))}
                onToggle={() => void toggle(s)}
                onDelete={() => void remove(s)}
              />
            ))}
            {shared.length > 0 && (
              <>
                <span className="pt-[6px] text-[11.5px] font-semibold text-fg-dim">From the other centre, shown here too</span>
                {shared.map((s) => (
                  <SlideRow key={s.id} slide={s} tone={tone} status={slideStatus(s, now, center.timezone)} locked />
                ))}
              </>
            )}
          </section>

          <section className="flex flex-col gap-[10px] rounded-[22px] border border-edge-mid panel-bg p-[16px]">
            <div className="flex items-baseline gap-[10px]">
              <span className="text-[14px] font-semibold">Ticker</span>
              <span className="text-[11.5px] text-fg-faint">Lines that scroll along the bottom of the TV, top to bottom</span>
              <span className="flex-1" />
              <button
                type="button"
                disabled={locked || !ready}
                onClick={() => open(newDraft("ticker"))}
                className="cursor-pointer rounded-[10px] border border-edge-strong px-[10px] py-[6px] text-[12px] font-semibold text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add a line
              </button>
            </div>
            {tickers.length === 0 && (
              <p className="text-[12.5px] text-fg-faint">
                No lines yet. Add one and it runs along the bottom of the TV whenever nobody is being called.
              </p>
            )}
            {tickers.map((s, i) => (
              <SlideRow
                key={s.id}
                slide={s}
                tone={tone}
                status={slideStatus(s, now, center.timezone)}
                hint={nextOn(s, now, center.timezone)}
                locked={locked}
                first={i === 0}
                last={i === tickers.length - 1}
                onUp={() => void move(tickers, i, -1)}
                onDown={() => void move(tickers, i, 1)}
                onEdit={() => open(toDraft(s))}
                onToggle={() => void toggle(s)}
                onDelete={() => void remove(s)}
              />
            ))}
          </section>

          <section className="flex flex-col gap-[10px] rounded-[22px] border border-edge-mid panel-bg p-[16px]">
            <span className="text-[14px] font-semibold">Add a slide</span>
            <div className="grid grid-cols-2 gap-[10px] sm:grid-cols-3">
              {DESIGNS.filter((d) => d.kind !== "ticker").map((d) => (
                <button
                  key={d.kind}
                  type="button"
                  disabled={locked || !ready}
                  onClick={() => open(newDraft(d.kind))}
                  className="group flex cursor-pointer flex-col gap-[8px] rounded-[16px] border border-edge bg-panel-soft p-[8px] text-left hover:border-edge-warm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="pointer-events-none block aspect-video w-full overflow-hidden rounded-[10px]">
                    {d.kind === "today" ? (
                      <TodayThumb />
                    ) : (
                      <ChannelSlide slide={{ ...newDraftSlide(d.kind), id: `design-${d.kind}` }} tone={tone} />
                    )}
                  </span>
                  <span className="px-[4px] text-[12.5px] font-semibold text-fg">{d.name}</span>
                  <span className="px-[4px] pb-[2px] text-[11px] leading-snug text-fg-faint">{d.hint}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className="flex min-w-0 flex-col gap-[10px] xl:sticky xl:top-0 xl:self-start">
          <div className="flex items-baseline gap-[10px] px-[4px]">
            <span className="text-[14px] font-semibold">The hall TV now</span>
            <span className="text-[11.5px] text-fg-faint">Playing the loop as scheduled at this minute</span>
          </div>
          <div className="aspect-video w-full">
            <DisplayBoard
              className="h-full"
              hallLabel={displays[0]?.hall_label ?? "HALL 1"}
              timezone={center.timezone}
              centre={center.name}
              siteLabel={center.site_code}
              call={null}
              next={[]}
              floor={floor}
              home={home}
              slides={slides}
            />
          </div>
        </section>
      </div>

      <Dialog
        open={!!draft}
        title={draft ? `${draft.id ? "Edit" : "New"} · ${designOf(draft.kind).name}` : ""}
        subtitle="Fill in the words, choose when it plays, and save"
        onClose={close}
        width={1080}
        footer={
          <div className="flex flex-wrap items-center gap-[10px]">
            <span className="flex-1" />
            <button
              type="button"
              onClick={close}
              className="cursor-pointer rounded-[12px] border border-edge-strong px-[16px] py-[10px] text-[13px] font-semibold text-fg-muted hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || locked}
              onClick={() => void save()}
              className="cursor-pointer rounded-[12px] gold-bg px-[18px] py-[10px] text-[13px] font-bold text-[#191309] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Saving…" : draft?.id ? "Save slide" : "Add to the TV Channel"}
            </button>
          </div>
        }
      >
        {draft && previewSlide && (
          <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="flex min-w-0 flex-col gap-[14px]">
              <Field label="Name for staff" note="Only shown here, never on the TV">
                <input
                  value={draft.label}
                  maxLength={60}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder={designOf(draft.kind).name}
                  className={INPUT}
                />
              </Field>

              {designOf(draft.kind).fields.map((spec) => (
                <Field key={spec.key} label={spec.label} note={`${(draft.fields[spec.key] ?? "").length}/${spec.max}`}>
                  {spec.multiline ? (
                    <textarea
                      rows={spec.key === "names" ? 6 : 2}
                      value={draft.fields[spec.key] ?? ""}
                      maxLength={spec.max}
                      placeholder={spec.placeholder}
                      onChange={(e) => setDraft({ ...draft, fields: { ...draft.fields, [spec.key]: e.target.value } })}
                      className={`${INPUT} resize-y`}
                    />
                  ) : (
                    <input
                      value={draft.fields[spec.key] ?? ""}
                      maxLength={spec.max}
                      placeholder={spec.placeholder}
                      onChange={(e) => setDraft({ ...draft, fields: { ...draft.fields, [spec.key]: e.target.value } })}
                      className={INPUT}
                    />
                  )}
                </Field>
              ))}

              {designOf(draft.kind).media && (
                <Field
                  label={draft.kind === "ad" ? "Video" : "Image or video"}
                  note={
                    draft.kind === "ad"
                      ? "MP4 up to 50 MB · 16:9 fills the screen"
                      : "PNG, JPG or MP4 up to 25 MB · 16:9 fills the screen"
                  }
                >
                  <div className="flex flex-wrap items-center gap-[10px]">
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="cursor-pointer rounded-[12px] border border-edge-strong bg-panel-soft px-[14px] py-[9px] text-[13px] font-semibold hover:border-edge-warm"
                    >
                      {file || draft.media_path ? "Choose another file" : "Choose a file"}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-fg-faint">
                      {file?.name ?? (draft.media_path ? "Current file kept" : "Nothing chosen")}
                    </span>
                    <input
                      ref={fileInput}
                      type="file"
                      accept={
                        draft.kind === "ad"
                          ? "video/mp4,video/webm"
                          : "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
                      }
                      className="hidden"
                      onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </Field>
              )}

              {designOf(draft.kind).qr !== "none" && (
                <div className="flex flex-col gap-[8px] rounded-[16px] border border-edge bg-panel-soft p-[12px]">
                  <label className="flex cursor-pointer items-center gap-[10px] text-[13px] font-semibold">
                    <input
                      type="checkbox"
                      checked={draft.link !== null}
                      onChange={(e) => setDraft({ ...draft, link: e.target.checked ? BOOKING_LINK : null })}
                      className="h-[16px] w-[16px] accent-[var(--place-accent)]"
                    />
                    Show a QR code
                  </label>
                  {draft.link !== null && (
                    <div className="flex items-center gap-[12px]">
                      <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                        <input
                          value={draft.link}
                          maxLength={300}
                          onChange={(e) => setDraft({ ...draft, link: e.target.value })}
                          placeholder={BOOKING_LINK}
                          className={INPUT}
                        />
                        <span className="text-[11px] text-fg-faint">
                          Phones that scan it open this page. Point a phone at the preview to test it.
                        </span>
                        {cleanLink(draft.link) && (
                          <button
                            type="button"
                            onClick={() => downloadQr(cleanLink(draft.link)!)}
                            className="cursor-pointer self-start rounded-[10px] border border-edge-strong px-[10px] py-[6px] text-[12px] font-semibold text-fg-muted hover:text-fg"
                          >
                            Download QR as PNG (for print)
                          </button>
                        )}
                      </div>
                      {cleanLink(draft.link) && (
                        <span className="w-[92px] shrink-0 rounded-[10px] bg-white p-[4px]">
                          <QrCode value={cleanLink(draft.link)!} className="block h-auto w-full" />
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <Schedule draft={draft} onChange={setDraft} />

              {draft.kind === "ad" && (
                <div className="flex flex-col gap-[6px] rounded-[16px] border border-edge bg-panel-soft p-[12px]">
                  <label className="flex cursor-pointer items-center gap-[10px] text-[13px] font-semibold">
                    <input
                      type="checkbox"
                      checked={adSound(draft)}
                      onChange={(e) => setDraft({ ...draft, fields: { ...draft.fields, sound: e.target.checked ? "on" : "" } })}
                      className="h-[16px] w-[16px] accent-[var(--place-accent)]"
                    />
                    Play its sound
                  </label>
                  <span className="text-[11px] leading-snug text-fg-faint">
                    The ad plays from start to finish across the whole screen, then the loop carries on. A call cuts in at
                    once and the ad picks up where it stopped. Sound plays once the TV has been tapped after opening, the
                    same as the call sound; until then the ad plays silently.
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-[10px] rounded-[16px] border border-edge bg-panel-soft p-[12px]">
                {draft.kind !== "ad" && draft.kind !== "ticker" && (
                  <label className="flex items-center gap-[10px] text-[13px] font-semibold">
                    <span className="w-[120px] shrink-0">On screen for</span>
                    <input
                      type="range"
                      min={MIN_SECONDS}
                      max={MAX_SECONDS}
                      step={1}
                      value={draft.seconds}
                      onChange={(e) => setDraft({ ...draft, seconds: Number(e.target.value) })}
                      className="min-w-0 flex-1 accent-[var(--place-accent)]"
                    />
                    <span className="w-[48px] text-right font-mono text-[12px] text-fg-muted">{draft.seconds}s</span>
                  </label>
                )}
                <label className="flex cursor-pointer items-center gap-[10px] text-[13px] font-semibold">
                  <input
                    type="checkbox"
                    checked={draft.everywhere}
                    onChange={(e) => setDraft({ ...draft, everywhere: e.target.checked })}
                    className="h-[16px] w-[16px] accent-[var(--place-accent)]"
                  />
                  Show at both centres, not only {shortName(center.name)}
                </label>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-[8px] lg:sticky lg:top-0 lg:self-start">
              <span className="text-[12px] font-semibold text-fg-dim">How it looks on the TV</span>
              <div className="aspect-video w-full">
                {draft.kind === "today" ? (
                  <DisplayBoard
                    className="h-full"
                    hallLabel={displays[0]?.hall_label ?? "HALL 1"}
                    timezone={center.timezone}
                    centre={center.name}
                    siteLabel={center.site_code}
                    call={null}
                    next={[]}
                    floor={floor}
                    home={home}
                  />
                ) : (
                  <ChannelSlide slide={previewSlide} tone={tone} />
                )}
              </div>
              <span className="text-[11.5px] text-fg-faint">{scheduleLine(previewSlide)}</span>
              {draft.kind === "today" && (
                <span className="text-[11.5px] text-fg-faint">The words on it are set in Hall TV → Home screen.</span>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

const INPUT =
  "w-full min-w-0 rounded-[12px] border border-edge-strong bg-panel-soft px-[12px] py-[9px] text-[14px] outline-none placeholder:text-fg-faint focus:border-accent/50";

function newDraftSlide(kind: SlideKind): TvSlide {
  return { ...newDraft(kind), id: kind, center_id: "", position: 0 };
}

function Field({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="flex items-baseline gap-[8px]">
        <span className="text-[12.5px] font-semibold text-fg-dim">{label}</span>
        <span className="flex-1" />
        {note && <span className="font-mono text-[10.5px] text-fg-faint">{note}</span>}
      </span>
      {children}
    </label>
  );
}

/** Dates, days and hours: when the slide plays. Empty means no limit. */
function Schedule({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const toggleDay = (day: number) => {
    const days = draft.days.includes(day) ? draft.days.filter((d) => d !== day) : [...draft.days, day].sort();
    if (days.length) onChange({ ...draft, days });
  };
  return (
    <div className="flex flex-col gap-[10px] rounded-[16px] border border-edge bg-panel-soft p-[12px]">
      <span className="text-[13px] font-semibold">When it plays</span>
      <div className="grid grid-cols-2 gap-[10px]">
        <Field label="From date" note="empty: from today">
          <input
            type="date"
            value={draft.starts_on ?? ""}
            onChange={(e) => onChange({ ...draft, starts_on: e.target.value || null })}
            className={INPUT}
          />
        </Field>
        <Field label="Until date" note="empty: no end">
          <input
            type="date"
            value={draft.ends_on ?? ""}
            min={draft.starts_on ?? undefined}
            onChange={(e) => onChange({ ...draft, ends_on: e.target.value || null })}
            className={INPUT}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-[6px]">
        {ALL_DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => toggleDay(d)}
            aria-pressed={draft.days.includes(d)}
            className={`cursor-pointer rounded-[10px] border px-[11px] py-[6px] text-[12px] font-semibold ${
              draft.days.includes(d) ? "border-accent/60 bg-accent/15 text-fg" : "border-edge-strong text-fg-faint"
            }`}
          >
            {DAY_NAMES[d]}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => onChange({ ...draft, days: ALL_DAYS })}
          className="cursor-pointer text-[11.5px] font-semibold text-fg-faint hover:text-fg"
        >
          Every day
        </button>
      </div>
      <div className="grid grid-cols-2 gap-[10px]">
        <Field label="From time" note="empty: all day">
          <input
            type="time"
            value={draft.from_time?.slice(0, 5) ?? ""}
            onChange={(e) => onChange({ ...draft, from_time: e.target.value || null })}
            className={INPUT}
          />
        </Field>
        <Field label="Until time">
          <input
            type="time"
            value={draft.to_time?.slice(0, 5) ?? ""}
            onChange={(e) => onChange({ ...draft, to_time: e.target.value || null })}
            className={INPUT}
          />
        </Field>
      </div>
    </div>
  );
}

function SlideRow({
  slide,
  tone,
  status,
  hint,
  numbers,
  locked,
  first,
  last,
  onUp,
  onDown,
  onEdit,
  onToggle,
  onDelete,
}: {
  slide: TvSlide;
  tone: [string, string];
  status: SlideStatus;
  /** When a scheduled slide next comes on. */
  hint?: string | null;
  numbers?: SlideNumbers;
  locked: boolean;
  first?: boolean;
  last?: boolean;
  onUp?: () => void;
  onDown?: () => void;
  onEdit?: () => void;
  onToggle?: () => void;
  onDelete?: () => void;
}) {
  const s = STATUS[status];
  const editable = !locked && !!onEdit;
  // Asked on the page itself: a browser can be set to swallow confirm() boxes.
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center gap-[12px] rounded-[16px] border border-edge bg-panel-soft p-[8px]">
      <span className="pointer-events-none block aspect-video w-[132px] shrink-0 overflow-hidden rounded-[10px]">
        {slide.kind === "today" ? <TodayThumb /> : <ChannelSlide slide={slide} tone={tone} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
        <span className="flex items-center gap-[8px]">
          <span className="truncate text-[13.5px] font-semibold">{slide.label || designOf(slide.kind).name}</span>
          <span className={`shrink-0 rounded-full border px-[8px] py-[1px] text-[10.5px] font-bold ${s.className}`}>{s.label}</span>
          {slide.everywhere && (
            <span className="shrink-0 rounded-full border border-edge-strong px-[8px] py-[1px] text-[10.5px] font-semibold text-fg-dim">
              Both centres
            </span>
          )}
        </span>
        <span className="truncate text-[11.5px] text-fg-faint">
          {designOf(slide.kind).name} · {lengthText(slide)} · {scheduleLine(slide)}
        </span>
        {hint && <span className="text-[11.5px] font-semibold text-iris">{hint}</span>}
        {numbers && (
          <span className="font-mono text-[11px] text-fg-dim">
            7 days: shown {numbers.shown} · scanned {numbers.scans}
            {slide.link ? "" : " (no QR)"} · today {numbers.shownToday} / {numbers.scansToday}
          </span>
        )}
        {editable && (
          <span className="flex flex-wrap gap-[6px] pt-[2px]">
            <RowButton onClick={onEdit}>Edit</RowButton>
            <RowButton onClick={onToggle}>{slide.active ? "Switch off" : "Switch on"}</RowButton>
            <RowButton onClick={onUp} disabled={first} label="Move up">
              ↑
            </RowButton>
            <RowButton onClick={onDown} disabled={last} label="Move down">
              ↓
            </RowButton>
            {confirming ? (
              <>
                <span className="self-center text-[11.5px] font-semibold text-rust">Delete this slide?</span>
                <RowButton
                  onClick={() => {
                    setConfirming(false);
                    onDelete?.();
                  }}
                  danger
                >
                  Yes, delete
                </RowButton>
                <RowButton onClick={() => setConfirming(false)}>No</RowButton>
              </>
            ) : (
              <RowButton onClick={() => setConfirming(true)} danger>
                Delete
              </RowButton>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

function RowButton({
  onClick,
  disabled,
  danger,
  label,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  label?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`cursor-pointer rounded-[9px] border px-[9px] py-[4px] text-[11.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-30 ${
        danger ? "border-rust/40 text-rust hover:bg-rust/10" : "border-edge-strong text-fg-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-[2px] rounded-[12px] border border-edge bg-panel-soft px-[12px] py-[9px]">
      <span className="font-serif text-[24px] leading-none tabular-nums">{value.toLocaleString("en-IN")}</span>
      <span className="text-[11px] text-fg-faint">{label}</span>
    </div>
  );
}

/** The home screen, as a small card: it is drawn live on the TV. */
function TodayThumb() {
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-[4px] rounded-[10px] border border-edge bg-[linear-gradient(165deg,#1a1613,#141110)]">
      <span className="font-serif text-[15px] leading-none text-fg">Today at FETS</span>
      <span className="font-mono text-[8.5px] tracking-[0.14em] text-fg-faint uppercase">Welcome · seats · exams</span>
    </span>
  );
}
