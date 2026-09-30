/**
 * Domain types for the India Market Sentiment Terminal.
 * Scores are on a 0-100 scale where 0 = extreme fear / risk-off and
 * 100 = extreme greed / risk-on. They describe conditions, not forecasts.
 */
import type { DataStatus, Frequency, Obs } from "@/platform/lib/types";

export type { DataStatus, Frequency, Obs };

export const FACTOR_IDS = [
  "momentum",
  "breadth",
  "derivatives",
  "premium_flow",
  "volatility",
  "flows",
  "liquidity",
  "currency",
  "bonds",
  "credit",
  "global",
  "commodities",
  "valuation",
  "earnings",
  "macro",
  "retail",
] as const;
export type FactorId = (typeof FACTOR_IDS)[number];

/**
 * Where a series comes from:
 *  - fred: fetched from FRED (official US/international statistics, some India series)
 *  - market: licensed market-data provider or authenticated ingestion (NSE/BSE prices, breadth, flows, option chains)
 *  - manual: low-frequency official releases loaded via ingestion (RBI, AMFI, MOSPI, SEBI ...)
 *  - derived: computed by this app (e.g. option-chain aggregates)
 */
export type SourceKind = "fred" | "market" | "manual" | "derived";

export interface SeriesDef {
  key: string;
  title: string;
  /** Originating institution, e.g. "NSE", "RBI", "Federal Reserve Board (via FRED)". */
  source: string;
  kind: SourceKind;
  /** FRED series id or provider symbol. */
  sourceId: string;
  frequency: Frequency;
  units: string;
  url?: string;
  notes?: string;
}

export interface SeriesMeta {
  key: string;
  kind: SourceKind;
  sourceId: string;
  /** Who supplied the data (fred, ingest:<name>, synthetic, engine). */
  origin: string;
  fetchedAt: string | null;
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

// ------------------------------------------------------------------ options

export type OptionType = "CE" | "PE";

/** One option-chain row as stored (spec §40). IV in percent (e.g. 14.2). */
export interface OptionRecord {
  underlying: string;
  expiry: string;
  strike: number;
  type: OptionType;
  ltp: number | null;
  /** Previous session close, used to classify price change. */
  prevClose?: number | null;
  volume: number;
  oi: number;
  changeInOi: number;
  iv: number | null;
  /** IV at the previous session close / previous snapshot, when available. */
  prevIv?: number | null;
  bid?: number | null;
  ask?: number | null;
  timestamp: string;
  /** Contract lot size in force at `timestamp` (historical lot sizes must be used for history). */
  lotSize: number;
}

export interface OptionChainSnapshot {
  underlying: string;
  spot: number;
  timestamp: string;
  /** NSE reports option volume in contracts; some vendors report quantity (shares). */
  volumeUnit: "contracts" | "shares";
  records: OptionRecord[];
  source: string;
  synthetic: boolean;
}

// ------------------------------------------------------------------ scoring

export interface IndicatorReading {
  id: string;
  name: string;
  factor: FactorId;
  cluster: string;
  units: string;
  frequency: Frequency;
  /** Whether it enters the score (false = context/display only). */
  scored: boolean;
  available: boolean;
  unavailableReason?: string;
  value: number | null;
  date: string | null;
  changes: { d1: number | null; w1: number | null; m1: number | null; m3: number | null };
  /** 0-100, higher = greed / risk-on. */
  score: number | null;
  /** Historical percentiles of the raw value (not polarity-adjusted). */
  pct5y: number | null;
  pct10y: number | null;
  pct15y: number | null;
  status: DataStatus;
  source: string;
  sourceKind: SourceKind;
  sourceIds: string[];
  fetchedAt: string | null;
  synthetic: boolean;
  polarityNote: string;
  description: string;
}

export interface ClusterResult {
  id: string;
  label: string;
  weight: number;
  score: number | null;
  members: string[];
  available: string[];
}

export interface FactorResult {
  id: FactorId;
  label: string;
  nominalWeight: number;
  /** Share of the master score after renormalisation and the single-factor cap (0-1). */
  effectiveWeight: number;
  score: number | null;
  /** Share of cluster weight with data (0-1). */
  coverage: number;
  /** Points contributed relative to neutral 50: effectiveWeight * (score - 50). */
  points: number;
  clusters: ClusterResult[];
  freshness: number;
}

export interface Band {
  /** Upper bound (exclusive) of the band on the 0-100 scale; last band ends at 100. */
  max: number;
  label: string;
  /** Five-way headline classification. */
  cls: "EXTREME FEAR" | "FEAR" | "NEUTRAL" | "GREED" | "EXTREME GREED";
  emoji: string;
  tone: "fear-strong" | "fear" | "neutral" | "greed" | "greed-strong";
}

export interface ConfidenceResult {
  score: number;
  coverage: number;
  freshness: number;
  criticalCoverage: number;
  agreement: number;
  reasons: string[];
  disagreements: { name: string; a: string; b: string; diffPct: number }[];
}

export interface MasterScore {
  score: number | null;
  band: Band | null;
  factors: FactorResult[];
  confidence: ConfidenceResult;
}
