import { describe, expect, it } from "vitest";
import type { CollectionEntry } from "../store/types";
import { buildCsv, csvFileName, escapeCsvField, CSV_HEADER } from "./letterboxdCsv";

function entry(tmdbId: number, title = "Some Film", barcode = "883929264483"): CollectionEntry {
  return {
    id: `entry-${tmdbId}`,
    barcode,
    rawTitle: `${title} (Blu-ray)`,
    tmdbId,
    title,
    year: 1999,
    posterPath: "/poster.jpg",
    providerId: "upcmdb",
    addedAt: 1_700_000_000_000,
  };
}

describe("buildCsv", () => {
  it("emits a single tmdbID column with a header", () => {
    expect(buildCsv([entry(603)])).toBe(`${CSV_HEADER}\n603\n`);
  });

  it("writes one row per entry in insertion order", () => {
    const csv = buildCsv([entry(603), entry(604), entry(605)]);
    expect(csv).toBe("tmdbID\n603\n604\n605\n");
  });

  it("deduplicates repeated ids", () => {
    const csv = buildCsv([entry(603), entry(603)]);
    expect(csv).toBe("tmdbID\n603\n");
  });

  it("skips entries without a usable id", () => {
    const csv = buildCsv([entry(0), entry(-1), entry(603)]);
    expect(csv).toBe("tmdbID\n603\n");
  });

  it("produces just a header for an empty collection", () => {
    expect(buildCsv([])).toBe("tmdbID\n");
  });

  it("never leaks titles, years, or barcodes into the CSV", () => {
    const csv = buildCsv([entry(603, "The Matrix", "883929264483")]);
    expect(csv).not.toContain("The Matrix");
    expect(csv).not.toContain("1999");
    expect(csv).not.toContain("883929264483");
  });
});

describe("escapeCsvField", () => {
  it("leaves plain values alone", () => {
    expect(escapeCsvField("603")).toBe("603");
  });

  it("quotes values containing commas, quotes or newlines", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField("line\nbreak")).toBe('"line\nbreak"');
  });

  it("quotes values with leading or trailing whitespace", () => {
    expect(escapeCsvField(" padded ")).toBe('" padded "');
  });
});

describe("csvFileName", () => {
  it("stamps the date and time", () => {
    const name = csvFileName(new Date(2026, 10, 6, 19, 4));
    expect(name).toBe("letterboxd-discs-2026-11-06-1904.csv");
  });
});