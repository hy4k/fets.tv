"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { centreLook, shortName } from "@/lib/centres";
import { useConsole } from "@/lib/console-data";
import { supabaseBrowser } from "@/lib/supabase/client";

type Centre = { id: string; name: string; site_code: string; timezone: string };

/**
 * Which centre you are working at, and the way to the other one.
 *
 * Everybody on staff may work at either centre. Switching moves you there:
 * the whole console reloads with that centre's day, staff and posts. The
 * database refuses while you still hold a post, and says which, so a floor
 * is never left unwatched by somebody who has wandered off to the other
 * centre's screen.
 */
export function CentreSwitcher() {
  const { center, profile, notify } = useConsole();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [centres, setCentres] = useState<Centre[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const may = profile.role !== "viewer";

  // Loaded when first opened, not on every page: it only changes when a
  // centre opens or closes.
  useEffect(() => {
    if (!open || centres) return;
    void supabaseBrowser()
      .rpc("fets_centres" as never)
      .then(({ data, error }) => {
        if (error) notify(error.message, "error");
        else setCentres((data ?? []) as Centre[]);
      });
  }, [open, centres, notify]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function go(to: Centre) {
    if (to.id === center.id) return setOpen(false);
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("fets_switch_centre" as never, { p_center: to.id } as never);
    setBusy(false);
    if (error) {
      notify(error.message, "error");
      return;
    }
    setOpen(false);
    notify(`You are now working at ${to.name}`);
    startTransition(() => router.refresh());
  }

  const label = shortName(center.name);
  const look = centreLook(center.name);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        disabled={!may}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-[7px] rounded-[9px] border border-edge-strong bg-panel-soft/70 py-[3px] pr-[8px] pl-[7px] font-mono text-[10.5px] text-fg-muted transition-colors hover:border-accent/50 hover:text-fg disabled:cursor-default disabled:hover:border-edge-strong"
      >
        <span
          className={`h-[7px] w-[7px] rounded-full ${pending || busy ? "animate-ping" : ""}`}
          style={{ background: `linear-gradient(140deg, ${look.tone[0]}, ${look.tone[1]})` }}
        />
        <span
          className="bg-clip-text font-semibold text-transparent"
          style={{ backgroundImage: `linear-gradient(90deg, ${look.tone[0]}, ${look.tone[1]})` }}
        >
          {label}
        </span>
        <span className="text-fg-faint">{center.site_code}</span>
        {may && <span aria-hidden className="text-fg-faint">▾</span>}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-[calc(100%+8px)] left-0 z-50 w-[260px] rounded-[16px] border border-edge-strong panel-bg p-[6px]"
        >
          <span className="block px-[10px] pt-[6px] pb-[8px] font-mono text-[10px] tracking-[0.12em] text-fg-faint uppercase">
            Work at
          </span>
          {centres === null ? (
            <span className="block px-[10px] py-[10px] text-[12.5px] text-fg-faint">Loading…</span>
          ) : (
            centres.map((c) => {
              const here = c.id === center.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => void go(c)}
                  className={`flex w-full cursor-pointer items-center gap-[11px] rounded-[11px] px-[10px] py-[10px] text-left transition-colors disabled:opacity-50 ${
                    here ? "bg-accent/12" : "hover:bg-panel-soft"
                  }`}
                >
                  <LogoMark size={30} tone={centreLook(c.name).tone} showEmptySeats={here} className="shrink-0 text-fg" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold">{c.name}</span>
                    <span className="block font-mono text-[10.5px] text-fg-faint">Site {c.site_code}</span>
                  </span>
                  {here && <span className="font-mono text-[10px] text-accent">here</span>}
                </button>
              );
            })
          )}
          <p className="mt-[4px] border-t border-edge-soft px-[10px] pt-[9px] pb-[6px] text-[11px] leading-[1.45] text-fg-faint">
            Switching moves you there: that centre&rsquo;s day, staff and posts. Hand over any post
            you hold first.
          </p>
        </div>
      )}
    </div>
  );
}
