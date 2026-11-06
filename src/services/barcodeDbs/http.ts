import type { LookupFailureKind, ProviderLookupResult } from "./types";

/**
 * Shared HTTP plumbing for providers. Everything funnels through here so the
 * orchestrator only ever sees the three-armed ProviderLookupResult.
 */

export class ProviderHttpError extends Error {
  constructor(
    readonly kind: LookupFailureKind,
    message: string,
  ) {
    super(message);
  }
}

/** A network-level failure almost always means the API refused a browser origin. */
function classifyNetworkError(error: unknown): ProviderHttpError {
  if (error instanceof ProviderHttpError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ProviderHttpError("network", "Request timed out.");
  }
  // Browsers report CORS rejection as an opaque TypeError.
  if (error instanceof TypeError) {
    return new ProviderHttpError(
      "cors",
      "Network request failed. The provider probably blocks browsers (CORS) or the connection dropped.",
    );
  }
  return new ProviderHttpError("unknown", error instanceof Error ? error.message : String(error));
}

export interface RequestOptions {
  url: string;
  headers?: Record<string, string>;
  signal: AbortSignal;
  /** When set, the request goes through the proxy instead of hitting the API directly. */
  proxyBaseUrl?: string;
  method?: "GET";
}

/**
 * CORS proxies take the target as a query parameter, e.g.
 * `https://proxy.example/?url=https%3A%2F%2Fapi...`. A trailing slash on the
 * configured base is dropped so the parameter is always the first one.
 */
function viaProxy(proxyBaseUrl: string, target: string): string {
  const base = proxyBaseUrl.trim().replace(/\/+$/, "");
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}url=${encodeURIComponent(target)}`;
}

/** Reject as soon as `signal` aborts, even if the provider ignores it. */
function withAbort<T>(promise: Promise<T>, signal: AbortSignal, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out.")), ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Request timed out."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export { viaProxy, withAbort };

/**
 * Perform a request and return parsed JSON, mapping every failure to a typed
 * ProviderLookupResult error. Non-JSON responses are treated as failures: each
 * of these APIs returns HTML error pages instead of JSON when it dislikes a key.
 */
export async function fetchJson(
  options: RequestOptions,
): Promise<{ ok: true; data: unknown; status: number } | { ok: false; error: Extract<ProviderLookupResult, { status: "error" }> }> {
  const target = options.proxyBaseUrl ? viaProxy(options.proxyBaseUrl, options.url) : options.url;
  let response: Response;
  try {
    response = await fetch(target, {
      method: options.method ?? "GET",
      headers: { Accept: "application/json", ...options.headers },
      signal: options.signal,
      // Providers set their own cookies on their origin; never send ours.
      credentials: "omit",
    });
  } catch (error) {
    const httpError = classifyNetworkError(error);
    return { ok: false, error: { status: "error", kind: httpError.kind, message: httpError.message } };
  }

  const text = await response.text().catch(() => "");
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error: { status: "error", kind: "auth", message: `HTTP ${response.status}` },
    };
  }
  if (response.status === 429) {
    return {
      ok: false,
      error: { status: "error", kind: "rate_limit", message: `HTTP ${response.status}` },
    };
  }
  if (!response.ok) {
    // 5xx and other transport-level failures.
    return {
      ok: false,
      error: {
        status: "error",
        kind: response.status >= 500 ? "unknown" : "network",
        message: `HTTP ${response.status}${data === null && text ? " (non-JSON response)" : ""}`,
      },
    };
  }
  if (data === null) {
    return {
      ok: false,
      error: {
        status: "error",
        kind: "cors",
        message: "The API returned HTML instead of JSON. It is probably blocking browsers.",
      },
    };
  }
  return { ok: true, data, status: response.status };
}

/** Pull a string field out of an unknown JSON object without `any`. */
export function str(source: unknown, ...keys: string[]): string | null {
  if (typeof source !== "object" || source === null) return null;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() && value !== "null") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}