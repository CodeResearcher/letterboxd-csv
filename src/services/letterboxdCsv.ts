import type { CollectionEntry } from "../store/types";

/**
 * Letterboxd CSV generation.
 *
 * A Letterboxd import row only needs to identify a film. Per the import docs a
 * film is identified by one of `LetterboxdURI`, `tmdbID`, `imdbID`, or
 * `Title` + `Year`, and every other column is optional. We therefore emit the
 * single required identifier, `tmdbID`, and nothing else.
 */
export const CSV_HEADER = "tmdbID";

/** Escape a single CSV field per RFC 4180. Not needed today, kept for future columns. */
export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value) || /^\s|\s$/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Build the CSV text. IDs are deduplicated and emitted in insertion order, so
 * re-downloading after more scans only appends new rows.
 */
export function buildCsv(entries: CollectionEntry[]): string {
  const seen = new Set<number>();
  const rows: string[] = [CSV_HEADER];
  for (const entry of entries) {
    const id = entry.tmdbId;
    if (!Number.isInteger(id) || id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push(String(id));
  }
  // Trailing newline: many importers, Letterboxd included, expect one.
  return `${rows.join("\n")}\n`;
}

export function csvFileName(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}`;
  return `letterboxd-discs-${stamp}.csv`;
}

/** Trigger a file download in the browser. */
export function downloadCsv(entries: CollectionEntry[]): void {
  const blob = new Blob([buildCsv(entries)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = csvFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}