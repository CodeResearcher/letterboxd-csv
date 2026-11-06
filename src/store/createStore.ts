import { useSyncExternalStore } from "react";

/**
 * A very small external store. Enough for this app (no middleware, no
 * selectors), and it keeps the dependency count down to the essentials.
 */
export interface Store<T> {
  get: () => T;
  set: (updater: T | ((current: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
  /** React hook that re-renders when the store changes. */
  use: () => T;
}

export function createStore<T>(initial: T | (() => T)): Store<T> {
  let state = typeof initial === "function" ? (initial as () => T)() : initial;
  const listeners = new Set<() => void>();

  const store: Store<T> = {
    get: () => state,
    set(updater) {
      const next = typeof updater === "function" ? (updater as (current: T) => T)(state) : updater;
      if (Object.is(next, state)) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    use() {
      return useSyncExternalStore(store.subscribe, store.get, store.get);
    },
  };
  return store;
}