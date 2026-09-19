"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * One ticking clock shared by every component that shows a time, subscribed
 * through useSyncExternalStore so server and client render deterministically.
 */
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => {
    now = Date.now();
    for (const l of listeners) l();
  }, 1000);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Current epoch ms on the client, 0 while rendering on the server. */
export function useNow() {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => 0,
  );
}

export function useClock(timezone: string) {
  const value = useNow();

  const format = useCallback(
    (ms: number) =>
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: timezone,
      }).format(new Date(ms)),
    [timezone],
  );

  return value === 0 ? "--:--" : format(value);
}
