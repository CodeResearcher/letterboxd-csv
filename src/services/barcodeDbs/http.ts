import { recordApiRequest } from "../../store/apiUsage";
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

/**
 * Classify a thrown `fetch` error.
 *
 * A browser reports a CORS rejection and a plain connection drop as the same
 * opaque `TypeError`, so the error itself cannot tell them apart. The provider's
 * own declaration can: only an API that sends no CORS headers *can* be blocked
 * by the browser, so an unflagged provider's failure is reported as a transient
 * network problem instead of sending the user to a proxy setting that is not the
 * fix. `requiresProxy` is set precisely on those two providers.
 */
function classifyNetworkError(error: unknown, providerRequiresProxy: boolean): ProviderHttpError {
  if (error instanceof ProviderHttpError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ProviderHttpError("network", "Request timed out.");
  }
  // Browsers report a CORS rejection as an opaque TypeError, indistinguishable
  // from many transient network failures.
  if (error instanceof TypeError) {
    if (providerRequiresProxy) {
      return new ProviderHttpError(
        "cors",
        "Network request failed. The provider probably blocks browsers (CORS) or the connection dropped.",
      );
    }
    return new ProviderHttpError(
      "network",
      "Network request failed. The connection dropped or the provider was unreachable.",
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
  /**
   * True when the provider's API sends no CORS headers, so a browser failure
   * can only be a CORS block. Set by the providers that need the proxy
   * (`upcdatabase`, `upcitemdb`); transport failures elsewhere are reported as
   * plain network problems.
   */
  requiresProxy?: boolean;
  method?: "GET";
  /**
   * Provider id to charge this request to in the usage counters. Omitted calls
   * are not counted, which keeps this layer usable for one-off requests.
   */
  apiId?: string;
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
  let startedAt = 0;
  /**
   * Count the request exactly once per attempt, with the time it took and
   * whether it succeeded. Auth and not-found answers are still billed by the
   * APIs, so only transport failures and error statuses count as errors.
   */
  let recorded = false;
  const charge = (ok: boolean) => {
    if (!options.apiId || recorded) return;
    recorded = true;
    recordApiRequest(options.apiId, { ok, durationMs: Date.now() - startedAt });
  };
  try {
    startedAt = Date.now();
    response = await fetch(target, {
      method: options.method ?? "GET",
      headers: { Accept: "application/json", ...options.headers },
      signal: options.signal,
      // Providers set their own cookies on their origin; never send ours.
      credentials: "omit",
    });
  } catch (error) {
    const httpError = classifyNetworkError(error, options.requiresProxy === true);
    charge(false);
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
    charge(false);
    return {
      ok: false,
      error: { status: "error", kind: "auth", message: `HTTP ${response.status}` },
    };
  }
  if (response.status === 429) {
    charge(false);
    return {
      ok: false,
      error: { status: "error", kind: "rate_limit", message: `HTTP ${response.status}` },
    };
  }
  if (!response.ok) {
    // 5xx and other transport-level failures.
    charge(false);
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
    charge(false);
    // A JSON API that answers 2xx with HTML is nearly always a browser block,
    // but only for providers that send no CORS headers.
    const blocked = options.requiresProxy === true;
    return {
      ok: false,
      error: {
        status: "error",
        kind: blocked ? "cors" : "network",
        message: blocked
          ? "The API returned HTML instead of JSON. It is probably blocking browsers."
          : "The API returned a non-JSON response.",
      },
    };
  }
  charge(true);
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