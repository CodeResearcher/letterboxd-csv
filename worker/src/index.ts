/**
 * CORS proxy for the barcode databases that refuse browser requests.
 *
 * UPCMDB and EANdata send CORS headers, so the PWA calls them directly.
 * UPC Database and UPCitemdb do not, which means a static page cannot read
 * their responses at all. This Worker sits in front of just those APIs, adds
 * permissive CORS headers, and returns the upstream body untouched.
 *
 * Request shape:  GET /?url=<encodeURIComponent(target url)>
 *
 * Two deliberate restrictions make this safe to leave running:
 *
 * 1. **Host allowlist.** Only the barcode-database hosts below can be reached.
 *    An open proxy is an abuse magnet and an SSRF vector; without the allowlist
 *    anyone could use this Worker to fetch arbitrary URLs on our account.
 * 2. **No request headers are forwarded.** The proxy is a pass-through for the
 *    URL only, so nothing a caller sends can be smuggled upstream. The upshot is
 *    that providers must carry their credential in the query string, which is
 *    exactly how `upcdatabase` is called (see src/services/barcodeDbs).
 */

/** Upstream APIs this proxy is willing to reach. Exported for tests. */
export const ALLOWED_HOSTS = new Set([
  "api.upcdatabase.org", // UPC Database
  "api.upcitemdb.com", // UPCitemdb
]);

/** Give up before the client does; the app aborts around 12-15s. */
const UPSTREAM_TIMEOUT_MS = 8_000;

/** Headers every response carries so a browser can read it from any origin. */
const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "accept, content-type",
  // Proxied answers are live lookups; a cached title is worse than a round trip.
  "cache-control": "no-store",
};

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

/**
 * Resolve `?url=` to a target we are allowed to fetch. Rejects anything that is
 * not an absolute http(s) URL on the allowlist, so a crafted `file://`, a
 * relative path, or an internal address never reaches `fetch`.
 *
 * Exported so the allowlist can be tested directly.
 */
export function resolveTarget(rawUrl: string | null): URL | null {
  if (!rawUrl) return null;
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return null;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return null;
  if (!ALLOWED_HOSTS.has(target.hostname)) return null;
  return target;
}

export default {
  async fetch(request: Request): Promise<Response> {
    // Browsers preflight a cross-origin GET that sends an Accept header, so
    // answer OPTIONS locally instead of letting it 404 upstream.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "GET") {
      return jsonError(405, "Only GET is supported.");
    }

    const { searchParams } = new URL(request.url);
    const target = resolveTarget(searchParams.get("url"));
    if (!target) {
      return jsonError(
        400,
        "Missing or disallowed ?url=. Only the supported barcode-database hosts can be proxied.",
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const upstream = await fetch(target, {
        method: "GET",
        // No caller headers are forwarded, so request a JSON answer explicitly.
        headers: { Accept: "application/json" },
        signal: controller.signal,
        redirect: "follow",
      });

      // Stream the body through with its own status and content type. The
      // providers answer HTTP 200 even for auth and not-found failures, so the
      // app inspects the JSON body; nothing here needs to interpret it.
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...CORS_HEADERS,
          "content-type": upstream.headers.get("content-type") ?? "application/json",
        },
      });
    } catch {
      return jsonError(504, "The upstream barcode database did not respond in time.");
    } finally {
      clearTimeout(timer);
    }
  },
};
