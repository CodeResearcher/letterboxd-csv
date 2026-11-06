import { envCredentialsFor } from "../config/envKeys";
import { ALL_PROVIDERS, orderedProviders } from "../services/barcodeDbs/registry";
import { hasUsableProvider, settingsActions, settingsStore, usableProviders } from "../store/settings";
import type { ProviderSettings } from "../store/types";

/**
 * First-run onboarding.
 *
 * AGENTS.md asks for a key prompt on first launch, so this screen is shown
 * whenever `onboarded` is false, even though the keyless UPCitemdb trial would
 * technically let a scan run straight away. The button stays disabled until at
 * least one provider is usable, so the user cannot get stuck with nothing.
 *
 * The dev-only build key set skips this screen (see `src/config/envKeys.ts`),
 * so in practice this is what a real user sees.
 */
export function Onboarding({ firstRun }: { firstRun: boolean }) {
  const settings = settingsStore.use();
  const ready = hasUsableProvider(settings);
  /** Dev-only test keys prefill the form; in a real build this is always 0. */
  const prefilledCount = ALL_PROVIDERS.filter(
    (provider) => envCredentialsFor(provider.id).apiKey,
  ).length;

  return (
    <div className="stack">
      <div className="card stack">
        <h2>
          {firstRun
            ? "Enter an API key for at least one barcode database"
            : "Add at least one barcode database key"}
        </h2>
        <p className="hint">
          One key is enough to start. The app tries the databases in the order below and stops at
          the first hit, so ordering them by hit rate saves your quota.
        </p>
        <ProviderKeyList settings={settings} />
        <button
          type="button"
          className="btn primary block"
          disabled={!ready}
          onClick={() => settingsActions.completeOnboarding()}
        >
          {ready ? "Start scanning" : "Enter a key to continue"}
        </button>
        <p className="hint">
          {prefilledCount > 0
            ? `${prefilledCount} of these keys are development test keys and can be replaced with your own. `
            : ""}
          Keys you enter are stored only on this device, in this browser, and are sent nowhere
          except to the API that issued them.{" "}
          {ready
            ? "UPCitemdb needs no key, so scans already work — adding a key just makes lookups more reliable."
            : ""}
        </p>
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
                  {provider.requiresProxy && <span className="pill warn">needs proxy</span>}
                </div>
                {provider.note && <p className="hint">{provider.note}</p>}
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
                  {field.helpText && <p className="hint">{field.helpText}</p>}
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

/** Used by Settings to summarise readiness. */
export function readyProviderCount(settings: ProviderSettings): number {
  return usableProviders(settings).length;
}