import type { NormalizedBarcode } from "../normalizeBarcode";
import { withAbort } from "./http";
import {
  isProviderConfigured,
  type BarcodeProvider,
  type ProviderLookupResult,
} from "./types";

export interface OrchestratorSettings {
  /** Provider ids in priority order. */
  order: string[];
  enabled: Record<string, boolean>;
  credentials: Record<string, Record<string, string>>;
  proxyBaseUrl?: string;
}

export interface AttemptFailure {
  providerId: string;
  label: string;
  kind: string;
  message: string;
}

export type LookupOutcome =
  | {
      status: "found";
      title: string;
      providerId: string;
      providerLabel: string;
      raw?: unknown;
      /** Providers that were tried and failed before this one succeeded. */
      failures: AttemptFailure[];
    }
  | { status: "not_found"; failures: AttemptFailure[] }
  | { status: "no_providers"; failures: AttemptFailure[] };

export interface OrchestratorOptions {
  providers: BarcodeProvider[];
  settings: OrchestratorSettings;
  code: NormalizedBarcode;
  timeoutMs?: number;
  /** Rate-limited providers are skipped until their cooldown expires. */
  now?: () => number;
  /** Called whenever a provider is rate limited, so the caller can persist it. */
  onRateLimited?: (providerId: string) => void;
  cooldowns?: Record<string, number>;
}

const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * Try providers strictly in order, stopping at the first hit.
 *
 * Stopping early is a deliberate quota decision: three of these APIs have daily
 * caps, and a hit from a higher-priority provider means a lower one never needs
 * to be called.
 */
export async function lookupBarcode(options: OrchestratorOptions): Promise<LookupOutcome> {
  const {
    providers,
    settings,
    code,
timeoutMs = DEFAULT_TIMEOUT_MS,
  now = Date.now,
  onRateLimited,
    cooldowns = {},
  } = options;

  const failures: AttemptFailure[] = [];
  let attempted = 0;

  for (const provider of providers) {
    if (settings.enabled[provider.id] === false) continue;

    const credentials = settings.credentials[provider.id] ?? {};
    if (!isProviderConfigured(provider, credentials)) continue;
    if (provider.supports && !provider.supports(code)) continue;

    const cooldownUntil = cooldowns[provider.id] ?? 0;
    if (cooldownUntil > now()) {
      failures.push({
        providerId: provider.id,
        label: provider.label,
        kind: "rate_limit",
        message: "Skipped: cooling down after a rate limit.",
      });
      continue;
    }

    attempted += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let result: ProviderLookupResult;
    try {
      // A provider that ignores the abort signal must not stall the whole
      // chain, so the timeout is enforced here as well.
      result = await withAbort(
        provider.lookup({
          code,
          credentials,
          signal: controller.signal,
          proxyBaseUrl: settings.proxyBaseUrl?.trim() || undefined,
        }),
        controller.signal,
        timeoutMs,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A timeout means the provider was aborted; anything else is a provider bug.
      result = {
        status: "error",
        kind: controller.signal.aborted ? "network" : "unknown",
        message,
      };
    } finally {
      clearTimeout(timer);
    }

    if (result.status === "found") {
      return {
        status: "found",
        title: result.title,
        providerId: provider.id,
        providerLabel: provider.label,
        raw: result.raw,
        failures,
      };
    }
    if (result.status === "not_found") {
      failures.push({
        providerId: provider.id,
        label: provider.label,
        kind: "not_found",
        message: "No record for this barcode.",
      });
      continue;
    }

    failures.push({
      providerId: provider.id,
      label: provider.label,
      kind: result.kind,
      message: result.message,
    });
    if (result.kind === "rate_limit") onRateLimited?.(provider.id);
    // Auth and CORS failures will not fix themselves, but another provider may
    // still have the record, so keep going.
  }

  return { status: attempted === 0 ? "no_providers" : "not_found", failures };
}