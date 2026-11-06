import { useState } from "react";
import { useScanFlow } from "./hooks/useScanFlow";
import { collectionStore } from "./store/collection";
import { hasUsableProvider, settingsStore } from "./store/settings";
import { CollectionList } from "./components/CollectionList";
import { Onboarding } from "./components/Onboarding";
import { ScanTab } from "./components/ScanTab";
import { Settings } from "./components/Settings";
import { downloadCsv } from "./services/letterboxdCsv";

type Tab = "scan" | "list" | "settings";

export default function App() {
  const settings = settingsStore.use();
  const { entries } = collectionStore.use();
  const [tab, setTab] = useState<Tab>("scan");
  const flowApi = useScanFlow();
  const { flow } = flowApi;

  const ready = hasUsableProvider(settings);
  /**
   * First run means the user has never finished (or skipped) onboarding. That is
   * separate from "has no usable provider", because the keyless UPCitemdb trial
   * counts as usable while still being something we want to explain up front.
   */
  const firstRun = !settings.onboarded;
  const needsOnboarding = !ready;

  /** Scan is gated, but List stays reachable so existing data can be downloaded. */
  const activeTab: Tab = needsOnboarding && tab === "scan" ? "settings" : tab;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Letterboxd Discs</h1>
        <span className="count">{entries.length} in list</span>
      </header>

      <main className="app-main">
        {firstRun && <Onboarding firstRun={firstRun} />}

        {!firstRun && activeTab === "scan" && (
          <ScanTab
            flow={flow}
            onLookup={flowApi.startLookup}
            onRetry={flowApi.retry}
            onSearch={flowApi.manualSearch}
            onConfirm={flowApi.confirm}
            onSkip={flowApi.skip}
            onDismiss={flowApi.dismiss}
          />
        )}

        {!firstRun && activeTab === "list" && (
          <>
            {flow.kind === "confirm" && (
              <div className="banner info">
                <p>Finish the current match on the Scan tab first.</p>
                <button type="button" className="btn small" onClick={() => setTab("scan")}>
                  Back to scan
                </button>
              </div>
            )}
            <CollectionList
              flow={flow}
              onEditMatch={(entry) => {
                setTab("scan");
                void flowApi.editMatch(entry);
              }}
              onRetryBarcode={(barcode) => {
                setTab("scan");
                flowApi.startLookup(barcode);
              }}
            />
          </>
        )}

        {!firstRun && activeTab === "settings" && (
          <>
            <Settings />
            {entries.length > 0 && (
              <button type="button" className="btn block" onClick={() => downloadCsv(entries)}>
                Download CSV ({entries.length})
              </button>
            )}
          </>
        )}
      </main>

      {!firstRun && (
        <nav className="tabbar" aria-label="Main">
          <div className="tabbar-inner">
            <TabButton
              label="Scan"
              glyph="⌗"
              active={activeTab === "scan"}
              disabled={needsOnboarding}
              onClick={() => setTab("scan")}
            />
            <TabButton
              label="List"
              glyph="☰"
              active={activeTab === "list"}
              onClick={() => setTab("list")}
            />
            <TabButton
              label="Settings"
              glyph="⚙"
              active={activeTab === "settings"}
              onClick={() => setTab("settings")}
            />
          </div>
        </nav>
      )}
    </div>
  );
}

function TabButton({
  label,
  glyph,
  active,
  disabled,
  onClick,
}: {
  label: string;
  glyph: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="tab"
      aria-current={active ? "page" : undefined}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="glyph" aria-hidden>
        {glyph}
      </span>
      {label}
    </button>
  );
}