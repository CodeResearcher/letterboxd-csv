import { describe, expect, it, vi, afterEach } from "vitest";
import worker, { ALLOWED_HOSTS, resolveTarget } from "./index";

/**
 * The Worker is a small SSRF surface: it fetches a URL supplied by the caller.
 * These tests pin the two properties that keep it safe to leave public — the
 * host allowlist and the refusal to forward caller headers — plus the CORS
 * headers the PWA depends on to read the response at all.
 */

const PROXY_ORIGIN = "https://letterboxd-csv-proxy.example.workers.dev";

function proxyRequest(target: string): Request {
  return new Request(`${PROXY_ORIGIN}/?url=${encodeURIComponent(target)}`);
}

/** Stub `fetch` and hand back the captured upstream call. */
function stubUpstream(response: Response) {
  const spy = vi.fn(async () => response);
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("host allowlist", () => {
  it("allows the barcode databases that need a proxy", () => {
    expect(resolveTarget("https://api.upcdatabase.org/product/123")?.hostname).toBe(
      "api.upcdatabase.org",
    );
    expect(resolveTarget("https://api.upcitemdb.com/prod/trial/lookup?upc=123")?.hostname).toBe(
      "api.upcitemdb.com",
    );
  });

  it("rejects hosts outside the allowlist", () => {
    expect(resolveTarget("https://evil.example/steal")).toBeNull();
    expect(resolveTarget("https://api.upcdatabase.org.evil.example/")).toBeNull();
  });

  it("rejects non-http protocols, relative paths, and junk", () => {
    expect(resolveTarget("file:///etc/passwd")).toBeNull();
    expect(resolveTarget("http://169.254.169.254/latest/meta-data/")).toBeNull();
    expect(resolveTarget("/relative/path")).toBeNull();
    expect(resolveTarget("not a url")).toBeNull();
    expect(resolveTarget(null)).toBeNull();
    expect(resolveTarget("")).toBeNull();
  });
});

describe("fetch handler", () => {
  it("answers preflight and advertises permissive CORS", async () => {
    const response = await worker.fetch(new Request(PROXY_ORIGIN, { method: "OPTIONS" }));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("rejects a missing or disallowed url with a JSON 400", async () => {
    const missing = await worker.fetch(new Request(PROXY_ORIGIN));
    expect(missing.status).toBe(400);
    expect(missing.headers.get("access-control-allow-origin")).toBe("*");
    expect(await missing.json()).toMatchObject({ error: expect.stringContaining("disallowed") });

    const disallowed = await worker.fetch(proxyRequest("https://evil.example/"));
    expect(disallowed.status).toBe(400);
  });

  it("rejects methods other than GET", async () => {
    const response = await worker.fetch(
      new Request(PROXY_ORIGIN, { method: "POST", body: "x" }),
    );
    expect(response.status).toBe(405);
  });

  it("passes the upstream body and status through with CORS headers", async () => {
    stubUpstream(
      new Response(JSON.stringify({ items: [{ title: "The Matrix" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await worker.fetch(
      proxyRequest("https://api.upcitemdb.com/prod/trial/lookup?upc=883929264483"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ items: [{ title: "The Matrix" }] });
  });

  it("preserves an upstream error status rather than masking it as 200", async () => {
    stubUpstream(new Response('{"error":"rate limited"}', { status: 429 }));

    const response = await worker.fetch(
      proxyRequest("https://api.upcitemdb.com/prod/trial/lookup?upc=1"),
    );

    expect(response.status).toBe(429);
  });

  it("does not forward caller headers upstream", async () => {
    const spy = stubUpstream(new Response("{}", { status: 200 }));

    await worker.fetch(
      new Request(`${PROXY_ORIGIN}/?url=${encodeURIComponent("https://api.upcitemdb.com/x")}`, {
        headers: { authorization: "Bearer SECRET", "x-api-key": "SECRET" },
      }),
    );

    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    const forwarded = JSON.stringify(init.headers ?? {});
    expect(forwarded).not.toContain("SECRET");
    expect(forwarded.toLowerCase()).not.toContain("authorization");
  });

  it("returns a 504 when the upstream fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const response = await worker.fetch(proxyRequest("https://api.upcitemdb.com/x"));
    expect(response.status).toBe(504);
  });

  it("keeps the allowlist to exactly the two proxied databases", () => {
    expect([...ALLOWED_HOSTS].sort()).toEqual(["api.upcdatabase.org", "api.upcitemdb.com"]);
  });
});
