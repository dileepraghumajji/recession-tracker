/**
 * Core domain types shared by the data layer, scoring engine, API routes and UI.
 */

export type Frequency = "D" | "W" | "M" | "Q";

/** A single dated observation. Dates are ISO `YYYY-MM-DD` strings (UTC, date only). */
export interface Obs {
  date: string;
  value: number;
}

export type Provider = "fred" | "twelvedata" | "manual";

/** A raw upstream series (one API call). */
export interface SeriesDef {
  key: string;
  provider: Provider;
  /** Identifier at the provider (FRED series id, Twelve Data symbol, ...). */
  sourceId: string;
  title: string;
  /** Human-readable originating institution, e.g. "Board of Governors of the Federal Reserve System (via FRED)". */
  source: string;
  frequency: Frequency;
  units: string;
  /** Public page for the series, for attribution. */
  url?: string;
  notes?: string;
}

export type DataStatus = "LIVE" | "RECENT" | "STALE" | "UNAVAILABLE";

export interface SeriesMeta {
  key: string;
  provider: Provider;
  sourceId: string;
  /** When this app last attempted/succeeded retrieving the series. */
  fetchedAt: string | null;
  /** Upstream "last updated" timestamp when the provider exposes it (FRED API does). */
  sourceLastUpdated: string | null;
  fetchStatus: "ok" | "error" | "never";
  fetchError: string | null;
  synthetic: boolean;
}

export interface SeriesData {
  meta: SeriesMeta;
  obs: Obs[];
}

export type SeriesMap = Record<string, SeriesData | undefined>;

export type Polarity = "higher_worse" | "lower_worse" | "context";

export type Signal = "normal" | "watch" | "elevated" | "severe" | "unavailable";

export type Trend = "deteriorating" | "stable" | "improving" | "context" | "unknown";

export type ScoreId = "recession" | "inflation" | "financial";

/**
 * How a raw stress metric is converted into a 0-100 stress score.
 * - percentile: point-in-time historical percentile (polarity-adjusted).
 * - absolute: piecewise-linear map through economically motivated anchors that
 *   correspond to the 50 / 75 / 90 signal boundaries.
 */
export type StressMapping =
  | { kind: "percentile" }
  | {
      kind: "absolute";
      /** Metric values that map to stress 0, 50 (watch), 75 (elevated), 90 (severe), 100. */
      anchors: [number, number, number, number, number];
      rationale: string;
    };

export interface IndicatorMembership {
  score: ScoreId;
  category: string;
  cluster: string;
}

export interface ChangeSet {
  w1: number | null;
  m1: number | null;
  m3: number | null;
  m6: number | null;
  m12: number | null;
}

export interface IndicatorReading {
  id: string;
  name: string;
  group: string;
  units: string;
  frequency: Frequency;
  polarity: Polarity;
  polarityNote: string;
  available: boolean;
  unavailableReason?: string;
  latest: Obs | null;
  changes: ChangeSet;
  changeMode: "diff" | "pct";
  percentile: number | null;
  /** Percentile over trailing 12 months (credit spreads etc.). */
  percentile12m: number | null;
  zScore: number | null;
  historyStart: string | null;
  historyYears: number | null;
  stressMetricLabel: string;
  stressMetric: number | null;
  /** False for context/display-only indicators that do not enter any score. */
  scored: boolean;
  stress: number | null;
  signal: Signal;
  trend: Trend;
  status: DataStatus;
  sources: {
    key: string;
    title: string;
    source: string;
    sourceId: string;
    url?: string;
    frequency: Frequency;
    lastObservation: string | null;
    fetchedAt: string | null;
    sourceLastUpdated: string | null;
    synthetic: boolean;
  }[];
  memberships: IndicatorMembership[];
  description: string;
  extra?: Record<string, number | string | boolean | null>;
}

export interface Contribution {
  indicatorId: string;
  name: string;
  category: string;
  cluster: string;
  /** Effective weight within the composite (0-1), after cluster pooling and renormalisation. */
  effectiveWeight: number;
  /** Nominal weight if every indicator were available. */
  nominalWeight: number;
  stress: number | null;
  /** Points contributed to the 0-100 composite (effectiveWeight * stress). */
  points: number;
  signal: Signal;
  status: DataStatus;
}

export interface ClusterResult {
  id: string;
  label: string;
  weight: number;
  score: number | null;
  members: string[];
  available: string[];
}

export interface CategoryResult {
  id: string;
  label: string;
  nominalWeight: number;
  effectiveWeight: number;
  score: number | null;
  signal: Signal;
  clusters: ClusterResult[];
  coverage: number;
}

export interface CompositeScore {
  id: ScoreId | "overall";
  label: string;
  score: number | null;
  signal: Signal;
  categories: CategoryResult[];
  contributions: Contribution[];
  coverage: number;
  freshness: number;
  confidence: number;
}
