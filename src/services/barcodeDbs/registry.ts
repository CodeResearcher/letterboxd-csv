import { eandataProvider } from "./eandata";
import type { BarcodeProvider } from "./types";
import { upcdatabaseProvider } from "./upcdatabase";
import { upcitemdbProvider } from "./upcitemdb";
import { upcmdbProvider } from "./upcmdb";

/**
 * Default provider priority, matching AGENTS.md.
 *
 * Adding a barcode database later:
 *   1. create `./yourProvider.ts` exporting a BarcodeProvider
 *   2. import it here and add it to DEFAULT_PROVIDER_ORDER
 * Nothing in the scanner, settings UI, or TMDB code needs to change: the
 * settings screen and the orchestrator both read this registry.
 */
export const ALL_PROVIDERS: BarcodeProvider[] = [
  upcmdbProvider,
  upcdatabaseProvider,
  eandataProvider,
  upcitemdbProvider,
];

export const DEFAULT_PROVIDER_ORDER: string[] = ALL_PROVIDERS.map((provider) => provider.id);

export function getProvider(id: string): BarcodeProvider | undefined {
  return ALL_PROVIDERS.find((provider) => provider.id === id);
}

/** Providers in the user's saved order, with unknown ids dropped and new ones appended. */
export function orderedProviders(order: string[] | undefined): BarcodeProvider[] {
  const known = new Set(ALL_PROVIDERS.map((provider) => provider.id));
  const saved = (order ?? []).filter((id) => known.has(id));
  const missing = DEFAULT_PROVIDER_ORDER.filter((id) => !saved.includes(id));
  const ids = [...saved, ...missing];
  return ids
    .map((id) => getProvider(id))
    .filter((provider): provider is BarcodeProvider => Boolean(provider));
}