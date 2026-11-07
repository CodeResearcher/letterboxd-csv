import { ALL_PROVIDERS, orderedProviders } from "../services/barcodeDbs/registry";
import { hasUsableProvider, settingsActions, settingsStore } from "../store/settings";
import type { ProviderSettings } from "../store/types";

/**
 * First-run onboarding.
 *
 * AGENTS.md asks for a key prompt on first launch. Build-time keys act as
 * presets (see `src/config/envKeys.ts`): when `.env` supplies at least one
 * barcode key the store marks the session onboarded and this screen never
 * appears, so a configured deployment goes straight to scanning. With no keys
 * the user is asked for one, and the button stays disabled until a provider is
 * usable so they cannot get stuck with nothing.
 */
export function Onboarding({ firstRun }: { firstRun: boolean }) {
  const settings = settingsStore.use();
  const ready = hasUsableProvider(settings);

  return (
    <div className="stack">
      <div className="card stack">
        <h2>
          {firstRun
            ? "Enter an API key for at least one barcode database"
            : "Add at least one barcode database key"}
        </h2>
        <ProviderKeyList settings={settings} />
        <button
          type="button"
          className="btn primary block"
          disabled={!ready}
          onClick={() => settingsActions.completeOnboarding()}
        >
          {ready ? "Start scanning" : "Enter a key to continue"}
        </button>
      </div>
    </div>
  );
}

export function ProviderKeyList({ settings }: { settings: ProviderSettings }) {
  return (
    <div className="stack">
      {orderedProviders(settings.order).map((provider) => {
        const credentials = settings.credentials[provider.id] ?? {};
        const enabled = settings.enabled[provider.id] !== false;
        return (
          <div key={provider.id} className="stack">
            <div className="row between">
              <div className="grow">
                <div className="row" style={{ gap: 8 }}>
                  <strong style={{ fontSize: "0.9rem" }}>{provider.label}</strong>
                </div>
              </div>
              <button
                type="button"
                className="toggle"
                aria-pressed={enabled}
                aria-label={`Enable ${provider.label}`}
                onClick={() => settingsActions.setEnabled(provider.id, !enabled)}
              />
            </div>
            {enabled &&
              provider.credentialFields.map((field) => (
                <div key={field.key} className="field">
                  <label htmlFor={`${provider.id}-${field.key}`}>
                    {field.label}
                    {field.required ? "" : " (optional)"}
                  </label>
                  <input
                    id={`${provider.id}-${field.key}`}
                    className="input"
                    type={field.secret ? "password" : "text"}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder={field.placeholder}
                    value={credentials[field.key] ?? ""}
                    onChange={(event) =>
                      settingsActions.setCredential(provider.id, field.key, event.target.value)
                    }
                  />
                </div>
              ))}
            {enabled && (
              <div className="row">
                <button
                  type="button"
                  className="btn icon small"
                  aria-label={`Move ${provider.label} up`}
                  onClick={() => settingsActions.moveProvider(provider.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn icon small"
                  aria-label={`Move ${provider.label} down`}
                  onClick={() => settingsActions.moveProvider(provider.id, 1)}
                >
                  ↓
                </button>
                <span className="hint">
                  Priority {orderedProviders(settings.order).findIndex((item) => item.id === provider.id) + 1} of{" "}
                  {ALL_PROVIDERS.length}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}