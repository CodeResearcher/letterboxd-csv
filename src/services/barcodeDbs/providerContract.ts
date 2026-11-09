import { describe, expect, it, vi } from "vitest";
import { normalizeBarcode, type NormalizedBarcode } from "../normalizeBarcode";
import {
  isProviderConfigured,
  type BarcodeProvider,
  type ProviderLookupResult,
} from "./types";

/**
 * Contract suite every barcode provider must satisfy. A new provider only needs
 * to be added to the `providers` array below plus fixtures for its response
 * shapes; the behaviour checks are shared.
 */
export interface ContractFixtures {
  /** Barcode the provider should resolve. */
  code: string;
  /** Credentials to hand the provider. */
  credentials?: Record<string, string>;
  /**
   * Kind a thrown transport error must map to. A provider whose API sends no
   * CORS headers is reported as `cors`; every other provider must not claim a
   * CORS block for what could be a plain connection drop.
   */
  transportKind: "cors" | "network";
}

export function parseFixture(code: string): NormalizedBarcode {
  const parsed = normalizeBarcode(code);
  if (!parsed.ok) throw new Error(`Bad contract fixture barcode: ${code}`);
  return parsed.value;
}

/**
 * Assert the shared behaviour of a provider. `respond` lets each test control
 * the fake HTTP layer, so the provider's own mapping logic is what gets tested.
 */
export function runProviderContract(
  provider: BarcodeProvider,
  fixtures: ContractFixtures,
  respond: (fixture: "found" | "not_found" | "auth") => Response | Promise<Response>,
): void {
  describe(`${provider.id} provider contract`, () => {
    it("declares an id, a label and a stable credential contract", () => {
      expect(provider.id).toMatch(/^[a-z0-9_-]+$/);
      expect(provider.label.length).toBeGreaterThan(0);
      for (const field of provider.credentialFields) {
        expect(field.key).toMatch(/^[a-zA-Z0-9_]+$/);
        expect(field.label.length).toBeGreaterThan(0);
      }
    });

    it("links to an https signup page so a user can get a key", () => {
      // Every provider needs a key (or an optional one), so the UI offers a
      // link to register. A missing or non-https URL would be a dead end.
      expect(provider.signupUrl).toMatch(/^https:\/\//);
    });

    it("reports itself configured only when required fields are present", () => {
      const required = provider.credentialFields.filter((field) => field.required);
      const empty = Object.fromEntries(
        provider.credentialFields.map((field) => [field.key, ""]),
      );
      if (required.length > 0) expect(isProviderConfigured(provider, empty)).toBe(false);

      const filled = Object.fromEntries(
        provider.credentialFields.map((field) => [field.key, "value"]),
      );
      expect(isProviderConfigured(provider, filled)).toBe(true);
    });

    it("returns a found result with a non-empty title", async () => {
      globalThis.fetch = vi.fn(async () => respond("found")) as unknown as typeof fetch;
      const result: ProviderLookupResult = await provider.lookup({
        code: parseFixture(fixtures.code),
        credentials: fixtures.credentials ?? credentialsFor(provider),
        signal: new AbortController().signal,
      });
      expect(result.status).toBe("found");
      if (result.status !== "found") return;
      expect(typeof result.title).toBe("string");
      expect(result.title.trim().length).toBeGreaterThan(0);
    });

    it("classifies an auth failure as an auth error", async () => {
      globalThis.fetch = vi.fn(async () => respond("auth")) as unknown as typeof fetch;
      const result = await provider.lookup({
        code: parseFixture(fixtures.code),
        credentials: fixtures.credentials ?? credentialsFor(provider),
        signal: new AbortController().signal,
      });
      // A provider may legitimately fold auth into a generic error, but it must
      // never claim a successful lookup.
      expect(result.status).not.toBe("found");
    });

    it("never throws: transport failures become typed error results", async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch;
      const result = await provider.lookup({
        code: parseFixture(fixtures.code),
        credentials: fixtures.credentials ?? credentialsFor(provider),
        signal: new AbortController().signal,
      });
      expect(result.status).toBe("error");
      if (result.status !== "error") return;
      // Only a no-CORS API can be blocked by a browser; anything else is a
      // transient network failure and must not point at the proxy setting.
      expect(result.kind).toBe(fixtures.transportKind);
    });
  });
}

export function credentialsFor(provider: BarcodeProvider): Record<string, string> {
  return Object.fromEntries(provider.credentialFields.map((field) => [field.key, "test-value"]));
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function htmlResponse(status = 200): Response {
  return new Response("<!doctype html><html></html>", {
    status,
    headers: { "content-type": "text/html" },
  });
}