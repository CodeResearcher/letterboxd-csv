/**
 * Build-time credentials, split by audience.
 *
 * Two very different things live behind `import.meta.env` here:
 *
 * - **TMDB** is used by every visitor, so its key ships in the bundle. Vite
 *   inlines it; treat it as public.
 * - **Barcode-database** keys are for local testing only. They are read from
 *   `.env.development.local`, which Vite loads *only* in development mode, and
 *   the read is additionally gated on `import.meta.env.DEV` so a stripped-down
 *   or misconfigured build still cannot bake them in.
 *
 * Anything the user types in Settings is stored in localStorage and wins over
 * these defaults, so a visitor can always bring their own key.
 */
type EnvCredentials = Record<string, Record<string, string>>;

function read(value: string | undefined): string {
  return value?.trim() ?? "";
}

/**
 * Barcode-database keys for testing.
 *
 * `import.meta.env.DEV` is a literal `false` in production builds, so Vite's
 * dead-code elimination drops this whole object — the keys are not merely
 * absent from `.env`, they are unreachable in the emitted JavaScript.
 */
function devCredentials(): EnvCredentials {
  if (!import.meta.env.DEV) return {};
  return {
    upcmdb: { apiKey: read(import.meta.env.VITE_UPCMDB_API_KEY) },
    upcdatabase: { apiKey: read(import.meta.env.VITE_UPCDATABASE_API_KEY) },
    eandata: { apiKey: read(import.meta.env.VITE_EANDATA_API_KEY) },
    upcitemdb: { apiKey: read(import.meta.env.VITE_UPCITEMDB_API_KEY) },
  };
}

export const ENV_CREDENTIALS: EnvCredentials = devCredentials();

/** TMDB key, present in every build. */
export const ENV_TMDB_API_KEY = read(import.meta.env.VITE_TMDB_API_KEY);

/** Only non-empty values, so a blank env var does not count as a saved key. */
export function envCredentialsFor(providerId: string): Record<string, string> {
  const values = ENV_CREDENTIALS[providerId] ?? {};
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value.length > 0),
  );
}

/**
 * True when the build ships at least one usable *barcode* key. Only ever true
 * during development, where it skips the first-run key prompt: asking for a key
 * that is already filled in is noise.
 */
export const HAS_ENV_CREDENTIALS = Object.values(ENV_CREDENTIALS).some((values) =>
  Object.values(values).some((value) => value.length > 0),
);