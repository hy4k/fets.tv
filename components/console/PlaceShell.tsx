"use client";

import { usePathname } from "next/navigation";
import { locate, toneVars } from "@/lib/nav";

/**
 * The console's outer frame, painted in the current place's colour.
 *
 * It sets two CSS variables from the page you are on; everything that says
 * `accent` — the light behind the page, the header, the step bar, the primary
 * buttons — follows them, and fades across when you move between places.
 */
export function PlaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { place } = locate(pathname);
  return (
    <div
      style={toneVars(place) as React.CSSProperties}
      className="flex h-dvh flex-col gap-[10px] overflow-hidden shell-bg p-[10px] md:flex-row md:gap-[14px] md:p-[14px]"
    >
      {children}
    </div>
  );
}
