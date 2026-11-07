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

  it("waits for user input when no build-time barcode key exists", async () => {
    stubStorage();

    const { settingsStore, hasUsableProvider } = await loadStore();
    // The dev-only keyless trial counts as usable, so onboarding is what asks
    // for a key rather than a hard gate — but `onboarded` stays false.
    expect(settingsStore.get().onboarded).toBe(false);
    expect(hasUsableProvider(settingsStore.get())).toBe(true);
  });

  it("uses build-time keys as presets so a configured build needs no input", async () => {
    vi.stubEnv("VITE_UPCMDB_API_KEY", "preset-upcmdb");
    vi.stubEnv("VITE_UPCDATABASE_API_KEY", "preset-upcdatabase");
    stubStorage();

    const { settingsStore, usableProviders } = await loadStore();
    const settings = settingsStore.get();

    expect(settings.onboarded).toBe(true);
    expect(settings.credentials.upcmdb?.apiKey).toBe("preset-upcmdb");
    expect(settings.credentials.upcdatabase?.apiKey).toBe("preset-upcdatabase");
    expect(usableProviders(settings).map((provider) => provider.id)).toContain("upcdatabase");
  });
});

describe("settings CORS proxy", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to the built-in proxy when no deployment override is set", async () => {
    stubStorage();

    const { settingsStore } = await loadStore();
    // Not empty: UPC Database and UPCitemdb need a proxy to work at all.
    expect(settingsStore.get().proxyBaseUrl).toBe(
      "https://letterboxd-csv-proxy.coderesearcher.workers.dev/",
    );
  });

  it("prefers a deployment override over the built-in proxy", async () => {
    vi.stubEnv("VITE_CORS_PROXY_URL", "https://mine.example/");
    stubStorage();

    const { settingsStore } = await loadStore();
    expect(settingsStore.get().proxyBaseUrl).toBe("https://mine.example/");
  });

  it("lets a saved proxy override the shipped default", async () => {
    vi.stubEnv("VITE_CORS_PROXY_URL", "https://proxy.example/");
    stubStorage({ proxyBaseUrl: "https://mine.example/" });

    const { settingsStore } = await loadStore();
    expect(settingsStore.get().proxyBaseUrl).toBe("https://mine.example/");
  });

  it("does not restore the built-in proxy once the user clears it", async () => {
    stubStorage({ proxyBaseUrl: "" });

    const { settingsStore } = await loadStore();
    expect(settingsStore.get().proxyBaseUrl).toBe("");
  });
});