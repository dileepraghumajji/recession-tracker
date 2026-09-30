/**
 * Automatic imports of official Indian series from machine-readable sources
 * whose terms allow automated download (research of 2026-09-30, see
 * docs/dashboards/india-sentiment/README.md#official-releases-rbi-fbil).
 *
 * Only the RBI policy repo rate qualifies, via the BIS central bank policy rate
 * series for India (WS_CBPOL D.IN, "Source: Reserve Bank of India"):
 * - DBIE (data.rbi.org.in) has no public API, and RBI's release files on
 *   rbidocs.rbi.org.in are served only after a JavaScript bot challenge;
 * - FBIL benchmarks (G-Sec yields, USD/INR reference rate, CP/CD) and CCIL
 *   data require a licence for display/redistribution or forbid automated
 *   collection.
 * Everything else stays on POST /api/india-sentiment/ingest.
 *
 * The import is one small request, so it needs no lease or checkpoint: a run
 * is idempotent and an overlapping run writes the same values.
 */
import { fetchBisSeries } from "@/platform/data/bis";
import { SERIES_BY_KEY } from "../series";
import type { Obs, SeriesMeta } from "../types";
import { getStore, type Store } from "./store";

export interface OfficialImport {
  key: string;
  /** Recorded as the series origin. */
  origin: string;
  /** Full history from the source (ascending, no gaps filled). */
  fetch(): Promise<Obs[]>;
  /** Plausible value range; anything outside rejects the whole fetch. */
  range: [number, number];
  /** Fewer observations than this means a truncated response: nothing is replaced. */
  minObs: number;
}

/** 3 Apr 2001: the repo rate became the RBI's policy rate (BIS shows the Bank Rate before that). */
export const REPO_FROM = "2001-04-03";

export const OFFICIAL_IMPORTS: OfficialImport[] = [
  {
    key: "rbi:repo",
    origin: "bis",
    // UNIT_MEASURE 368 = per cent per annum, UNIT_MULT 0 = units.
    fetch: () => fetchBisSeries({ flow: "WS_CBPOL", key: "D.IN", startPeriod: REPO_FROM, expect: { freq: "D", refArea: "IN", unitMeasure: "368", unitMult: "0" } }),
    range: [0, 20],
    minObs: 4000,
  },
];

export const OFFICIAL_IMPORT_KEYS = OFFICIAL_IMPORTS.map((i) => i.key);

export interface OfficialImportReport {
  status: "skipped" | "ok" | "error";
  message: string;
  results: { key: string; status: "updated" | "unchanged" | "error"; message: string; first?: string; last?: string; count?: number }[];
}

function meta(imp: OfficialImport, status: "ok" | "error", error: string | null, fetchedAt: string): SeriesMeta {
  const def = SERIES_BY_KEY[imp.key];
  return { key: imp.key, kind: def.kind, sourceId: def.sourceId, origin: imp.origin, fetchedAt, sourceLastUpdated: null, fetchStatus: status, fetchError: error, synthetic: false };
}

/** Rejects a fetch that is implausible as a whole (never stores part of it). */
export function validateImport(imp: OfficialImport, obs: Obs[], today: string): void {
  if (obs.length < imp.minObs) throw new Error(`only ${obs.length} observations returned (expected at least ${imp.minObs}); nothing replaced`);
  for (const o of obs) {
    if (o.value < imp.range[0] || o.value > imp.range[1]) throw new Error(`${o.date}: value ${o.value} outside ${imp.range[0]}–${imp.range[1]}; nothing replaced`);
    if (o.date > today) throw new Error(`${o.date}: dated after today (${today}); nothing replaced`);
  }
}

/**
 * The source is authoritative for the dates it covers (revisions replace stored
 * values); stored observations dated after its last date — e.g. a newer policy
 * change pushed through the ingestion API — are kept.
 */
export function mergeAuthoritative(fetched: Obs[], stored: Obs[]): Obs[] {
  const last = fetched[fetched.length - 1]?.date;
  if (!last) return stored;
  return [...fetched, ...stored.filter((o) => o.date > last)];
}

/** Calendar date in India (UTC+05:30): a value dated after it cannot be real. */
const istDate = (ms: number) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);
const sameObs = (a: Obs[], b: Obs[]) => a.length === b.length && a.every((o, i) => o.date === b[i].date && o.value === b[i].value);

export async function runOfficialImports(opts: { store?: Store; now?: () => number; imports?: OfficialImport[] } = {}): Promise<OfficialImportReport> {
  if (process.env.DATA_MODE === "demo") return { status: "skipped", message: "DATA_MODE=demo", results: [] };
  const store = opts.store ?? getStore();
  const now = opts.now ?? Date.now;
  const imports = opts.imports ?? OFFICIAL_IMPORTS;
  const all = await store.loadAll();
  const results: OfficialImportReport["results"] = [];
  for (const imp of imports) {
    const fetchedAt = new Date(now()).toISOString();
    try {
      const obs = await imp.fetch();
      validateImport(imp, obs, istDate(now()));
      const stored = all[imp.key]?.obs ?? [];
      const next = mergeAuthoritative(obs, stored);
      const unchanged = sameObs(next, stored);
      // Unchanged: only the fetch time and status are recorded.
      await store.saveSeries(meta(imp, "ok", null, fetchedAt), unchanged ? null : next, unchanged ? "merge" : "replace");
      const range = { first: next[0].date, last: next[next.length - 1].date, count: next.length };
      results.push({ key: imp.key, status: unchanged ? "unchanged" : "updated", message: `${range.count} observations ${range.first} … ${range.last}`, ...range });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ key: imp.key, status: "error", message: msg });
      // Keep the stored observations; record the failure on the series.
      await store.saveSeries(meta(imp, "error", msg.slice(0, 500), fetchedAt), null, "merge").catch(() => undefined);
    }
  }
  const failed = results.filter((r) => r.status === "error");
  return {
    status: failed.length ? "error" : "ok",
    message: results.map((r) => `${r.key}: ${r.status} (${r.message})`).join("; "),
    results,
  };
}
