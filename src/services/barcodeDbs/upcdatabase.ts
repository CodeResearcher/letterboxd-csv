import { fetchJson, str } from "./http";
import type { BarcodeProvider, ProviderLookupResult } from "./types";

/**
 * UPC Database (upcdatabase.org) - general product database.
 *
 * API: GET https://api.upcdatabase.org/product/{code}
 *      Authorization: Bearer <token>   (or ?apikey=)
 * The API does not send CORS headers, so browser calls fail without a proxy.
 * It also answers HTTP 200 for auth and not-found errors, so the body is the
 * only source of truth.
 */
const API_BASE = "https://api.upcdatabase.org/product";

export const upcdatabaseProvider: BarcodeProvider = {
  id: "upcdatabase",
  label: "UPC Database",
  note: "General product catalog. Needs a CORS proxy for browser use.",
  requiresProxy: true,
  credentialFields: [
    { key: "apiKey", label: "API key", required: true, secret: true, placeholder: "Bearer token" },
  ],
  async lookup({ code, credentials, signal, proxyBaseUrl }): Promise<ProviderLookupResult> {
    const url = `${API_BASE}/${encodeURIComponent(code.upca ?? code.ean13)}`;
    const response = await fetchJson({
      url,
      headers: { Authorization: `Bearer ${credentials.apiKey?.trim() ?? ""}` },
      signal,
      proxyBaseUrl,
    });
    if (!response.ok) {
      if (!proxyBaseUrl && response.error.kind === "cors") return response.error;
      return response.error;
    }

    const data = response.data;
    if (typeof data !== "object" || data === null) {
      return { status: "error", kind: "unknown", message: "Unexpected response body." };
    }
    const record = data as Record<string, unknown>;

    if (record.success === false || record.success === "false") {
      const error = record.error as Record<string, unknown> | undefined;
      const code_ = Number(str(error, "code") ?? NaN);
      const message = str(error, "message") ?? "";
      if (code_ === 404) return { status: "not_found" };
      if (/api key is invalid/i.test(message)) {
        return { status: "error", kind: "auth", message };
      }
      if (/limit|exceeded|too many/i.test(message)) {
        return { status: "error", kind: "rate_limit", message };
      }
      return { status: "error", kind: "unknown", message: message || "Lookup failed." };
    }

    const title = str(record, "title", "alias");
    if (!title) return { status: "not_found" };
    return { status: "found", title, raw: record };
  },
};