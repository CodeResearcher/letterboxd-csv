import { useState } from "react";
import { posterUrl, type TmdbResult } from "../services/tmdb";

export interface ConfirmMatchProps {
  barcode: string;
  rawTitle: string;
  providerLabel: string;
  query: string;
  results: TmdbResult[];
  searching: boolean;
  error: string | null;
  /** Editing an existing entry instead of adding one. */
  editing: boolean;
  onConfirm: (result: TmdbResult) => void;
  onSearch: (query: string) => void;
  onSkip: () => void;
}

/**
 * The confirmation step. Nothing reaches the CSV until the user presses the
 * confirm button here, even when there is exactly one result.
 */
export function ConfirmMatch({
  barcode,
  rawTitle,
  providerLabel,
  query,
  results,
  searching,
  error,
  editing,
  onConfirm,
  onSearch,
  onSkip,
}: ConfirmMatchProps) {
  const [best, ...rest] = results;
  const [search, setSearch] = useState(query);
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="card stack">
      <div className="row between">
        <span className="section-title">{editing ? "Change the match" : "Confirm the match"}</span>
        <span className="pill mono">{barcode}</span>
      </div>

      <div className="raw-title">
        <strong>{providerLabel}</strong> says: “{rawTitle}”
      </div>

      {searching && (
        <div className="row">
          <div className="spinner" />
          <span className="muted small">Searching TMDB…</span>
        </div>
      )}

      {error && <div className="banner error">{error}</div>}

      {!searching && !error && !best && (
        <div className="empty">
          TMDB has no results for “{query}”.
          <br />
          Try a different title below.
        </div>
      )}

      {best && (
        <div className="match">
          <Poster path={best.posterPath} title={best.title} />
          <div className="match-body">
            <div className="match-title">{best.title}</div>
            <div className="match-meta">
              {best.year ?? "Year unknown"} · TMDB #{best.id}
            </div>
            {best.overview && <p className="small muted">{best.overview}</p>}
          </div>
        </div>
      )}

      {best && (
        <button type="button" className="btn primary block" onClick={() => onConfirm(best)}>
          {editing ? "Use this match" : "Add to my list"}
        </button>
      )}

      {rest.length > 0 && (
        <div className="stack">
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? "Hide other results" : `Not it? Show ${rest.length} other result${rest.length === 1 ? "" : "s"}`}
          </button>
          {showAll && (
            <div className="alternatives">
              {rest.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className="alt"
                  onClick={() => onConfirm(result)}
                >
                  <Poster path={result.posterPath} title={result.title} small />
                  <span className="grow">
                    <span className="alt-title">{result.title}</span>
                    <br />
                    <span className="alt-year">{result.year ?? "—"}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="divider" />

      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = search.trim();
          if (trimmed) onSearch(trimmed);
        }}
      >
        <input
          className="input grow"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search TMDB by title"
          aria-label="Search TMDB by title"
        />
        <button type="submit" className="btn small" disabled={!search.trim() || searching}>
          Search
        </button>
      </form>

      <button type="button" className="btn ghost block small" onClick={onSkip}>
        Skip this disc
      </button>
    </div>
  );
}

function Poster({ path, title, small }: { path: string | null; title: string; small?: boolean }) {
  const url = posterUrl(path, small ? "w200" : "w342");
  if (!url) {
    return (
      <div className="poster placeholder" aria-hidden>
        No poster
      </div>
    );
  }
  return <img className="poster" src={url} alt={`Poster for ${title}`} loading="lazy" />;
}