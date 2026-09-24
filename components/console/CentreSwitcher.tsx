"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
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

  const label = center.name.replace(/^FETS\s+/i, "");

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
        <span className={`h-[6px] w-[6px] rounded-full bg-mint ${pending || busy ? "animate-ping" : "animate-pulse-dot"}`} />
        {center.site_code} · {label}
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
                  <span
                    className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] font-mono text-[10px] font-bold ${
                      here ? "gold-bg text-[#141418]" : "bg-panel-soft text-fg-muted"
                    }`}
                  >
                    {c.name.replace(/^FETS\s+/i, "").slice(0, 3).toUpperCase()}
                  </span>
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
