/**
 * Tests must not depend on the developer's `.env.local`: a key that happens to
 * be set locally would silently change what the suite asserts. Vitest loads the
 * real env files, so strip every `VITE_*` value this project consumes before any
 * test module is imported. Tests that need a value call `vi.stubEnv`.
 */
const KEYS = [
  "VITE_TMDB_API_KEY",
  "VITE_UPCMDB_API_KEY",
  "VITE_UPCDATABASE_API_KEY",
  "VITE_EANDATA_API_KEY",
  "VITE_UPCITEMDB_API_KEY",
];

for (const key of KEYS) {
  delete import.meta.env[key];
}