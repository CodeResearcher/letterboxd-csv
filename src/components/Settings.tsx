import { useState } from "react";
import { ENV_TMDB_API_KEY } from "../config/envKeys";
import { ALL_PROVIDERS } from "../services/barcodeDbs/registry";
import { downloadCsv } from "../services/letterboxdCsv";
import { TMDB_KEY_SETUP_HINT } from "../services/tmdb";
import {
  apiUsageStore,
  averageLatencyMs,
  clearApiUsage,
  TMDB_API_ID,
  type ApiUsageEntry,
} from "../store/apiUsage";
import {
  clearCollection,
  collectionStore,
  requestPersistentStorage,
} from "../store/collection";
import { settingsActions, settingsStore } from "../store/settings";
import { ProviderKeyList } from "./Onboarding";

export function Settings() {
  const settings = settingsStore.use();
  const { entries } = collectionStore.use();
  const [confirmReset, setConfirmReset] = useState(false);
  const [storageNotice, setStorageNotice] = useState("");

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Barcode databases</h2>
        <ProviderKeyList settings={settings} />
      </div>

      <div className="card stack">
        <h2>CORS proxy</h2>
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

      <ApiUsageCard />

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

/**
 * Requests sent per API today.
 *
 * Three of the barcode databases and TMDB all meter the same lookup pipeline,
 * so seeing the counts is the quickest way to tell where a scan's cost lands.
 * Counts reset with the local day (see `src/store/apiUsage.ts`).
 */
function ApiUsageCard() {
  const { usage } = apiUsageStore.use();
  const rows = [
    ...ALL_PROVIDERS.map((provider) => ({ id: provider.id, label: provider.label })),
    { id: TMDB_API_ID, label: "TMDB" },
  ];
  const total = rows.reduce((sum, row) => sum + (usage[row.id]?.requests ?? 0), 0);

  return (
    <div className="card stack">
      <h2>API requests</h2>
      <p className="hint">
        Requests sent today, counted on this device. {total} {total === 1 ? "request" : "requests"}{" "}
        total.
      </p>
      <div className="stack">
        {rows.map((row) => (
          <UsageRow key={row.id} label={row.label} entry={usage[row.id]} />
        ))}
      </div>
      <button
        type="button"
        className="btn small ghost"
        disabled={total === 0}
        onClick={() => clearApiUsage()}
      >
        Reset counters
      </button>
    </div>
  );
}

function UsageRow({ label, entry }: { label: string; entry: ApiUsageEntry | undefined }) {
  const requests = entry?.requests ?? 0;
  const errors = entry?.errors ?? 0;
  const average = averageLatencyMs(entry);

  return (
    <div className="row between">
      <span>{label}</span>
      <span className="hint">
        {requests} {requests === 1 ? "request" : "requests"}
        {errors > 0 ? ` · ${errors} failed` : ""}
        {average !== null ? ` · ~${average} ms` : ""}
      </span>
    </div>
  );
}