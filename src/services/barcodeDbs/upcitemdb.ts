import { fetchJson, str } from "./http";
import type { BarcodeProvider, ProviderLookupResult } from "./types";

/**
 * UPCitemdb - last-resort fallback.
 *
 * API: GET https://api.upcitemdb.com/prod/trial/lookup?upc=<code>
 * The trial path needs no key, which makes it the one provider that works out
 * of the box, but it is capped at 100 requests per day per IP. A paid key
 * switches to the authenticated endpoint, so the credential field is optional.
 *
 * The API only allows the origin https://www.upcitemdb.com, so browser calls
 * fail without a proxy.
 */
const TRIAL_BASE = "https://api.upcitemdb.com/prod/trial/lookup";
const PAID_BASE = "https://api.upcitemdb.com/prod/v1/lookup";

export const upcitemdbProvider: BarcodeProvider = {
  id: "upcitemdb",
  label: "UPCitemdb",
  credentialFields: [
    {
      key: "apiKey",
      label: "API key",
      required: false,
      secret: true,
      placeholder: "Paid plan key",
    },
  ],
  async lookup({ code, credentials, signal, proxyBaseUrl }): Promise<ProviderLookupResult> {
    const apiKey = credentials.apiKey?.trim();
    const base = apiKey ? PAID_BASE : TRIAL_BASE;
    const url = `${base}?upc=${encodeURIComponent(code.ean13)}`;
    const response = await fetchJson({
      url,
      headers: apiKey ? { user_key: apiKey, key_type: "3scale" } : undefined,
      signal,
      proxyBaseUrl,
      requiresProxy: true,
      apiId: "upcitemdb",
    });
    if (!response.ok) return response.error;

    const data = response.data;
    if (typeof data !== "object" || data === null) {
      return { status: "error", kind: "unknown", message: "Unexpected response body." };
    }
    const record = data as Record<string, unknown>;
    const code_ = str(record, "code");
    if (code_ && code_ !== "OK") {
      if (/TOO_FAST|EXCEEDED|LIMIT/i.test(code_)) {
        return { status: "error", kind: "rate_limit", message: str(record, "message") ?? code_ };
      }
      if (/INVALID|UNAUTHORIZED|AUTH/i.test(code_)) {
        return { status: "error", kind: "auth", message: str(record, "message") ?? code_ };
      }
      return { status: "error", kind: "unknown", message: str(record, "message") ?? code_ };
    }

    const items = Array.isArray(record.items) ? record.items : [];
    const first = items.find((item) => item && typeof item === "object") as
      | Record<string, unknown>
      | undefined;
    const title = str(first, "title", "description");
    if (!title) return { status: "not_found" };
    return { status: "found", title, raw: first };
  },
};