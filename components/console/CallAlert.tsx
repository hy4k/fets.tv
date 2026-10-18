"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConsole } from "@/lib/console-data";
import { fullName, refOf } from "@/lib/format";
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
 * Wherever the front desk is in the console, a new call rings and blinks the
 * browser tab, and the candidate is pinned across the top of the page, one row
 * per candidate on their way, each with its own Send to admin button. The name
 * itself is announced on the hall TV only: a full-screen flash here used to
 * cover the check-in form mid-entry, so the desk is never interrupted now. It is not shown in the admin room or
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
  }, [call?.id, call?.candidate_id, candidates, here]);

  // The tab blinks while anybody is waiting to be marked in.
  useEffect(() => {
    if (!here || onTheWay.length === 0) return;
    const base = document.title;
    let on = false;
    const timer = setInterval(() => {
      on = !on;
      document.title = on ? `● CALLED ${fullName(onTheWay[onTheWay.length - 1])}` : base;
    }, 900);
    return () => {
      clearInterval(timer);
      document.title = base;
    };
  }, [here, onTheWay]);

  if (!here || onTheWay.length === 0) return null;

  async function enter(id: string, token: string) {
    setBusy(id);
    await rpc("fets_mark_entered", { p_center: center.id, p_candidate: id }, `${token} entered`);
    setBusy(null);
  }

  return (
    <>
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
                <span className="min-w-0 truncate font-display text-[26px] leading-none">{fullName(c)}</span>
                <span className="font-mono text-[13px] leading-none font-semibold opacity-75">{refOf(c)}</span>
                <span className="flex-1" />
                <span className="rounded-[10px] bg-[#0c1711]/85 px-[11px] py-[6px] text-[11.5px] font-extrabold tracking-[0.06em] text-mint uppercase">
                  Security &amp; Biometrics
                </span>
                <button
                  type="button"
                  disabled={!canFrontOffice || busy === c.id}
                  onClick={() => void enter(c.id, refOf(c))}
                  className="min-h-[44px] cursor-pointer rounded-[13px] bg-[#0c1711] px-[20px] py-[10px] text-[14px] font-bold text-[#eafaf1] disabled:opacity-50"
                >
                  {busy === c.id ? "…" : "Send to admin"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
