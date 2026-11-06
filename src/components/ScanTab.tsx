import { useState } from "react";
import type { FlowState } from "../hooks/useScanFlow";
import type { TmdbResult } from "../services/tmdb";
import { Scanner } from "./Scanner";
import { ManualEntry } from "./ManualEntry";
import { ConfirmMatch } from "./ConfirmMatch";

export interface ScanTabProps {
  flow: FlowState;
  onLookup: (barcode: string) => void;
  onRetry: () => void;
  onSearch: (query: string) => void;
  onConfirm: (result: TmdbResult) => void;
  onSkip: () => void;
  onDismiss: () => void;
}

/**
 * The scan screen. Its body changes with the flow state: idle shows the camera,
 * working shows progress, confirm shows the TMDB match for approval.
 */
export function ScanTab({
  flow,
  onLookup,
  onRetry,
  onSearch,
  onConfirm,
  onSkip,
  onDismiss,
}: ScanTabProps) {
  const [showCamera, setShowCamera] = useState(true);

  if (flow.kind === "confirm") {
    return (
      <ConfirmMatch
        barcode={flow.barcode}
        rawTitle={flow.rawTitle}
        providerLabel={flow.providerLabel}
        query={flow.query}
        results={flow.results}
        searching={flow.searching}
        error={flow.error}
        editing={Boolean(flow.editEntryId)}
        onConfirm={onConfirm}
        onSearch={onSearch}
        onSkip={onSkip}
      />
    );
  }

  return (
    <div className="stack">
      {flow.kind === "working" && (
        <div className="card row">
          <div className="spinner" />
          <div className="grow">
            <strong style={{ fontSize: "0.9rem" }}>{flow.step}</strong>
            <div className="hint mono">{flow.barcode}</div>
          </div>
        </div>
      )}

      {flow.kind === "message" && (
        <div className={`banner ${flow.tone}`}>
          <p>{flow.text}</p>
          {flow.details && flow.details.length > 0 && (
            <ul>
              {flow.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
          <div className="row">
            {flow.retryBarcode && (
              <button type="button" className="btn small" onClick={onRetry}>
                Try again
              </button>
            )}
            <button type="button" className="btn small ghost" onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showCamera ? (
        <>
          <Scanner onScan={onLookup} paused={flow.kind !== "idle"} />
          <button
            type="button"
            className="btn ghost block small"
            onClick={() => setShowCamera(false)}
          >
            Hide camera
          </button>
        </>
      ) : (
        <button type="button" className="btn primary block" onClick={() => setShowCamera(true)}>
          Show camera
        </button>
      )}

      <ManualEntry onSubmit={onLookup} />

      <p className="scanner-tip">
        Nothing is added to your list until you confirm the match. Download the CSV any time from the
        List tab and import it on letterboxd.com.
      </p>
    </div>
  );
}