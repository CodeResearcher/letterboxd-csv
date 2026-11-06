import { orderedProviders } from "./barcodeDbs/registry";
import { lookupBarcode, type LookupOutcome } from "./barcodeDbs/lookupBarcode";
import { describeFailure, type LookupFailureKind } from "./barcodeDbs/types";
import type { NormalizedBarcode } from "./normalizeBarcode";
import type { ProviderSettings } from "../store/types";
import { cleanTitle } from "../utils/titleCleanup";

export interface ResolveOptions {
  code: NormalizedBarcode;
  settings: ProviderSettings;
  cooldowns: Record<string, number>;
  onRateLimited: (providerId: string) => void;
  onMemoHit?: (providerId: string) => void;
  /** Cached title for this barcode, so a re-scan costs no API call at all. */
  memo?: { title: string; providerId: string };
  signal?: AbortSignal;
}

export type ResolveResult =
  | { status: "found"; title: string; searchQuery: string; providerId: string; providerLabel: string }
  | { status: "no_title"; message: string; details: string[] }
  | { status: "no_providers"; message: string };

/**
 * Step 1 of the scan pipeline: barcode -> film title.
 *
 * Titles from these databases are product listings ("The Matrix (Blu-ray)
 * [Region B]"), so they are cleaned before the TMDB search gets them.
 */
export async function resolveTitle(options: ResolveOptions): Promise<ResolveResult> {
  const { code, settings, cooldowns, onRateLimited, onMemoHit, memo } = options;

  if (memo) {
    onMemoHit?.(memo.providerId);
    return {
      status: "found",
      title: memo.title,
      searchQuery: cleanTitle(memo.title),
      providerId: memo.providerId,
      providerLabel: "cached",
    };
  }

  const providers = orderedProviders(settings.order);
  const outcome: LookupOutcome = await lookupBarcode({
    providers,
    settings: {
      order: settings.order,
      enabled: settings.enabled,
      credentials: settings.credentials,
      proxyBaseUrl: settings.proxyBaseUrl,
    },
    code,
    cooldowns,
    onRateLimited,
  });

  if (outcome.status === "found") {
    return {
      status: "found",
      title: outcome.title,
      searchQuery: cleanTitle(outcome.title),
      providerId: outcome.providerId,
      providerLabel: outcome.providerLabel,
    };
  }

  if (outcome.status === "no_providers") {
    return {
      status: "no_providers",
      message: "No barcode database is set up yet. Add an API key in Settings.",
    };
  }

  const details = outcome.failures.map((failure) =>
    failure.kind === "not_found"
      ? `${failure.label}: no record for this barcode.`
      : describeFailure(failure.kind as LookupFailureKind, failure.label),
  );
  return {
    status: "no_title",
    message: "No database had this barcode.",
    details,
  };
}