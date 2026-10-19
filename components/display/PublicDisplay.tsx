"use client";

import { useEffect, useRef, useState } from "react";
import { DisplayBoard } from "@/components/display/DisplayBoard";
import { basePath } from "@/lib/base-path";
import { announceCall, soundReady, unlockSound } from "@/lib/call-sound";
import { callAnnouncement } from "@/lib/home-screen";
import type { DisplayState } from "@/lib/types";

/** One press of Call or Recall: the same person called again is a new key. */
const callKey = (call: DisplayState["call"]) => (call ? `${call.token}#${call.nonce}` : null);

export function PublicDisplay({ displayKey, initial }: { displayKey: string; initial: DisplayState }) {
  const [state, setState] = useState(initial);
  const [online, setOnline] = useState(true);
  // Starts true so the prompt does not flash on a TV whose browser allows sound.
  const [hasSound, setHasSound] = useState(true);
  // Calls already played, so a name is heard once: not again when the TV
  // reconnects, nor when an earlier call comes back to the top of the board.
  const heard = useRef(new Set<string>());
  const first = useRef(true);

  useEffect(() => {
    const source = new EventSource(`${basePath}/api/display/${encodeURIComponent(displayKey)}/stream`);

    source.onmessage = (event) => {
      setOnline(true);
      try {
        setState(JSON.parse(event.data) as DisplayState);
      } catch {}
    };

    // EventSource reconnects on its own; the badge just tells the hall staff.
    source.onerror = () => setOnline(false);

    return () => source.close();
  }, [displayKey]);

  const sound = state.home?.call_sound ?? "voice";
  const key = callKey(state.call);

  useEffect(() => {
    // Whatever is on the board when the page opens has already been called.
    if (first.current) {
      first.current = false;
      if (key) heard.current.add(key);
      return;
    }
    if (!key || heard.current.has(key)) return;
    heard.current.add(key);
    if (heard.current.size > 200) heard.current = new Set([key]);
    announceCall(sound, callAnnouncement({ name: state.call?.name ?? null, room: state.call?.room ?? null }));
    // Only a new key plays; the name and room travel with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Ask for one touch or key press when the browser is holding sound back.
  useEffect(() => {
    if (sound === "off") return;
    const check = window.setTimeout(() => setHasSound(soundReady()), 1200);
    const open = () => void unlockSound().then(setHasSound);
    window.addEventListener("pointerdown", open);
    window.addEventListener("keydown", open);
    return () => {
      window.clearTimeout(check);
      window.removeEventListener("pointerdown", open);
      window.removeEventListener("keydown", open);
    };
  }, [sound]);

  return (
    <div className="relative flex h-screen flex-col shell-bg p-[14px]">
      <DisplayBoard
        className="flex-1"
        hallLabel={state.hall_label}
        centre={state.centre}
        timezone={state.timezone}
        nonce={state.call?.nonce ?? 0}
        notice={
          state.notice
            ? {
                body: state.notice.body,
                tone: state.notice.tone,
                mediaUrl: state.notice.media_url ?? null,
                mediaKind: state.notice.media_kind,
                style: state.notice.style ?? null,
              }
            : null
        }
        siteLabel={state.label}
        call={
          state.call
            ? {
                token: state.call.token,
                name: state.call.name,
                room: state.call.room,
                instruction: state.call.instruction,
              }
            : null
        }
        next={state.next.map((n) => ({ token: n.public_token, name: n.name }))}
        earlier={(state.earlier ?? []).map((e) => ({ token: e.token, name: e.name }))}
        floor={state.floor ?? null}
        home={state.home ?? null}
        slides={state.slides ?? null}
      />
      {!online && (
        <p className="pt-[8px] text-center font-mono text-[11px] text-rust">Reconnecting to the console…</p>
      )}
      {sound !== "off" && !hasSound && (
        <button
          type="button"
          onClick={() => void unlockSound().then(setHasSound)}
          className="absolute right-[26px] bottom-[26px] flex cursor-pointer items-center gap-[10px] rounded-full border border-gold/60 bg-[#191309]/90 px-[18px] py-[11px] text-[14px] font-semibold text-gold-bright shadow-lg"
        >
          <span aria-hidden className="text-[18px]">🔈</span>
          Call sound is off · tap here or press any key once
        </button>
      )}
    </div>
  );
}
