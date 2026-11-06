import { get, set, update } from "idb-keyval";
import { createStore } from "./createStore";
import type { CollectionEntry, LookupMemo, UnresolvedEntry } from "./types";

/**
 * The collection is the source of truth for the CSV, so it lives in IndexedDB
 * rather than localStorage: it survives app restarts, and it is not limited to
 * a few megabytes. Downloads regenerate the CSV from here.
 */
const ENTRIES_KEY = "lbd-disc-collection-v1";
const UNRESOLVED_KEY = "lbd-disc-unresolved-v1";
const MEMO_KEY = "lbd-disc-lookup-memo-v1";
const COOLDOWNS_KEY = "lbd-disc-cooldowns-v1";

const MEMO_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MEMO_LIMIT = 2000;

export type CollectionState = {
  entries: CollectionEntry[];
  unresolved: UnresolvedEntry[];
  loaded: boolean;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const collectionStore = createStore<CollectionState>({
  entries: [],
  unresolved: [],
  loaded: false,
});

async function persistEntries(entries: CollectionEntry[]): Promise<void> {
  await set(ENTRIES_KEY, entries).catch(() => undefined);
}

async function persistUnresolved(unresolved: UnresolvedEntry[]): Promise<void> {
  await set(UNRESOLVED_KEY, unresolved).catch(() => undefined);
}

/** Read stored state once at startup. */
export async function loadCollection(): Promise<void> {
  const [entries, unresolved] = await Promise.all([
    get<CollectionEntry[]>(ENTRIES_KEY).catch(() => undefined),
    get<UnresolvedEntry[]>(UNRESOLVED_KEY).catch(() => undefined),
  ]);
  collectionStore.set({
    entries: Array.isArray(entries) ? entries : [],
    unresolved: Array.isArray(unresolved) ? unresolved : [],
    loaded: true,
  });
  await requestPersistentStorage();
}

/** Ask the browser not to evict our data. Best effort; failures are normal. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function findByBarcode(barcode: string): CollectionEntry | undefined {
  return collectionStore.get().entries.find((entry) => entry.barcode === barcode);
}

export function hasTmdbId(tmdbId: number): boolean {
  return collectionStore.get().entries.some((entry) => entry.tmdbId === tmdbId);
}

export interface AddEntryInput {
  barcode: string;
  rawTitle: string;
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  providerId: string;
}

export type AddEntryResult =
  | { status: "added"; entry: CollectionEntry }
  | { status: "duplicate_barcode"; entry: CollectionEntry }
  | { status: "duplicate_tmdb"; entry: CollectionEntry };

/**
 * Add a confirmed entry. Both dedupe checks happen here so every code path
 * (scanner, manual entry, unresolved retry) gets them.
 */
export function addEntry(input: AddEntryInput): AddEntryResult {
  const state = collectionStore.get();
  const byBarcode = state.entries.find((entry) => entry.barcode === input.barcode);
  if (byBarcode) return { status: "duplicate_barcode", entry: byBarcode };
  const byTmdb = state.entries.find((entry) => entry.tmdbId === input.tmdbId);
  if (byTmdb) return { status: "duplicate_tmdb", entry: byTmdb };

  const entry: CollectionEntry = { ...input, id: newId(), addedAt: Date.now() };
  const entries = [entry, ...state.entries];
  collectionStore.set({ ...state, entries });
  void persistEntries(entries);
  void removeUnresolvedByBarcode(input.barcode);
  return { status: "added", entry };
}

export function updateEntry(entryId: string, patch: Partial<Omit<CollectionEntry, "id">>): void {
  const state = collectionStore.get();
  const entries = state.entries.map((entry) =>
    entry.id === entryId ? { ...entry, ...patch } : entry,
  );
  collectionStore.set({ ...state, entries });
  void persistEntries(entries);
}

export function removeEntry(entryId: string): void {
  const state = collectionStore.get();
  const entries = state.entries.filter((entry) => entry.id !== entryId);
  collectionStore.set({ ...state, entries });
  void persistEntries(entries);
}

export function clearCollection(): void {
  collectionStore.set({ entries: [], unresolved: [], loaded: true });
  void persistEntries([]);
  void persistUnresolved([]);
}

export function addUnresolved(barcode: string, reason: string): void {
  const state = collectionStore.get();
  if (state.unresolved.some((item) => item.barcode === barcode)) return;
  const unresolved = [
    { id: newId(), barcode, reason, addedAt: Date.now() },
    ...state.unresolved,
  ];
  collectionStore.set({ ...state, unresolved });
  void persistUnresolved(unresolved);
}

export function removeUnresolved(id: string): void {
  const state = collectionStore.get();
  const unresolved = state.unresolved.filter((item) => item.id !== id);
  collectionStore.set({ ...state, unresolved });
  void persistUnresolved(unresolved);
}

export async function removeUnresolvedByBarcode(barcode: string): Promise<void> {
  const state = collectionStore.get();
  if (!state.unresolved.some((item) => item.barcode === barcode)) return;
  const unresolved = state.unresolved.filter((item) => item.barcode !== barcode);
  collectionStore.set({ ...state, unresolved });
  await persistUnresolved(unresolved);
}

/* ------------------------------------------------------------------ */
/* Lookup memo: avoids paying for the same barcode twice.              */
/* ------------------------------------------------------------------ */

type MemoMap = Record<string, LookupMemo>;

export async function readMemo(barcode: string): Promise<LookupMemo | undefined> {
  const all = (await get<MemoMap>(MEMO_KEY).catch(() => undefined)) ?? {};
  const memo = all[barcode];
  if (!memo) return undefined;
  if (Date.now() - memo.savedAt > MEMO_TTL_MS) return undefined;
  return memo;
}

export async function writeMemo(barcode: string, memo: Omit<LookupMemo, "savedAt">): Promise<void> {
  const all = (await get<MemoMap>(MEMO_KEY).catch(() => undefined)) ?? {};
  all[barcode] = { ...memo, savedAt: Date.now() };
  const keys = Object.keys(all);
  if (keys.length > MEMO_LIMIT) {
    keys
      .sort((a, b) => all[a].savedAt - all[b].savedAt)
      .slice(0, keys.length - MEMO_LIMIT)
      .forEach((key) => delete all[key]);
  }
  await update(MEMO_KEY, () => all).catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* Rate-limit cooldowns.                                              */
/* ------------------------------------------------------------------ */

type CooldownMap = Record<string, number>;
const COOLDOWN_MS = 10 * 60 * 1000;

export async function readCooldowns(): Promise<CooldownMap> {
  const stored = (await get<CooldownMap>(COOLDOWNS_KEY).catch(() => undefined)) ?? {};
  const now = Date.now();
  return Object.fromEntries(Object.entries(stored).filter(([, until]) => until > now));
}

export async function markRateLimited(providerId: string): Promise<void> {
  const cooldowns = await readCooldowns();
  cooldowns[providerId] = Date.now() + COOLDOWN_MS;
  await set(COOLDOWNS_KEY, cooldowns).catch(() => undefined);
}