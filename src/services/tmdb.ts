import { recordApiRequest, TMDB_API_ID } from "../store/apiUsage";

/** Where to read a TMDB key from, so a missing key can be reported clearly. */
export const TMDB_KEY_SETUP_HINT =
  "Set VITE_TMDB_API_KEY in .env.local (locally) or in your host's environment variables, then rebuild.";

export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/";

export interface TmdbResult {
  id: number;
  title: string;
  /** Four-digit year, or null when TMDB has no date. */
  year: number | null;
  posterPath: string | null;
  overview: string | null;
}

export type TmdbSearchResult =
  | { ok: true; results: TmdbResult[] }
  | { ok: false; error: string };

/**
 * Search TMDB for movies and TV together.
 *
 * `media_type` is deliberately ignored: we never filter or branch on it, and a
 * result is normalized the same way whichever kind it is. That keeps this file
 * indifferent to whether a disc holds a film or a series.
 */
export async function searchTmdb(
  query: string,
  options: { apiKey?: string; signal?: AbortSignal; language?: string } = {},
): Promise<TmdbSearchResult> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) return { ok: false, error: `No TMDB API key. ${TMDB_KEY_SETUP_HINT}` };

  const trimmed = query.trim();
  if (!trimmed) return { ok: true, results: [] };

  const params = new URLSearchParams({
    api_key: apiKey,
    query: trimmed,
    include_adult: "false",
    language: options.language ?? "en-US",
  });

  let response: Response;
  const startedAt = Date.now();
  try {
    response = await fetch(`https://api.themoviedb.org/3/search/multi?${params.toString()}`, {
      signal: options.signal,
    });
  } catch (error) {
    recordApiRequest(TMDB_API_ID, { ok: false, durationMs: Date.now() - startedAt });
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "TMDB search was cancelled." };
    }
    return { ok: false, error: "Could not reach TMDB. Check your connection." };
  }

  // One request left the browser; charge it before interpreting the status.
  recordApiRequest(TMDB_API_ID, {
    ok: response.ok,
    durationMs: Date.now() - startedAt,
  });

  if (response.status === 401) {
    return { ok: false, error: "TMDB rejected the API key. Check VITE_TMDB_API_KEY." };
  }
  if (response.status === 429) {
    return { ok: false, error: "TMDB is rate limiting this key. Try again shortly." };
  }
  if (!response.ok) {
    return { ok: false, error: `TMDB search failed (HTTP ${response.status}).` };
  }

  const data: unknown = await response.json().catch(() => null);
  const results = normalizeResults(data);
  return { ok: true, results };
}

function normalizeResults(data: unknown): TmdbResult[] {
  if (!data || typeof data !== "object") return [];
  const list = (data as Record<string, unknown>).results;
  if (!Array.isArray(list)) return [];

  const normalized: TmdbResult[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = record.id;
    if (typeof id !== "number") continue;

    const title =
      pickString(record.title) ?? pickString(record.name) ?? pickString(record.original_title) ?? pickString(record.original_name);
    if (!title) continue;

    const date = pickString(record.release_date) ?? pickString(record.first_air_date);
    const year = date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null;

    normalized.push({
      id,
      title,
      year,
      posterPath: pickString(record.poster_path) ?? pickString(record.profile_path),
      overview: pickString(record.overview),
    });
  }
  return normalized;
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function posterUrl(path: string | null, size: "w200" | "w342" | "w500" = "w342"): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${TMDB_IMAGE_BASE}${size}${path.startsWith("/") ? path : `/${path}`}`;
}