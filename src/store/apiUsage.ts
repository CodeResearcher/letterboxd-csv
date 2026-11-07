import { get, set } from "idb-keyval";
import { createStore } from "./createStore";

/**
 * Per-API request counters.
 *
 * Three of the barcode databases have daily quotas and TMDB rate-limits by key,
 * so it is worth seeing how many requests each one actually costs. Counts are
 * per local day and reset when the day changes, matching how those quotas work.
 *
 * Storage lives in IndexedDB alongside the collection so it survives restarts,
 * but it is strictly a diagnostic: every write is best-effort, and losing it
 * costs nothing.
 */
const USAGE_KEY = "lbd-disc-api-usage-v1";

/** Synthetic id for TMDB, which is not a barcode provider. */
export const TMDB_API_ID = "tmdb";

export interface ApiUsageEntry {
  /** Local day as `YYYY-MM-DD`. Counts reset when this no longer matches today. */
  day: string;
  /** Requests that actually left the browser. */
  requests: number;
  /** Requests the API answered with an error, or never answered at all. */
  errors: number;
  /** Summed latency in milliseconds, kept so an average can be shown. */
  totalMs: number;
}

export type ApiUsageState = {
  /** Keyed by provider id, plus `TMDB_API_ID`. */
  usage: Record<string, ApiUsageEntry>;
  loaded: boolean;
};

/**
 * Local calendar day, not UTC: the quotas reset on the user's clock, so "today"
 * should mean the day they are experiencing.
 */
export function dayKey(now: number = Date.now()): string {
  const date = new Date(now);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function emptyEntry(now: number): ApiUsageEntry {
  return { day: dayKey(now), requests: 0, errors: 0, totalMs: 0 };
}

export const apiUsageStore = createStore<ApiUsageState>({ usage: {}, loaded: false });

/**
 * Zero out anything that is not from today.
 *
 * Applied on load *and* on every record, so an app left open overnight starts
 * the new day at zero instead of carrying yesterday's totals across midnight.
 */
function withCurrentDay(usage: Record<string, ApiUsageEntry>, now: number): Record<string, ApiUsageEntry> {
  const today = dayKey(now);
  const next: Record<string, ApiUsageEntry> = {};
  for (const [apiId, entry] of Object.entries(usage)) {
    next[apiId] = entry?.day === today ? entry : emptyEntry(now);
  }
  return next;
}

/** Best-effort write. IndexedDB is unavailable in private mode and in tests. */
function persist(usage: Record<string, ApiUsageEntry>): void {
  try {
    void set(USAGE_KEY, usage).catch(() => undefined);
  } catch {
    // Counts stay in memory for this session.
  }
}

/** Read stored counters once at startup. `main.tsx` calls this before rendering. */
export async function loadApiUsage(): Promise<void> {
  let stored: Record<string, ApiUsageEntry> = {};
  try {
    stored = (await get<Record<string, ApiUsageEntry>>(USAGE_KEY)) ?? {};
  } catch {
    stored = {};
  }
  apiUsageStore.set({ usage: withCurrentDay(stored, Date.now()), loaded: true });
}

export interface ApiRequestOutcome {
  /** False when the API errored or never answered. A "not found" is still ok. */
  ok: boolean;
  durationMs?: number;
  /** Injectable clock, so tests can cross a day boundary. */
  now?: number;
}

/** Count one request. Safe to call from anywhere; never throws. */
export function recordApiRequest(apiId: string, outcome: ApiRequestOutcome): void {
  const now = outcome.now ?? Date.now();
  const usage = withCurrentDay(apiUsageStore.get().usage, now);
  const current = usage[apiId] ?? emptyEntry(now);
  usage[apiId] = {
    day: current.day,
    requests: current.requests + 1,
    errors: current.errors + (outcome.ok ? 0 : 1),
    totalMs: current.totalMs + Math.max(0, outcome.durationMs ?? 0),
  };
  apiUsageStore.set({ usage, loaded: true });
  persist(usage);
}

export function clearApiUsage(): void {
  apiUsageStore.set({ usage: {}, loaded: true });
  persist({});
}

/** Average latency in whole milliseconds, or null when nothing was timed. */
export function averageLatencyMs(entry: ApiUsageEntry | undefined): number | null {
  if (!entry || entry.requests === 0 || entry.totalMs === 0) return null;
  return Math.round(entry.totalMs / entry.requests);
}
