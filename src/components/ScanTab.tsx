import { useEffect, useState } from "react";
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
  // The camera is torn down as soon as a lookup finishes. While it is live the
  // scanner holds an open stream and occupies the camera lens, and after a
  // delete-then-rescan the stale result banner would otherwise keep it paused,
  // so the disc in front of the lens could never be read again. Reopening is one
  // tap, and that tap also clears the previous result.
  const [cameraOpen, setCameraOpen] = useState(false);

  // A lookup in flight or a result on screen ends the "point at the next disc"
  // intent, so the open flag is dropped. That keeps a single camera control
  // visible in every state instead of a "Start camera" button that sits under a
  // camera that is still running.
  const busy = flow.kind !== "idle";
  useEffect(() => {
    if (busy) setCameraOpen(false);
  }, [busy]);

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

  // Only a clean idle screen keeps the camera on: a lookup in flight is already
  // reading a code, and a result or error message means the user needs to read
  // it and decide, not keep the lens pointed at the case.
  const cameraLive = cameraOpen && flow.kind === "idle";

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

      {cameraLive ? (
        <>
          <Scanner onScan={onLookup} autoStart />
          <button
            type="button"
            className="btn ghost block small"
            onClick={() => setCameraOpen(false)}
          >
            Hide camera
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn primary block"
          onClick={() => {
            // Picking the camera up again means "next disc", so the previous
            // result is dismissed first. That matters after deleting an entry:
            // the leftover "already in your list" banner must not block a rescan.
            onDismiss();
            setCameraOpen(true);
          }}
        >
          {cameraOpen ? "Resume camera" : "Start camera"}
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