import { fetchJson, str } from "./http";
import type { BarcodeProvider, ProviderLookupResult } from "./types";

/**
 * EANdata - general EAN/UPC product feed.
 *
 * API: GET https://eandata.com/feed/?v=3&keycode=<key>&mode=json&find=<code>
 * Responds 200 with `status.code` "200" for a hit and "500" for errors such as
 * an invalid key or an invalid check digit. The free feed allows 15 lookups per
 * day, so it sits late in the default order.
 */
const API_BASE = "https://eandata.com/feed/";

export const eandataProvider: BarcodeProvider = {
  id: "eandata",
  label: "EANdata",
  credentialFields: [
    { key: "apiKey", label: "API key", required: true, secret: true, placeholder: "keycode" },
  ],
  async lookup({ code, credentials, signal }): Promise<ProviderLookupResult> {
    const params = new URLSearchParams({
      v: "3",
      keycode: credentials.apiKey?.trim() ?? "",
      mode: "json",
      find: code.ean13,
    });
    const response = await fetchJson({
      url: `${API_BASE}?${params.toString()}`,
      signal,
      apiId: "eandata",
    });
    if (!response.ok) return response.error;

    const data = response.data;
    if (typeof data !== "object" || data === null) {
      return { status: "error", kind: "unknown", message: "Unexpected response body." };
    }
    const record = data as Record<string, unknown>;
    const status = record.status as Record<string, unknown> | undefined;
    const statusCode = str(status, "code") ?? "";
    const message = str(status, "message") ?? "";

    if (statusCode !== "200") {
      if (/invalid key|inactive feed/i.test(message)) {
        return { status: "error", kind: "auth", message };
      }
      if (/limit|quota|free/i.test(message)) {
        return { status: "error", kind: "rate_limit", message };
      }
      if (/not found|no product/i.test(message)) return { status: "not_found" };
      return { status: "error", kind: "unknown", message: message || `Feed error ${statusCode}` };
    }

    const product = record.product as Record<string, unknown> | undefined;
    const attributes = product?.attributes as Record<string, unknown> | undefined;
    const title = str(attributes, "product", "name", "title");
    if (!title) return { status: "not_found" };
    return { status: "found", title, raw: product ?? record };
  },
};