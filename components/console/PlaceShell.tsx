"use client";

import { usePathname } from "next/navigation";
import { locate, toneVars } from "@/lib/nav";

/**
 * The console's outer frame, painted in the current place's colour.
 *
 * It sets two CSS variables from the page you are on; everything that says
 * `accent` — the light behind the page, the hero, the tabs, the primary
 * buttons — follows them, and fades across when you move between spaces.
 */
export function PlaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { place } = locate(pathname);
  return (
    <div
      style={toneVars(place) as React.CSSProperties}
      className="flex h-dvh flex-col overflow-hidden shell-bg"
    >
      {children}
    </div>
  );
}
