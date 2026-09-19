"use client";

import { useCallback, useSyncExternalStore } from "react";

type DrawerState = Record<string, boolean>;

const snapshots = new Map<string, DrawerState>();
const serverSnapshots = new Map<string, DrawerState>();
const listeners = new Map<string, Set<() => void>>();

function storageKey(screen: string) {
  return `fets.drawers.${screen}`;
}

function snapshot(screen: string, defaults: DrawerState): DrawerState {
  const cached = snapshots.get(screen);
  if (cached) return cached;

  let state = { ...defaults };
  try {
    const raw = window.localStorage.getItem(storageKey(screen));
    if (raw) state = { ...state, ...(JSON.parse(raw) as DrawerState) };
  } catch {}

  snapshots.set(screen, state);
  return state;
}

function serverSnapshot(screen: string, defaults: DrawerState): DrawerState {
  const cached = serverSnapshots.get(screen);
  if (cached) return cached;

  const state = { ...defaults };
  serverSnapshots.set(screen, state);
  return state;
}

function subscribe(screen: string, listener: () => void) {
  const set = listeners.get(screen) ?? new Set();
  set.add(listener);
  listeners.set(screen, set);
  return () => set.delete(listener);
}

/** Drawer open/closed state, remembered per screen across navigation. */
export function useDrawers<T extends DrawerState>(screen: string, defaults: T) {
  const open = useSyncExternalStore(
    useCallback((listener: () => void) => subscribe(screen, listener), [screen]),
    useCallback(() => snapshot(screen, defaults) as T, [screen, defaults]),
    useCallback(() => serverSnapshot(screen, defaults) as T, [screen, defaults]),
  );

  const toggle = useCallback(
    (key: keyof T & string) => () => {
      const next = { ...snapshot(screen, defaults), [key]: !snapshot(screen, defaults)[key] };
      snapshots.set(screen, next);
      try {
        window.localStorage.setItem(storageKey(screen), JSON.stringify(next));
      } catch {}
      for (const listener of listeners.get(screen) ?? []) listener();
    },
    [screen, defaults],
  );

  return { open, toggle };
}
