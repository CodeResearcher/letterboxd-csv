export interface CollectionEntry {
  /** Stable key for storage and React lists. */
  id: string;
  /** Normalized barcode digits as scanned or typed. */
  barcode: string;
  /** Title exactly as the barcode database returned it. */
  rawTitle: string;
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  /** Which provider produced the title, for troubleshooting. */
  providerId: string;
  addedAt: number;
}

export interface UnresolvedEntry {
  id: string;
  barcode: string;
  addedAt: number;
  /** Why nothing was resolved, in a form we can show the user. */
  reason: string;
}

export interface ProviderSettings {
  /** Provider ids in the user's priority order. */
  order: string[];
  enabled: Record<string, boolean>;
  /** Keyed by provider id, then by CredentialField.key. */
  credentials: Record<string, Record<string, string>>;
  /** Dismissed the first-run explanation. */
  onboarded: boolean;
  /**
   * Optional CORS proxy for providers that block browsers. Requests become
   * `${proxyBaseUrl}?url=<encoded target>`.
   */
  proxyBaseUrl: string;
}

export interface LookupMemo {
  title: string;
  providerId: string;
  savedAt: number;
}