import type { NormalizedBarcode } from "../normalizeBarcode";

/** Credential input rendered in Settings for a provider. */
export interface CredentialField {
  key: string;
  label: string;
  placeholder?: string;
  /** Masked in the UI. */
  secret?: boolean;
  /** A provider is unusable until every required field has a value. */
  required?: boolean;
}

export type LookupFailureKind = "auth" | "rate_limit" | "network" | "cors" | "unknown";

export type LookupResult =
  | { status: "found"; title: string; providerId: string; raw?: unknown }
  | { status: "not_found" }
  | { status: "error"; kind: LookupFailureKind; message: string };

/** What a provider's raw lookup returns, before the orchestrator tags it. */
export type ProviderLookupResult =
  | { status: "found"; title: string; raw?: unknown }
  | { status: "not_found" }
  | { status: "error"; kind: LookupFailureKind; message: string };

export interface LookupContext {
  /** Codes the provider may use, already normalized. */
  code: NormalizedBarcode;
  /** User-supplied credentials keyed by `CredentialField.key`. Empty for keyless providers. */
  credentials: Record<string, string>;
  signal: AbortSignal;
  /**
   * Optional CORS proxy prefix. Providers whose API blocks browser requests
   * append the target URL to this rather than changing their call sites.
   */
  proxyBaseUrl?: string;
}

export interface BarcodeProvider {
  /** Stable storage key. Never change it without migrating settings. */
  id: string;
  /** Shown in Settings and in "found via" labels. */
  label: string;
  credentialFields: CredentialField[];
  /**
   * True when the provider's API does not send CORS headers, so browser calls
   * fail unless a proxy is configured. Only affects the guidance we show.
   */
  requiresProxy?: boolean;
  supports?(code: NormalizedBarcode): boolean;
  lookup(ctx: LookupContext): Promise<ProviderLookupResult>;
}

export function isProviderConfigured(
  provider: BarcodeProvider,
  credentials: Record<string, string>,
): boolean {
  const required = provider.credentialFields.filter((field) => field.required);
  if (required.length === 0) return true;
  return required.every((field) => Boolean(credentials[field.key]?.trim()));
}

/** Human-readable explanation for a failure, used in the UI. */
export function describeFailure(kind: LookupFailureKind, providerLabel: string): string {
  switch (kind) {
    case "auth":
      return `${providerLabel} rejected the API key. Check it in Settings.`;
    case "rate_limit":
      return `${providerLabel} is rate limited right now.`;
    case "network":
      return `Could not reach ${providerLabel}. Check your connection.`;
    case "cors":
      return `${providerLabel} blocks requests from browsers. Add a CORS proxy in Settings.`;
    default:
      return `${providerLabel} returned an unexpected response.`;
  }
}