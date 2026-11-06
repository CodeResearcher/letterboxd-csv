import { describe, expect, it, vi } from "vitest";
import { posterUrl, searchTmdb } from "./tmdb";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("searchTmdb", () => {
  it("fails clearly when no API key is configured", async () => {
    const result = await searchTmdb("The Matrix", { apiKey: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/VITE_TMDB_API_KEY/);
  });

  it("normalizes movies and TV the same way, ignoring media_type", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({
        results: [
          {
            id: 603,
            media_type: "movie",
            title: "The Matrix",
            release_date: "1999-03-31",
            poster_path: "/matrix.jpg",
            overview: "Hacker.",
          },
          {
            id: 1399,
            media_type: "tv",
            name: "Game of Thrones",
            first_air_date: "2011-04-17",
            poster_path: "/got.jpg",
            overview: "Thrones.",
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await searchTmdb("matrix", { apiKey: "key" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Both kinds survive: no filtering on media_type.
    expect(result.results).toEqual([
      {
        id: 603,
        title: "The Matrix",
        year: 1999,
        posterPath: "/matrix.jpg",
        overview: "Hacker.",
      },
      {
        id: 1399,
        title: "Game of Thrones",
        year: 2011,
        posterPath: "/got.jpg",
        overview: "Thrones.",
      },
    ]);
  });

  it("keeps results that have no year or poster", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({ results: [{ id: 7, title: "Untitled", release_date: "", poster_path: null }] }),
    ) as unknown as typeof fetch;
    const result = await searchTmdb("x", { apiKey: "key" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results[0]).toMatchObject({ id: 7, title: "Untitled", year: null, posterPath: null });
  });

  it("skips results with no usable title", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({ results: [{ id: 1 }, { id: 2, title: "Real" }] }),
    ) as unknown as typeof fetch;
    const result = await searchTmdb("x", { apiKey: "key" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results.map((item) => item.id)).toEqual([2]);
  });

  it("sends the query and adult filter", async () => {
    const spy = vi.fn(async () => json({ results: [] }));
    globalThis.fetch = spy as unknown as typeof fetch;
    await searchTmdb("  Heat  ", { apiKey: "key" });
    const [url] = spy.mock.calls[0] as unknown as [string];
    expect(url).toContain("/3/search/multi");
    expect(url).toContain("query=Heat");
    expect(url).toContain("include_adult=false");
  });

  it("returns an empty list for a blank query without calling the API", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const result = await searchTmdb("   ", { apiKey: "key" });
    expect(result).toEqual({ ok: true, results: [] });
    expect(spy).not.toHaveBeenCalled();
  });

  it("explains an invalid key", async () => {
    globalThis.fetch = vi.fn(async () => json({}, 401)) as unknown as typeof fetch;
    const result = await searchTmdb("x", { apiKey: "bad" });
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.error).toMatch(/rejected the API key/i);
  });

  it("explains rate limiting", async () => {
    globalThis.fetch = vi.fn(async () => json({}, 429)) as unknown as typeof fetch;
    const result = await searchTmdb("x", { apiKey: "key" });
    if (result.ok) return;
    expect(result.error).toMatch(/rate limiting/i);
  });

  it("handles a non-JSON body without throwing", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("<html>", { status: 200 }),
    ) as unknown as typeof fetch;
    expect(await searchTmdb("x", { apiKey: "key" })).toEqual({ ok: true, results: [] });
  });
});

describe("posterUrl", () => {
  it("builds an image URL from a path", () => {
    expect(posterUrl("/abc.jpg")).toBe("https://image.tmdb.org/t/p/w342/abc.jpg");
    expect(posterUrl("/abc.jpg", "w200")).toBe("https://image.tmdb.org/t/p/w200/abc.jpg");
  });

  it("returns null without a path and passes absolute URLs through", () => {
    expect(posterUrl(null)).toBeNull();
    expect(posterUrl("https://example.com/x.jpg")).toBe("https://example.com/x.jpg");
  });
});