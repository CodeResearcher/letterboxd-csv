import { useState } from "react";
import { collectionStore, removeEntry, removeUnresolved } from "../store/collection";
import type { CollectionEntry } from "../store/types";
import { posterUrl } from "../services/tmdb";
import { downloadCsv } from "../services/letterboxdCsv";
import type { FlowState } from "../hooks/useScanFlow";

export interface CollectionListProps {
  onEditMatch: (entry: CollectionEntry) => void;
  onRetryBarcode: (barcode: string) => void;
  flow: FlowState;
}

/** The collection doubles as the CSV: every confirmed entry becomes one row. */
export function CollectionList({ onEditMatch, onRetryBarcode, flow }: CollectionListProps) {
  const { entries, unresolved } = collectionStore.use();
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? entries.filter((entry) => {
        const needle = query.trim().toLowerCase();
        return (
          entry.title.toLowerCase().includes(needle) ||
          entry.barcode.includes(needle) ||
          String(entry.year ?? "").includes(needle)
        );
      })
    : entries;

  const busy = flow.kind === "working";

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row between">
          <div>
            <h2>Your list</h2>
            <p className="hint">
              {entries.length} {entries.length === 1 ? "disc" : "discs"} · one `tmdbID` per row in
              the CSV
            </p>
          </div>
          <button
            type="button"
            className="btn primary small"
            disabled={entries.length === 0}
            onClick={() => downloadCsv(entries)}
          >
            Download CSV
          </button>
        </div>
        {entries.length > 6 && (
          <input
            className="input"
            placeholder="Filter by title, year or barcode"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Filter your list"
          />
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          {entries.length === 0
            ? "Nothing scanned yet. Confirm a match on the Scan tab and it appears here."
            : "No entries match that filter."}
        </div>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {filtered.map((entry) => (
            <div key={entry.id} className="entry">
              <EntryPoster entry={entry} />
              <div className="entry-body">
                <div className="entry-title">{entry.title}</div>
                <div className="entry-meta">
                  {entry.year ?? "Year unknown"} · <span className="mono">{entry.barcode}</span>
                </div>
              </div>
              <div className="entry-actions">
                <button
                  type="button"
                  className="btn icon small"
                  aria-label={`Change the TMDB match for ${entry.title}`}
                  disabled={busy}
                  onClick={() => onEditMatch(entry)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="btn icon small danger"
                  aria-label={`Remove ${entry.title}`}
                  onClick={() => removeEntry(entry.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card stack">
        <div className="row between">
          <div>
            <h2>Unresolved</h2>
            <p className="hint">
              Barcodes no database recognised. Fix one by entering the title by hand.
            </p>
          </div>
          {unresolved.length > 0 && <span className="pill warn">{unresolved.length}</span>}
        </div>

        {unresolved.length === 0 ? (
          <p className="hint">Nothing waiting.</p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {unresolved.map((item) => (
              <div key={item.id} className="entry">
                <div className="entry-body">
                  <div className="entry-title mono">{item.barcode}</div>
                  <div className="entry-meta">{item.reason}</div>
                </div>
                <div className="entry-actions">
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      removeUnresolved(item.id);
                      onRetryBarcode(item.barcode);
                    }}
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    className="btn icon small danger"
                    aria-label={`Dismiss ${item.barcode}`}
                    onClick={() => removeUnresolved(item.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EntryPoster({ entry }: { entry: CollectionEntry }) {
  const url = posterUrl(entry.posterPath, "w200");
  if (!url) return <div className="poster placeholder" aria-hidden />;
  return <img className="poster" src={url} alt="" loading="lazy" />;
}