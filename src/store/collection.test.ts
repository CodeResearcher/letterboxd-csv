import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The lookup memo exists to avoid paying a barcode database twice for the same
 * disc. The rule it must follow is narrower than "cache every lookup": only a
 * barcode that has actually been filed in the list may be cached, and deleting
 * that entry must drop the cache so the next search really queries the APIs
 * again. These tests pin that lifecycle down.
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

async function loadStore() {
  vi.resetModules();
  return import("./collection");
}

let data: Map<string, unknown>;

beforeEach(() => {
  data = stubIdb();
});

afterEach(() => {
  vi.doUnmock("idb-keyval");
  vi.resetModules();
});

const MEMO_KEY = "lbd-disc-lookup-memo-v1";

describe("lookup memo", () => {
  it("reads back a barcode that was written", async () => {
    const { writeMemo, readMemo } = await loadStore();

    await writeMemo("0883929264483", { title: "The Matrix", providerId: "upcmdb" });

    const memo = await readMemo("0883929264483");
    expect(memo).toMatchObject({ title: "The Matrix", providerId: "upcmdb" });
    expect(typeof memo?.savedAt).toBe("number");
  });

  it("returns nothing for a barcode that was never written", async () => {
    const { readMemo } = await loadStore();

    expect(await readMemo("0883929264483")).toBeUndefined();
  });

  it("honours a caller-supplied savedAt, so the TTL tracks the entry", async () => {
    const { writeMemo, readMemo } = await loadStore();
    // Recent, so the value round-trips rather than tripping the TTL.
    const addedAt = Date.now() - 60_000;

    await writeMemo("0883929264483", { title: "The Matrix", providerId: "upcmdb", savedAt: addedAt });

    expect((await readMemo("0883929264483"))?.savedAt).toBe(addedAt);
  });

  it("expires a memo older than its TTL", async () => {
    const { writeMemo, readMemo } = await loadStore();
    const ninetyOneDaysAgo = Date.now() - 91 * 24 * 60 * 60 * 1000;

    await writeMemo("0883929264483", {
      title: "The Matrix",
      providerId: "upcmdb",
      savedAt: ninetyOneDaysAgo,
    });

    expect(await readMemo("0883929264483")).toBeUndefined();
  });
});

describe("removeEntry", () => {
  it("drops the memo for the removed entry's barcode", async () => {
    const { writeMemo, readMemo, addEntry, removeEntry } = await loadStore();

    const outcome = addEntry({
      barcode: "883929264483",
      rawTitle: "The Matrix",
      tmdbId: 603,
      title: "The Matrix",
      year: 1999,
      posterPath: null,
      providerId: "upcmdb",
    });
    expect(outcome.status).toBe("added");
    await writeMemo("0883929264483", { title: "The Matrix", providerId: "upcmdb" });

    // The entry stores the raw scan, the memo is keyed by EAN-13; deleting must
    // clear it via the normalized form.
    removeEntry((outcome as { status: "added"; entry: { id: string } }).entry.id);

    await vi.waitFor(async () => {
      expect(await readMemo("0883929264483")).toBeUndefined();
    });
  });

  it("leaves other barcodes' memos untouched", async () => {
    const { writeMemo, readMemo, addEntry, removeEntry } = await loadStore();

    const keep = addEntry({
      barcode: "5050582941357",
      rawTitle: "Rear Window",
      tmdbId: 567,
      title: "Rear Window",
      year: 1954,
      posterPath: null,
      providerId: "upcmdb",
    });
    const drop = addEntry({
      barcode: "883929264483",
      rawTitle: "The Matrix",
      tmdbId: 603,
      title: "The Matrix",
      year: 1999,
      posterPath: null,
      providerId: "upcmdb",
    });
    await writeMemo("05050582941357", { title: "Rear Window", providerId: "upcmdb" });
    await writeMemo("0883929264483", { title: "The Matrix", providerId: "upcmdb" });

    removeEntry((drop as { status: "added"; entry: { id: string } }).entry.id);

    await vi.waitFor(async () => {
      expect(await readMemo("0883929264483")).toBeUndefined();
    });
    expect(await readMemo("05050582941357")).toMatchObject({ title: "Rear Window" });
    expect((keep as { status: "added" }).status).toBe("added");
  });
});

describe("clearCollection", () => {
  it("drops every memo", async () => {
    const { writeMemo, readMemo, clearCollection } = await loadStore();

    await writeMemo("0883929264483", { title: "The Matrix", providerId: "upcmdb" });
    await writeMemo("05050582941357", { title: "Rear Window", providerId: "upcmdb" });

    clearCollection();

    await vi.waitFor(async () => {
      expect(data.get(MEMO_KEY)).toEqual({});
    });
    expect(await readMemo("0883929264483")).toBeUndefined();
    expect(await readMemo("05050582941357")).toBeUndefined();
  });
});
