import { fetchJson, str } from "./http";
import type { BarcodeProvider, ProviderLookupResult } from "./types";

/**
 * UPCMDB - a physical-media database with IMDb IDs, formats and editions.
 * Highest-value source for discs, so it is first in the default order.
 *
 * API: GET {base}/v1/lookup/{upc} with an `x-api-key` header.
 * The public site path (`upcmdb.com/api`) serves the SPA shell; the API itself
 * lives on the Cloud Functions host below.
 */
const API_BASE = "https://us-central1-upcmdb-cbae5.cloudfunctions.net/api";

function pickRecord(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const first = data.find((item) => item && typeof item === "object");
    return (first as Record<string, unknown> | undefined) ?? null;
  }
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return null;
}

export const upcmdbProvider: BarcodeProvider = {
  id: "upcmdb",
  label: "UPCMDB",
  note: "Movie database with IMDb IDs, formats and editions.",
  credentialFields: [
    { key: "apiKey", label: "API key", required: true, secret: true, placeholder: "x-api-key" },
  ],
  async lookup({ code, credentials, signal }): Promise<ProviderLookupResult> {
    const url = `${API_BASE}/v1/lookup/${encodeURIComponent(code.upca ?? code.ean13)}`;
    const response = await fetchJson({
      url,
      headers: { "x-api-key": credentials.apiKey?.trim() ?? "" },
      signal,
    });
    if (!response.ok) {
      // upcmdb answers 404 with a JSON body when it simply has no record.
      if (response.error.message === "HTTP 404") return { status: "not_found" };
      return response.error;
    }
    const record = pickRecord(response.data);
    const title = str(record, "title", "productName", "name");
    if (!title) return { status: "not_found" };
    return { status: "found", title, raw: record };
  },
};