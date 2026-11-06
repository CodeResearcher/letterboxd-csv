import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `.env` keys prefill the Settings form, but they must never resurrect a value
 * the user deliberately cleared, and a saved key must win over the build-time
 * one. These checks need a localStorage stub before the store module loads.
 */
function stubStorage(initial?: unknown) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set("lbd-disc-settings-v1", JSON.stringify(initial));
  globalThis.localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  } as Storage;
  return data;
}

/** Fresh module instance, so `settingsStore` re-runs `loadSettings`. */
async function loadStore() {
  vi.resetModules();
  return import("./settings");
}

describe("settings credentials", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefills build-time env keys when nothing is saved", async () => {
    vi.stubEnv("VITE_UPCMDB_API_KEY", "env-upcmdb");
    vi.stubEnv("VITE_EANDATA_API_KEY", "env-eandata");
    stubStorage();

    const { settingsStore } = await loadStore();
    const { credentials } = settingsStore.get();

    expect(credentials.upcmdb?.apiKey).toBe("env-upcmdb");
    expect(credentials.eandata?.apiKey).toBe("env-eandata");
  });

  it("lets a saved key override the build-time value", async () => {
    vi.stubEnv("VITE_UPCMDB_API_KEY", "env-upcmdb");
    stubStorage({ credentials: { upcmdb: { apiKey: "mine" } } });

    const { settingsStore } = await loadStore();
    expect(settingsStore.get().credentials.upcmdb?.apiKey).toBe("mine");
  });

  it("does not refill a key the user cleared", async () => {
    vi.stubEnv("VITE_UPCMDB_API_KEY", "env-upcmdb");
    stubStorage({ credentials: { upcmdb: { apiKey: "" } } });

    const { settingsStore } = await loadStore();
    expect(settingsStore.get().credentials.upcmdb?.apiKey).toBe("");
  });

  it("stays usable for a keyless provider when no keys are configured", async () => {
    stubStorage();

    const { settingsStore, usableProviders } = await loadStore();
    const ids = usableProviders(settingsStore.get()).map((provider) => provider.id);
    expect(ids).toContain("upcitemdb");
    expect(ids).not.toContain("upcmdb");
  });

  it("skips onboarding only when a build-time key ships", async () => {
    stubStorage();
    expect((await loadStore()).settingsStore.get().onboarded).toBe(false);

    vi.stubEnv("VITE_TMDB_API_KEY", "tmdb-only");
    stubStorage();
    expect((await loadStore()).settingsStore.get().onboarded).toBe(false);

    vi.stubEnv("VITE_UPCMDB_API_KEY", "env-upcmdb");
    stubStorage();
    expect((await loadStore()).settingsStore.get().onboarded).toBe(true);
  });
});