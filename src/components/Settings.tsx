import { useState } from "react";
import { ENV_TMDB_API_KEY, envCredentialsFor } from "../config/envKeys";
import { ALL_PROVIDERS } from "../services/barcodeDbs/registry";
import { downloadCsv } from "../services/letterboxdCsv";
import { TMDB_KEY_SETUP_HINT } from "../services/tmdb";
import {
  clearCollection,
  collectionStore,
  requestPersistentStorage,
} from "../store/collection";
import { hasUsableProvider, settingsActions, settingsStore } from "../store/settings";
import { ProviderKeyList, readyProviderCount } from "./Onboarding";

export function Settings() {
  const settings = settingsStore.use();
  const { entries } = collectionStore.use();
  const [confirmReset, setConfirmReset] = useState(false);
  const [storageNotice, setStorageNotice] = useState("");
  /** Barcode keys only exist during development, so this is empty in a real build. */
  const prefilledProviders = ALL_PROVIDERS.filter(
    (provider) => envCredentialsFor(provider.id).apiKey,
  ).map((provider) => provider.label);

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Barcode databases</h2>
        <p className="hint">
          Tried in this order, stopping at the first hit. {readyProviderCount(settings)} ready.
          {hasUsableProvider(settings) ? "" : " Enter at least one key to be able to scan."}
        </p>
        {prefilledProviders.length > 0 && (
          <p className="hint">
            Test keys from `.env.development.local`: {prefilledProviders.join(", ")}. These are for
            local development only and never ship in a build.
          </p>
        )}
        <ProviderKeyList settings={settings} />
      </div>

      <div className="card stack">
        <h2>CORS proxy</h2>
        <p className="hint">
          UPC Database and UPCitemdb do not allow browser requests. If you run a small proxy, enter
          its base URL here and each request becomes <span className="mono">?url=&lt;target&gt;</span>.
          Leave it empty to skip those providers.
        </p>
        <div className="field">
          <label htmlFor="proxy-url">Proxy base URL</label>
          <input
            id="proxy-url"
            className="input"
            inputMode="url"
            autoComplete="off"
            placeholder="https://my-proxy.example.workers.dev/"
            value={settings.proxyBaseUrl}
            onChange={(event) => settingsActions.setProxyBaseUrl(event.target.value)}
          />
        </div>
      </div>

      <div className="card stack">
        <h2>TMDB</h2>
        {ENV_TMDB_API_KEY ? (
          <p className="hint">A TMDB API key is configured for this build.</p>
        ) : (
          <div className="banner error">{TMDB_KEY_SETUP_HINT}</div>
        )}
      </div>

      <div className="card stack">
        <h2>Your data</h2>
        <p className="hint">
          {entries.length} {entries.length === 1 ? "entry" : "entries"} stored in this browser.
          Clearing site data or uninstalling the app deletes the list, so download the CSV before
          you clear anything.
        </p>

        <div className="row">
          <button
            type="button"
            className="btn small"
            disabled={entries.length === 0}
            onClick={() => downloadCsv(entries)}
          >
            Download CSV
          </button>
          <button
            type="button"
            className="btn small ghost"
            onClick={async () => {
              const granted = await requestPersistentStorage();
              setStorageNotice(
                granted
                  ? "Storage is now persistent: the browser will not evict your list automatically."
                  : "Persistent storage was not granted. The browser may clear the list if space runs out.",
              );
            }}
          >
            Protect from eviction
          </button>
        </div>
        {storageNotice && <p className="hint">{storageNotice}</p>}

        <div className="divider" />

        {confirmReset ? (
          <div className="banner error">
            <p>Clear every entry and start a new list? Downloading afterwards is unaffected.</p>
            <div className="row">
              <button
                type="button"
                className="btn small danger"
                onClick={() => {
                  clearCollection();
                  setConfirmReset(false);
                }}
              >
                Yes, clear the list
              </button>
              <button
                type="button"
                className="btn small ghost"
                onClick={() => setConfirmReset(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn small danger"
            disabled={entries.length === 0}
            onClick={() => setConfirmReset(true)}
          >
            Start a new list
          </button>
        )}

        <button
          type="button"
          className="btn small ghost"
          onClick={() => {
            if (window.confirm("Reset all settings, including saved API keys?")) {
              settingsActions.reset();
            }
          }}
        >
          Reset settings and keys
        </button>
      </div>
    </div>
  );
}