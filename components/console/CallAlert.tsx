"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConsole } from "@/lib/console-data";
import { fullName } from "@/lib/format";
import { locate } from "@/lib/nav";

/** Three rising notes, loud enough to hear across the desk. */
function ring() {
  try {
    const ctx = new AudioContext();
    [660, 880, 1175].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch {}
}

/**
 * The admin room has called somebody: the front office must see it now.
 *
 * Wherever the front desk is in the console, a new call flashes the whole
 * screen for a moment with the token, rings, and blinks the browser tab; then
 * it stays pinned across the top of the page, one row per candidate on their
 * way, each with its own Entered button. It is not shown in the admin room or
 * the lab, which made the call or has no part in it.
 */
export function CallAlert() {
  const pathname = usePathname();
  const { candidates, center, rpc, canFrontOffice, call } = useConsole();
  const place = locate(pathname).place?.key;
  const here = place !== "hall" && place !== "lab";

  const onTheWay = useMemo(
    () =>
      candidates
        .filter((c) => c.status === "waiting" && c.called_at)
        .sort((a, b) => (a.called_at ?? "").localeCompare(b.called_at ?? "")),
    [candidates],
  );

  // A call is new once per call row: a re-call rings again.
  const seen = useRef<Set<string> | null>(null);
  const [flash, setFlash] = useState<{ token: string; name: string; room: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const key = call?.id ?? null;
    if (seen.current === null) {
      // What was already called when the page opened is not news.
      seen.current = new Set(key ? [key] : []);
      return;
    }
    if (!key || seen.current.has(key) || !here) return;
    seen.current.add(key);
    const c = candidates.find((x) => x.id === call?.candidate_id);
    if (!c || c.status !== "waiting") return;
    ring();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFlash({ token: c.public_token, name: fullName(c), room: call?.room_label ?? "Frisking · Gate 1" });
  }, [call?.id, call?.candidate_id, call?.room_label, candidates, here]);

  // The flash is a moment, then the pinned rows carry it.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  // The tab blinks while anybody is waiting to be marked in.
  useEffect(() => {
    if (!here || onTheWay.length === 0) return;
    const base = document.title;
    let on = false;
    const timer = setInterval(() => {
      on = !on;
      document.title = on ? `● CALLED ${onTheWay[onTheWay.length - 1].public_token}` : base;
    }, 900);
    return () => {
      clearInterval(timer);
      document.title = base;
    };
  }, [here, onTheWay]);

  if (!here || (onTheWay.length === 0 && !flash)) return null;

  async function enter(id: string, token: string) {
    setBusy(id);
    await rpc("fets_mark_entered", { p_center: center.id, p_candidate: id }, `${token} entered`);
    setBusy(null);
  }

  return (
    <>
      {flash && (
        <button
          type="button"
          onClick={() => setFlash(null)}
          aria-label="Dismiss"
          className="fixed inset-0 z-[80] flex cursor-pointer flex-col items-center justify-center gap-[18px] bg-[radial-gradient(circle_at_50%_40%,oklch(0.55_0.14_165/0.92),oklch(0.2_0.05_165/0.96))] text-[#eafff4] backdrop-blur-sm motion-safe:animate-announce"
        >
          <span className="font-mono text-[16px] font-bold tracking-[0.3em] uppercase opacity-80">Called by the admin room</span>
          <span className="font-mono text-[clamp(64px,12vw,150px)] leading-none font-semibold">{flash.token}</span>
          <span className="font-display text-[clamp(28px,4vw,52px)] leading-none">{flash.name}</span>
          <span className="mt-[8px] rounded-full bg-[#0c1711]/60 px-[22px] py-[10px] text-[18px] font-bold tracking-[0.08em] uppercase">
            Send to {flash.room}
          </span>
        </button>
      )}

      {onTheWay.length > 0 && (
        <section
          aria-live="assertive"
          className="relative shrink-0 overflow-hidden rounded-[22px] border border-mint/50 bg-[linear-gradient(120deg,oklch(0.8_0.15_160),oklch(0.68_0.14_172))] p-[10px] text-[#0c1711] shadow-[0_18px_44px_-18px_oklch(0.75_0.15_165/0.8)]"
        >
          <div className="flex flex-col gap-[8px]">
            {onTheWay.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-x-[14px] gap-y-[6px] rounded-[16px] bg-white/25 px-[14px] py-[9px]">
                <span className="flex items-center gap-[8px]">
                  <span className="relative flex h-[10px] w-[10px]">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0c1711] opacity-60 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-[10px] w-[10px] rounded-full bg-[#0c1711]" />
                  </span>
                  <span className="text-[11px] font-extrabold tracking-[0.18em] uppercase">Send in</span>
                </span>
                <span className="font-mono text-[26px] leading-none font-semibold">{c.public_token}</span>
                <span className="min-w-0 truncate font-display text-[23px] leading-none">{fullName(c)}</span>
                <span className="flex-1" />
                <span className="rounded-[10px] bg-[#0c1711]/85 px-[11px] py-[6px] text-[11.5px] font-extrabold tracking-[0.06em] text-mint uppercase">
                  Frisking · Gate 1
                </span>
                <button
                  type="button"
                  disabled={!canFrontOffice || busy === c.id}
                  onClick={() => void enter(c.id, c.public_token)}
                  className="min-h-[44px] cursor-pointer rounded-[13px] bg-[#0c1711] px-[20px] py-[10px] text-[14px] font-bold text-[#eafaf1] disabled:opacity-50"
                >
                  {busy === c.id ? "…" : "Entered"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
