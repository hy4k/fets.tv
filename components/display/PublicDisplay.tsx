"use client";

import { useEffect, useState } from "react";
import { DisplayBoard } from "@/components/display/DisplayBoard";
import { basePath } from "@/lib/base-path";
import type { DisplayState } from "@/lib/types";

export function PublicDisplay({ displayKey, initial }: { displayKey: string; initial: DisplayState }) {
  const [state, setState] = useState(initial);
  const [online, setOnline] = useState(true);

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

  return (
    <div className="flex h-screen flex-col shell-bg p-[14px]">
      <DisplayBoard
        className="flex-1"
        hallLabel={state.hall_label}
        timezone={state.timezone}
        nonce={state.call?.nonce ?? 0}
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
      />
      {!online && (
        <p className="pt-[8px] text-center font-mono text-[11px] text-rust">Reconnecting to the console…</p>
      )}
    </div>
  );
}
