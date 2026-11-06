import { describe, expect, it, vi } from "vitest";
import { jsonResponse, parseFixture, runProviderContract } from "./providerContract";
import { ALL_PROVIDERS, DEFAULT_PROVIDER_ORDER, orderedProviders } from "./registry";
import { upcmdbProvider } from "./upcmdb";
import { upcdatabaseProvider } from "./upcdatabase";
import { eandataProvider } from "./eandata";
import { upcitemdbProvider } from "./upcitemdb";
import type { BarcodeProvider } from "./types";

const CODE = "883929264483";
const credentials = { apiKey: "test-key" };

/**
 * Each provider gets the shared contract suite plus fixtures for its own
 * response shapes. Response bodies mirror the real APIs (captured live), so a
 * schema drift shows up as a test failure rather than a silent miss.
 */
const suites: Array<{
  provider: BarcodeProvider;
  payloads: { found: unknown; not_found?: unknown; auth?: unknown };
}> = [
  {
    provider: upcmdbProvider,
    payloads: {
      found: {
        title: "The Matrix",
        upc: "883929264483",
        ean: "0883929264483",
        year: "1999",
        format: "BLURAY",
        imdbID: "tt0133093",
      },
    },
  },
  {
    provider: upcdatabaseProvider,
    payloads: {
      found: { success: true, title: "The Matrix (Blu-ray)", barcode: "883929264483" },
      not_found: {
        success: false,
        error: { code: 404, message: "Not Found. No product could be found with that code." },
      },
      auth: {
        success: false,
        error: { message: "Your API Key is invalid. Please check the format." },
      },
    },
  },
  {
    provider: eandataProvider,
    payloads: {
      found: {
        status: { version: "3.4", code: "200", message: "free 0/15" },
        product: { attributes: { product: "The Matrix (Blu-ray)" }, EAN13: "0883929264483" },
      },
      not_found: {
        status: { version: "3.4", code: "200", message: "free 1/15" },
        product: { attributes: {} },
      },
      auth: {
        status: { version: "0.0", code: "500", message: "Invalid key code or inactive feed account" },
      },
    },
  },
  {
    provider: upcitemdbProvider,
    payloads: {
      found: {
        code: "OK",
        total: 1,
        items: [{ ean: "0883929264483", title: "The Matrix (Blu-ray)", upc: "883929264483" }],
      },
      not_found: { code: "OK", total: 0, items: [] },
      auth: { code: "UNAUTHORIZED", message: "Invalid user_key" },
    },
  },
];

for (const { provider, payloads } of suites) {
  runProviderContract(
    provider,
    { code: CODE, credentials },
    (fixture) => {
      if (fixture === "found") return jsonResponse(payloads.found);
      if (fixture === "auth") return jsonResponse(payloads.auth ?? { error: "Forbidden" }, 403);
      return jsonResponse(payloads.not_found ?? {});
    },
  );
}

describe("registry", () => {
  it("orders providers by the priority in AGENTS.md", () => {
    expect(DEFAULT_PROVIDER_ORDER).toEqual(["upcmdb", "upcdatabase", "eandata", "upcitemdb"]);
  });

  it("has unique ids", () => {
    const ids = ALL_PROVIDERS.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("appends newly registered providers after the saved order", () => {
    const order = orderedProviders(["eandata"]).map((provider) => provider.id);
    expect(order[0]).toBe("eandata");
    expect(order).toHaveLength(ALL_PROVIDERS.length);
  });

  it("drops unknown ids from a saved order", () => {
    const order = orderedProviders(["nope", "upcitemdb"]).map((provider) => provider.id);
    expect(order).not.toContain("nope");
    expect(order[0]).toBe("upcitemdb");
  });

  it("works with no saved order", () => {
    expect(orderedProviders(undefined).map((provider) => provider.id)).toEqual(
      DEFAULT_PROVIDER_ORDER,
    );
  });
});

describe("upcmdb provider mapping", () => {
  it("reads the title from a bare object and from a single-element array", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse([{ title: "The Matrix", upc: "883929264483" }]),
    ) as unknown as typeof fetch;
    const arrayResult = await upcmdbProvider.lookup({
      code: parseFixture(CODE),
      credentials,
      signal: new AbortController().signal,
    });
    expect(arrayResult).toMatchObject({ status: "found", title: "The Matrix" });

    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ title: "The Matrix", upc: "883929264483" }),
    ) as unknown as typeof fetch;
    const objectResult = await upcmdbProvider.lookup({
      code: parseFixture(CODE),
      credentials,
      signal: new AbortController().signal,
    });
    expect(objectResult).toMatchObject({ status: "found", title: "The Matrix" });
  });

  it("treats a 404 JSON body as not found", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: "Not Found", message: "No record found for UPC: 999" }, 404),
    ) as unknown as typeof fetch;
    const result = await upcmdbProvider.lookup({
      code: parseFixture(CODE),
      credentials,
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("not_found");
  });

  it("treats a 403 as an auth error", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: "Forbidden", message: "Invalid API key" }, 403),
    ) as unknown as typeof fetch;
    const result = await upcmdbProvider.lookup({
      code: parseFixture(CODE),
      credentials,
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({ status: "error", kind: "auth" });
  });
});

describe("upcdatabase provider mapping", () => {
  it("handles HTTP 200 bodies that mean failure", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ success: false, error: { code: 404, message: "Not Found." } }),
    ) as unknown as typeof fetch;
    expect(
      await upcdatabaseProvider.lookup({
        code: parseFixture(CODE),
        credentials,
        signal: new AbortController().signal,
      }),
    ).toEqual({ status: "not_found" });

    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ success: false, error: { message: "Your API Key is invalid." } }),
    ) as unknown as typeof fetch;
    expect(
      await upcdatabaseProvider.lookup({
        code: parseFixture(CODE),
        credentials,
        signal: new AbortController().signal,
      }),
    ).toMatchObject({ status: "error", kind: "auth" });
  });

  it("sends the bearer token and goes through the proxy when configured", async () => {
    const spy = vi.fn(async () => jsonResponse({ success: true, title: "The Matrix" }));
    globalThis.fetch = spy as unknown as typeof fetch;
    await upcdatabaseProvider.lookup({
      code: parseFixture(CODE),
      credentials,
      signal: new AbortController().signal,
      proxyBaseUrl: "https://proxy.example/",
    });
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      `https://proxy.example?url=${encodeURIComponent("https://api.upcdatabase.org/product/883929264483")}`,
    );
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  });
});

describe("eandata provider mapping", () => {
  it("maps an empty product to not found", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ status: { code: "200", message: "free 1/15" }, product: { attributes: {} } }),
    ) as unknown as typeof fetch;
    expect(
      await eandataProvider.lookup({
        code: parseFixture(CODE),
        credentials,
        signal: new AbortController().signal,
      }),
    ).toEqual({ status: "not_found" });
  });

  it("maps an invalid key to an auth error", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ status: { code: "500", message: "Invalid key code or inactive feed account" } }),
    ) as unknown as typeof fetch;
    expect(
      await eandataProvider.lookup({
        code: parseFixture(CODE),
        credentials,
        signal: new AbortController().signal,
      }),
    ).toMatchObject({ status: "error", kind: "auth" });
  });
});

describe("upcitemdb provider mapping", () => {
  it("uses the trial endpoint when no key is set", async () => {
    const spy = vi.fn(async () => jsonResponse({ code: "OK", items: [{ title: "The Matrix" }] }));
    globalThis.fetch = spy as unknown as typeof fetch;
    await upcitemdbProvider.lookup({
      code: parseFixture(CODE),
      credentials: {},
      signal: new AbortController().signal,
    });
    const [url] = spy.mock.calls[0] as unknown as [string];
    expect(url).toContain("/prod/trial/lookup");
  });

  it("uses the paid endpoint when a key is set", async () => {
    const spy = vi.fn(async () => jsonResponse({ code: "OK", items: [{ title: "The Matrix" }] }));
    globalThis.fetch = spy as unknown as typeof fetch;
    await upcitemdbProvider.lookup({
      code: parseFixture(CODE),
      credentials,
      signal: new AbortController().signal,
    });
    const [url] = spy.mock.calls[0] as unknown as [string];
    expect(url).toContain("/prod/v1/lookup");
  });

  it("maps a rate-limit code", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ code: "TOO_FAST", message: "Please slow down" }),
    ) as unknown as typeof fetch;
    expect(
      await upcitemdbProvider.lookup({
        code: parseFixture(CODE),
        credentials,
        signal: new AbortController().signal,
      }),
    ).toMatchObject({ status: "error", kind: "rate_limit" });
  });

  it("maps an empty items array to not found", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ code: "OK", total: 0, items: [] })) as unknown as typeof fetch;
    expect(
      await upcitemdbProvider.lookup({
        code: parseFixture(CODE),
        credentials,
        signal: new AbortController().signal,
      }),
    ).toEqual({ status: "not_found" });
  });
});