import { useCallback, useEffect, useRef, useState } from "react";
import type { TmdbResult } from "../services/tmdb";
import { searchTmdb } from "../services/tmdb";
import { ENV_TMDB_API_KEY } from "../config/envKeys";
import { normalizeBarcode, type NormalizedBarcode } from "../services/normalizeBarcode";
import { resolveTitle } from "../services/resolveScan";
import {
  addEntry,
  addUnresolved,
  findByBarcode,
  markRateLimited,
  readCooldowns,
  readMemo,
  updateEntry,
  writeMemo,
} from "../store/collection";
import { settingsStore } from "../store/settings";
import type { CollectionEntry } from "../store/types";

export type FlowState =
  | { kind: "idle" }
  | { kind: "working"; barcode: string; step: string }
  | {
      kind: "confirm";
      barcode: string;
      rawTitle: string;
      providerId: string;
      providerLabel: string;
      query: string;
      results: TmdbResult[];
      searching: boolean;
      error: string | null;
      /** Set when re-matching an existing entry rather than adding a new one. */
      editEntryId?: string;
    }
  | {
      kind: "message";
      tone: "success" | "error" | "info";
      text: string;
      details?: string[];
      /** Barcode kept so the user can retry without re-scanning. */
      retryBarcode?: string;
    };

/**
 * The whole scan pipeline in one place:
 *   barcode -> normalized -> dedupe check -> providers -> TMDB -> confirm -> store
 * Every branch ends in a message, so the UI never hangs on a spinner.
 */
export function useScanFlow() {
  const [flow, setFlow] = useState<FlowState>({ kind: "idle" });
  const cooldownsRef = useRef<Record<string, number>>({});
  const activeRef = useRef(0);

  useEffect(() => {
    void readCooldowns().then((cooldowns) => {
      cooldownsRef.current = cooldowns;
    });
  }, []);

  const searchTmdbFor = useCallback(async (query: string): Promise<TmdbResult[]> => {
    const response = await searchTmdb(query, { apiKey: ENV_TMDB_API_KEY });
    if (!response.ok) throw new Error(response.error);
    return response.results;
  }, []);

  const run = useCallback(
    async (code: NormalizedBarcode) => {
      const runId = ++activeRef.current;
      const settings = settingsStore.get();

      const already = findByBarcode(code.raw) ?? findByBarcode(code.ean13);
      if (already) {
        setFlow({
          kind: "message",
          tone: "info",
          text: `"${already.title}" (${already.year ?? "year unknown"}) is already in your list.`,
        });
        return;
      }

      setFlow({ kind: "working", barcode: code.raw, step: "Looking up the barcode…" });

      const memo = (await readMemo(code.ean13)) ?? (await readMemo(code.raw));
      const resolved = await resolveTitle({
        code,
        settings,
        cooldowns: cooldownsRef.current,
        memo,
        onRateLimited: (providerId) => {
          cooldownsRef.current[providerId] = Date.now() + 10 * 60_000;
          void markRateLimited(providerId);
        },
      });

      if (runId !== activeRef.current) return;

      if (resolved.status !== "found") {
        // Keep a record with the reason, so the List tab can explain and retry.
        const reason =
          resolved.status === "no_title" && resolved.details.length > 0
            ? `${resolved.message} ${resolved.details.join(" ")}`
            : resolved.message;
        addUnresolved(code.raw, reason);
        setFlow({
          kind: "message",
          tone: "error",
          text: resolved.message,
          details: resolved.status === "no_title" ? resolved.details : undefined,
          retryBarcode: code.raw,
        });
        return;
      }

      await writeMemo(code.ean13, { title: resolved.title, providerId: resolved.providerId });

      setFlow({
        kind: "working",
        barcode: code.raw,
        step: `Searching TMDB for "${resolved.searchQuery}"…`,
      });

      let results: TmdbResult[] = [];
      let error: string | null = null;
      try {
        results = await searchTmdbFor(resolved.searchQuery);
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }
      if (runId !== activeRef.current) return;

      setFlow({
        kind: "confirm",
        barcode: code.raw,
        rawTitle: resolved.title,
        providerId: resolved.providerId,
        providerLabel: resolved.providerLabel,
        query: resolved.searchQuery,
        results,
        searching: false,
        error,
      });
    },
    [searchTmdbFor],
  );

  const startLookup = useCallback(
    (input: string) => {
      const parsed = normalizeBarcode(input);
      if (!parsed.ok) {
        setFlow({ kind: "message", tone: "error", text: parsed.error });
        return;
      }
      void run(parsed.value);
    },
    [run],
  );

  const retry = useCallback(() => {
    const current = flow;
    if (current.kind === "message" && current.retryBarcode) {
      startLookup(current.retryBarcode);
    }
  }, [flow, startLookup]);

  const manualSearch = useCallback(
    async (query: string) => {
      setFlow((current) =>
        current.kind === "confirm" ? { ...current, searching: true, error: null } : current,
      );
      try {
        const results = await searchTmdbFor(query);
        setFlow((current) =>
          current.kind === "confirm"
            ? { ...current, results, query, searching: false, error: null }
            : current,
        );
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        setFlow((current) =>
          current.kind === "confirm"
            ? { ...current, searching: false, error: message }
            : current,
        );
      }
    },
    [searchTmdbFor],
  );

  const confirm = useCallback((result: TmdbResult) => {
    const current = flow;
    if (current.kind !== "confirm") return;

    if (current.editEntryId) {
      updateEntry(current.editEntryId, {
        tmdbId: result.id,
        title: result.title,
        year: result.year,
        posterPath: result.posterPath,
      });
      setFlow({ kind: "message", tone: "success", text: `Updated to "${result.title}".` });
      return;
    }

    const outcome = addEntry({
      barcode: current.barcode,
      rawTitle: current.rawTitle,
      tmdbId: result.id,
      title: result.title,
      year: result.year,
      posterPath: result.posterPath,
      providerId: current.providerId,
    });

    if (outcome.status === "added") {
      setFlow({
        kind: "message",
        tone: "success",
        text: `Added "${result.title}"${result.year ? ` (${result.year})` : ""}.`,
      });
    } else if (outcome.status === "duplicate_tmdb") {
      setFlow({
        kind: "message",
        tone: "info",
        text: `"${outcome.entry.title}" is already in your list.`,
      });
    } else {
      setFlow({
        kind: "message",
        tone: "info",
        text: `That barcode is already saved as "${outcome.entry.title}".`,
      });
    }
  }, [flow]);

  const skip = useCallback(() => setFlow({ kind: "idle" }), []);
  const dismiss = useCallback(() => setFlow({ kind: "idle" }), []);

  /** Re-match an existing entry against TMDB, starting from its stored title. */
  const editMatch = useCallback(
    async (entry: CollectionEntry) => {
      setFlow({
        kind: "confirm",
        barcode: entry.barcode,
        rawTitle: entry.rawTitle,
        providerId: entry.providerId,
        providerLabel: "your list",
        query: entry.title,
        results: [
          {
            id: entry.tmdbId,
            title: entry.title,
            year: entry.year,
            posterPath: entry.posterPath,
            overview: null,
          },
        ],
        searching: true,
        error: null,
        editEntryId: entry.id,
      });
      try {
        const results = await searchTmdbFor(entry.title);
        setFlow((current) =>
          current.kind === "confirm"
            ? { ...current, results, searching: false, error: null }
            : current,
        );
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        setFlow((current) =>
          current.kind === "confirm" ? { ...current, searching: false, error: message } : current,
        );
      }
    },
    [searchTmdbFor],
  );

  return { flow, startLookup, retry, manualSearch, confirm, skip, dismiss, editMatch };
}