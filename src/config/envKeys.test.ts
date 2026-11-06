import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The barcode-database keys must be unreachable in a production build. Reading
 * `import.meta.env.DEV` and returning early is what lets Vite dead-code
 * eliminate them, so these tests pin that the guard actually returns nothing.
 */
async function loadEnvKeys(dev: boolean) {
  vi.resetModules();
  // Vite sets DEV as a literal, so tests override it directly rather than
  // through `vi.stubEnv`, which only handles strings.
  (import.meta.env as Record<string, unknown>).DEV = dev;
  return import("./envKeys");
}

afterEach(() => {
  (import.meta.env as Record<string, unknown>).DEV = true;
  vi.unstubAllEnvs();
});

describe("build-time credentials", () => {
  it("exposes barcode keys during development", async () => {
    vi.stubEnv("VITE_UPCMDB_API_KEY", "dev-upcmdb");
    vi.stubEnv("VITE_EANDATA_API_KEY", "dev-eandata");

    const { ENV_CREDENTIALS, HAS_ENV_CREDENTIALS, envCredentialsFor } = await loadEnvKeys(true);

    expect(ENV_CREDENTIALS.upcmdb?.apiKey).toBe("dev-upcmdb");
    expect(envCredentialsFor("eandata").apiKey).toBe("dev-eandata");
    expect(HAS_ENV_CREDENTIALS).toBe(true);
  });

  it("hands back nothing at all in a production build", async () => {
    vi.stubEnv("VITE_UPCMDB_API_KEY", "dev-upcmdb");
    vi.stubEnv("VITE_UPCDATABASE_API_KEY", "dev-upcdatabase");
    vi.stubEnv("VITE_EANDATA_API_KEY", "dev-eandata");

    const { ENV_CREDENTIALS, HAS_ENV_CREDENTIALS, envCredentialsFor } = await loadEnvKeys(false);

    expect(ENV_CREDENTIALS).toEqual({});
    expect(envCredentialsFor("upcmdb")).toEqual({});
    // With no dev keys the first-run key prompt must not be skipped.
    expect(HAS_ENV_CREDENTIALS).toBe(false);
  });

  it("always exposes the TMDB key, in both modes", async () => {
    vi.stubEnv("VITE_TMDB_API_KEY", "tmdb-everywhere");

    expect((await loadEnvKeys(true)).ENV_TMDB_API_KEY).toBe("tmdb-everywhere");
    expect((await loadEnvKeys(false)).ENV_TMDB_API_KEY).toBe("tmdb-everywhere");
  });

  it("treats blank and whitespace values as absent", async () => {
    vi.stubEnv("VITE_UPCMDB_API_KEY", "   ");
    vi.stubEnv("VITE_EANDATA_API_KEY", "");

    const { HAS_ENV_CREDENTIALS, envCredentialsFor } = await loadEnvKeys(true);

    expect(envCredentialsFor("upcmdb")).toEqual({});
    expect(envCredentialsFor("eandata")).toEqual({});
    expect(HAS_ENV_CREDENTIALS).toBe(false);
  });
});