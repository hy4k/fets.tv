"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { centreLook, shortName } from "@/lib/centres";
import type { FrontDoorCentre } from "@/lib/landing-centres";
import { supabaseBrowser } from "@/lib/supabase/client";

const REMEMBER = "fets.centre";

/**
 * Pick the centre, then go in.
 *
 * The choice is remembered on this device, so the desk PC at Cochin opens on
 * Cochin every morning. Signed out, it carries through sign-in; signed in, it
 * moves you there on the way into the console.
 */
export function CentreChooser({
  centres,
  signedIn,
}: {
  centres: FrontDoorCentre[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(centres[0]?.id ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && centres.some((c) => c.id === saved)) setChosen(saved);
    } catch {}
  }, [centres]);

  function choose(id: string) {
    setChosen(id);
    try {
      localStorage.setItem(REMEMBER, id);
    } catch {}
  }

  const picked = centres.find((c) => c.id === chosen) ?? null;

  // Always gets you in. The move is tried first; if it is refused — a viewer
  // account, or a post still held at the other centre — you go in where you
  // already are, and the header says which centre that is. Same as sign-in.
  async function enter() {
    setBusy(true);
    if (picked) {
      await supabaseBrowser().rpc("fets_switch_centre" as never, { p_center: picked.id } as never);
    }
    router.push("/front-office");
    router.refresh();
  }

  return (
    <div className="flex w-full flex-col items-center gap-[26px]">
      {centres.length > 0 && (
        <div role="radiogroup" aria-label="Centre" className="grid w-full grid-cols-1 gap-[12px] sm:grid-cols-2">
          {centres.map((c) => {
            const look = centreLook(c.name);
            const on = c.id === chosen;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(c.id)}
                style={{ "--c1": look.tone[0], "--c2": look.tone[1] } as React.CSSProperties}
                className={`group relative flex cursor-pointer items-center gap-[16px] overflow-hidden rounded-[20px] border px-[18px] py-[16px] text-left transition-all duration-300 ${
                  on
                    ? "border-[color-mix(in_oklab,var(--c2)_70%,transparent)] bg-[linear-gradient(140deg,color-mix(in_oklab,var(--c1)_12%,transparent),transparent_70%)] shadow-[0_18px_40px_-24px_var(--c2)]"
                    : "border-edge-soft bg-panel-soft/40 hover:border-edge-warm"
                }`}
              >
                <LogoMark size={44} tone={look.tone} showEmptySeats={on} className="shrink-0 text-fg" />
                <span className="min-w-0 flex-1">
                  <span
                    className="block bg-[linear-gradient(120deg,var(--c1),var(--c2))] bg-clip-text font-serif text-[27px] leading-none text-transparent"
                  >
                    {shortName(c.name)}
                  </span>
                  <span className="mt-[6px] block truncate font-mono text-[10px] tracking-[0.12em] whitespace-nowrap text-fg-faint uppercase">
                    {look.motto ? `${look.motto} · ` : ""}Site {c.site_code}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`h-[18px] w-[18px] shrink-0 rounded-full border-2 transition-all ${
                    on ? "border-transparent bg-[linear-gradient(140deg,var(--c1),var(--c2))]" : "border-edge-strong"
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}

      {signedIn ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enter()}
          className="cursor-pointer rounded-[15px] brand-bg px-[34px] py-[15px] text-[15px] font-bold text-[#141418] shadow-[0_14px_34px_-16px_oklch(0.72_0.15_58)] disabled:opacity-50"
        >
          {busy ? "Opening…" : picked ? `Open ${shortName(picked.name)}` : "Open the console"}
        </button>
      ) : (
        <Link
          href={picked ? `/login?centre=${picked.id}` : "/login"}
          className="rounded-[15px] brand-bg px-[40px] py-[15px] text-[15px] font-bold text-[#141418] shadow-[0_14px_34px_-16px_oklch(0.72_0.15_58)]"
        >
          Sign in{picked ? ` to ${shortName(picked.name)}` : ""}
        </Link>
      )}

    </div>
  );
}
