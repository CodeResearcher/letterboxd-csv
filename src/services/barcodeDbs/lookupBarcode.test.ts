import { describe, expect, it, vi } from "vitest";
import { lookupBarcode, type OrchestratorSettings } from "./lookupBarcode";
import { normalizeBarcode } from "../normalizeBarcode";
import type { BarcodeProvider, ProviderLookupResult } from "./types";

const CODE = (() => {
  const parsed = normalizeBarcode("883929264483");
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
})();

const baseSettings: OrchestratorSettings = {
  order: ["a", "b", "c"],
  enabled: {},
  credentials: { a: { key: "x" }, b: { key: "x" }, c: { key: "x" } },
};

function provider(
  id: string,
  result: ProviderLookupResult | (() => Promise<ProviderLookupResult>),
  overrides: Partial<BarcodeProvider> = {},
): BarcodeProvider {
  return {
    id,
    label: id.toUpperCase(),
    credentialFields: [{ key: "key", label: "Key", required: true }],
    lookup: typeof result === "function" ? async () => result() : async () => result,
    ...overrides,
  };
}

const found = (title: string): ProviderLookupResult => ({ status: "found", title });
const miss: ProviderLookupResult = { status: "not_found" };

describe("lookupBarcode", () => {
  it("returns the first hit and never calls later providers", async () => {
    const calls: string[] = [];
    const a = provider("a", miss);
    const b = provider("b", () => {
      calls.push("b");
      return Promise.resolve(found("The Matrix"));
    });
    const c = provider("c", () => {
      calls.push("c");
      return Promise.resolve(found("Wrong"));
    });

    const outcome = await lookupBarcode({
      providers: [a, b, c],
      settings: baseSettings,
      code: CODE,
    });

    expect(outcome.status).toBe("found");
    if (outcome.status !== "found") return;
    expect(outcome.title).toBe("The Matrix");
    expect(outcome.providerId).toBe("b");
    expect(calls).toEqual(["b"]);
    // The failed attempt is still reported for diagnostics.
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0].kind).toBe("not_found");
  });

  it("falls through on errors and keeps trying", async () => {
    const outcome = await lookupBarcode({
      providers: [
        provider("a", { status: "error", kind: "auth", message: "bad key" }),
        provider("b", { status: "error", kind: "network", message: "offline" }),
        provider("c", found("Heat")),
      ],
      settings: baseSettings,
      code: CODE,
    });
    expect(outcome).toMatchObject({ status: "found", title: "Heat", providerId: "c" });
    if (outcome.status !== "found") return;
    expect(outcome.failures.map((failure) => failure.kind)).toEqual(["auth", "network"]);
  });

  it("skips disabled providers", async () => {
    const bLookup = vi.fn(async () => found("Should not run"));
    const outcome = await lookupBarcode({
      providers: [provider("a", found("The Matrix")), provider("b", () => bLookup())],
      settings: { ...baseSettings, enabled: { b: false } },
      code: CODE,
    });
    expect(outcome).toMatchObject({ status: "found", providerId: "a" });
    expect(bLookup).not.toHaveBeenCalled();
  });

  it("skips providers missing a required credential", async () => {
    const outcome = await lookupBarcode({
      providers: [provider("a", found("nope"))],
      settings: { ...baseSettings, credentials: { a: {} } },
      code: CODE,
    });
    expect(outcome.status).toBe("no_providers");
  });

  it("skips providers that do not support the code", async () => {
    const outcome = await lookupBarcode({
      providers: [
        provider("a", found("nope"), { supports: () => false }),
        provider("b", found("The Matrix")),
      ],
      settings: baseSettings,
      code: CODE,
    });
    expect(outcome).toMatchObject({ status: "found", providerId: "b" });
  });

  it("honours rate-limit cooldowns", async () => {
    const aLookup = vi.fn(async () => found("Should not run"));
    const outcome = await lookupBarcode({
      providers: [provider("a", () => aLookup()), provider("b", miss)],
      settings: baseSettings,
      code: CODE,
      cooldowns: { a: Date.now() + 60_000 },
    });
    expect(aLookup).not.toHaveBeenCalled();
    expect(outcome.status).toBe("not_found");
    expect(outcome.failures[0]).toMatchObject({ providerId: "a", kind: "rate_limit" });
  });

  it("starts a cooldown when a provider reports a rate limit", async () => {
    const onRateLimited = vi.fn();
    await lookupBarcode({
      providers: [
        provider("a", { status: "error", kind: "rate_limit", message: "slow down" }),
        provider("b", found("Heat")),
      ],
      settings: baseSettings,
      code: CODE,
      onRateLimited,
    });
    expect(onRateLimited).toHaveBeenCalledWith("a");
  });

  it("aggregates every failure when nothing is found", async () => {
    const outcome = await lookupBarcode({
      providers: [provider("a", miss), provider("b", { status: "error", kind: "cors", message: "blocked" })],
      settings: baseSettings,
      code: CODE,
    });
    expect(outcome.status).toBe("not_found");
    expect(outcome.failures).toHaveLength(2);
  });

  it("reports no_providers when nothing was even attempted", async () => {
    const outcome = await lookupBarcode({
      providers: [provider("a", found("x"))],
      settings: { ...baseSettings, enabled: { a: false } },
      code: CODE,
    });
    expect(outcome.status).toBe("no_providers");
  });

  it("turns a thrown error into a failure instead of rejecting", async () => {
    const outcome = await lookupBarcode({
      providers: [
        provider("a", () => {
          throw new Error("boom");
        }),
        provider("b", found("Heat")),
      ],
      settings: baseSettings,
      code: CODE,
    });
    expect(outcome).toMatchObject({ status: "found", title: "Heat" });
    if (outcome.status !== "found") return;
    expect(outcome.failures[0]).toMatchObject({ kind: "unknown", message: "boom" });
  });

  it("aborts a provider that hangs", async () => {
    const hanging = provider("a", () => new Promise<ProviderLookupResult>(() => undefined));
    const outcome = await lookupBarcode({
      providers: [hanging, provider("b", found("Heat"))],
      settings: baseSettings,
      code: CODE,
      timeoutMs: 20,
    });
    expect(outcome).toMatchObject({ status: "found", title: "Heat" });
    if (outcome.status !== "found") return;
    expect(outcome.failures[0].providerId).toBe("a");
  });
});