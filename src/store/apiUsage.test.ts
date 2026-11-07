import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Counters exist to show how much quota each API costs. The important
 * behaviours are that they are charged once per request, that they reset with
 * the local day, and that a day crossing while the app is open does not carry
 * yesterday's totals forward.
 */

/** Minimal in-memory IndexedDB stub; the store swallows storage failures. */
function stubIdb() {
  const data = new Map<string, unknown>();
  vi.doMock("idb-keyval", () => ({
    get: async (key: string) => data.get(key),
    set: async (key: string, value: unknown) => void data.set(key, value),
    update: async (key: string, updater: (value: unknown) => unknown) =>
      void data.set(key, updater(data.get(key))),
  }));
  return data;
}

async function loadModule() {
  vi.resetModules();
  return import("./apiUsage");
}

beforeEach(() => {
  stubIdb();
});

afterEach(() => {
  vi.doUnmock("idb-keyval");
  vi.resetModules();
});

describe("apiUsage dayKey", () => {
  it("formats the local day, not UTC", async () => {
    const { dayKey } = await loadModule();
    // 2026-11-07 23:30 local: a UTC-based key would roll over to the 8th here
    // in any timezone ahead of UTC, which these counters must not do.
    const local = new Date(2026, 10, 7, 23, 30);
    expect(dayKey(local.getTime())).toBe("2026-11-07");
  });
});

describe("recordApiRequest", () => {
  it("counts requests per API separately", async () => {
    const { apiUsageStore, recordApiRequest } = await loadModule();

    recordApiRequest("upcmdb", { ok: true, durationMs: 100 });
    recordApiRequest("upcmdb", { ok: true, durationMs: 300 });
    recordApiRequest("tmdb", { ok: true, durationMs: 50 });

    const { usage } = apiUsageStore.get();
    expect(usage.upcmdb).toMatchObject({ requests: 2, errors: 0, totalMs: 400 });
    expect(usage.tmdb).toMatchObject({ requests: 1, errors: 0, totalMs: 50 });
  });

  it("counts failed requests as requests too, plus an error", async () => {
    const { apiUsageStore, recordApiRequest } = await loadModule();

    recordApiRequest("upcitemdb", { ok: false, durationMs: 20 });

    expect(apiUsageStore.get().usage.upcitemdb).toMatchObject({ requests: 1, errors: 1 });
  });

  it("never records negative latency", async () => {
    const { apiUsageStore, recordApiRequest } = await loadModule();

    // A provider that does not report a duration must not skew the average.
    recordApiRequest("eandata", { ok: true });

    expect(apiUsageStore.get().usage.eandata).toMatchObject({ requests: 1, totalMs: 0 });
  });

  it("resets a counter when the local day changes", async () => {
    const { apiUsageStore, recordApiRequest, dayKey } = await loadModule();
    const yesterday = new Date(2026, 10, 6, 12, 0).getTime();
    const today = new Date(2026, 10, 7, 12, 0).getTime();

    recordApiRequest("upcmdb", { ok: true, durationMs: 100, now: yesterday });
    recordApiRequest("upcmdb", { ok: true, durationMs: 100, now: yesterday });
    expect(apiUsageStore.get().usage.upcmdb?.requests).toBe(2);

    // Same app session, next day: the total starts from zero again.
    recordApiRequest("upcmdb", { ok: true, durationMs: 100, now: today });
    const entry = apiUsageStore.get().usage.upcmdb;
    expect(entry?.requests).toBe(1);
    expect(entry?.day).toBe(dayKey(today));
  });
});

describe("averageLatencyMs", () => {
  it("returns null when nothing was timed", async () => {
    const { averageLatencyMs } = await loadModule();

    expect(averageLatencyMs(undefined)).toBeNull();
    expect(averageLatencyMs({ day: "2026-11-07", requests: 3, errors: 0, totalMs: 0 })).toBeNull();
  });

  it("rounds to whole milliseconds", async () => {
    const { averageLatencyMs } = await loadModule();

    expect(averageLatencyMs({ day: "2026-11-07", requests: 3, errors: 0, totalMs: 100 })).toBe(33);
  });
});

describe("loadApiUsage", () => {
  it("drops stored counters from a previous day", async () => {
    const data = stubIdb();
    data.set("lbd-disc-api-usage-v1", {
      upcmdb: { day: "2026-11-06", requests: 9, errors: 1, totalMs: 900 },
    });

    const { apiUsageStore, loadApiUsage } = await loadModule();
    await loadApiUsage();

    const entry = apiUsageStore.get().usage.upcmdb;
    expect(entry?.requests).toBe(0);
    expect(entry?.errors).toBe(0);
    expect(apiUsageStore.get().loaded).toBe(true);
  });
});

describe("clearApiUsage", () => {
  it("zeroes every counter", async () => {
    const { apiUsageStore, recordApiRequest, clearApiUsage } = await loadModule();

    recordApiRequest("tmdb", { ok: true, durationMs: 10 });
    clearApiUsage();

    expect(apiUsageStore.get().usage).toEqual({});
  });
});
