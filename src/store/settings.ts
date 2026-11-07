import { HAS_ENV_CREDENTIALS, ENV_CORS_PROXY_URL, envCredentialsFor } from "../config/envKeys";
import { ALL_PROVIDERS, DEFAULT_PROVIDER_ORDER, orderedProviders } from "../services/barcodeDbs/registry";
import { isProviderConfigured } from "../services/barcodeDbs/types";
import { createStore } from "./createStore";
import type { ProviderSettings } from "./types";

const STORAGE_KEY = "lbd-disc-settings-v1";

/**
 * Development-only test keys from `.env.local` (see
 * `src/config/envKeys.ts`). They prefill the form so a contributor can scan
 * without signing up. In a production build this map is empty, and anything the
 * user typed in Settings takes precedence, including a deliberate "no key".
 */
function envCredentialDefaults(): Record<string, Record<string, string>> {
  return Object.fromEntries(ALL_PROVIDERS.map((provider) => [provider.id, envCredentialsFor(provider.id)]));
}

/**
 * Saved values win over build-time ones. A saved empty string counts as a
 * deliberate "cleared this key", so it must not be silently refilled; only a
 * field the user never touched falls back to the `.env` value.
 */
function mergeCredentials(
  saved: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const merged = envCredentialDefaults();
  for (const [providerId, values] of Object.entries(saved)) {
    merged[providerId] = { ...(merged[providerId] ?? {}), ...values };
  }
  return merged;
}

function defaultSettings(): ProviderSettings {
  return {
    order: [...DEFAULT_PROVIDER_ORDER],
    enabled: Object.fromEntries(ALL_PROVIDERS.map((provider) => [provider.id, true])),
    credentials: envCredentialDefaults(),
    // Keys from `.env` act as presets, so a build that supplies at least one is
    // already usable and should go straight to scanning. With none, onboarding
    // waits for the user to enter a key (see `src/config/envKeys.ts`).
    onboarded: HAS_ENV_CREDENTIALS,
    // The shipped proxy, so the two CORS-restricted databases work with no
    // setup. A saved value overrides it, including a deliberate empty string.
    proxyBaseUrl: ENV_CORS_PROXY_URL,
  };
}

function loadSettings(): ProviderSettings {
  const defaults = defaultSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaults;
    const saved = parsed as Partial<ProviderSettings>;
    return {
      // Merge rather than replace, so a provider registered after the user
      // first saved settings still appears with sensible defaults.
      order: orderedProviders(Array.isArray(saved.order) ? saved.order : defaults.order).map(
        (provider) => provider.id,
      ),
      enabled: { ...defaults.enabled, ...(saved.enabled ?? {}) },
      credentials: mergeCredentials(saved.credentials ?? {}),
      onboarded: typeof saved.onboarded === "boolean" ? saved.onboarded : defaults.onboarded,
      proxyBaseUrl:
        typeof saved.proxyBaseUrl === "string" ? saved.proxyBaseUrl : defaults.proxyBaseUrl,
    };
  } catch {
    return defaults;
  }
}

function persist(settings: ProviderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or a full quota: settings stay in memory for this session.
  }
}

function write(patch: Partial<ProviderSettings>): void {
  const next = { ...settingsStore.get(), ...patch };
  persist(next);
  settingsStore.set(next);
}

export const settingsStore = createStore<ProviderSettings>(loadSettings);

export const settingsActions = {
  setCredential(providerId: string, fieldKey: string, value: string): void {
    const credentials = settingsStore.get().credentials;
    write({
      credentials: {
        ...credentials,
        [providerId]: { ...(credentials[providerId] ?? {}), [fieldKey]: value },
      },
    });
  },

  setEnabled(providerId: string, enabled: boolean): void {
    write({ enabled: { ...settingsStore.get().enabled, [providerId]: enabled } });
  },

  moveProvider(providerId: string, direction: -1 | 1): void {
    const order = [...settingsStore.get().order];
    const index = order.indexOf(providerId);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    write({ order });
  },

  setProxyBaseUrl(proxyBaseUrl: string): void {
    write({ proxyBaseUrl });
  },

  completeOnboarding(): void {
    write({ onboarded: true });
  },

  reset(): void {
    const next = { ...defaultSettings(), onboarded: true };
    persist(next);
    settingsStore.set(next);
  },
};

/** Providers that are enabled and have every required credential. */
export function usableProviders(settings: ProviderSettings) {
  return orderedProviders(settings.order).filter(
    (provider) =>
      settings.enabled[provider.id] !== false &&
      isProviderConfigured(provider, settings.credentials[provider.id] ?? {}),
  );
}

export function hasUsableProvider(settings: ProviderSettings): boolean {
  return usableProviders(settings).length > 0;
}