/**
 * Snapshot orchestrator: evaluates every indicator and composite at "now" and
 * at past dates (for 1W/1M/3M changes and the score history chart).
 */
import type { ModelConfig } from "../model-config";
import { addDays, todayISO } from "../timeseries";
import type { CompositeScore, DataStatus, IndicatorReading, ScoreId, SeriesMap } from "../types";
import { analyzeIndicator, signalFor, type PreparedIndicator } from "./analyze";
import { computeConfluence, groupScores, type Confluence } from "./confluence";
import { computeEnergy, type EnergyComponent } from "./energy";
import { buildExplanation, buildWatchList, type Explanation, type WatchItem } from "./explain";
import { computeRatesModule, type RatesModule } from "./rates-module";
import { classifyRegime, type RegimeResult } from "./regime";
import { computeComposite, computeOverall } from "./scoring";

export interface ScorePoint {
  date: string;
  recession: number | null;
  inflation: number | null;
  financial: number | null;
  overall: number | null;
}

export interface ScoreSet {
  recession: CompositeScore;
  inflation: CompositeScore;
  financial: CompositeScore;
  overall: CompositeScore;
}

export interface DashboardSignal {
  id: string;
  label: string;
  score: number | null;
  signal: ReturnType<typeof signalFor>;
  source: string;
}

export interface Snapshot {
  asOf: string;
  generatedAt: string;
  dataMode: "live" | "demo";
  scores: ScoreSet;
  scoreChanges: Record<ScoreId | "overall", { w1: number | null; m1: number | null; m3: number | null }>;
  scoreHistory: ScorePoint[];
  regime: RegimeResult;
  confluence: Confluence;
  rates: RatesModule;
  energy: EnergyComponent;
  indicators: IndicatorReading[];
  explanation: Explanation;
  watchNext: WatchItem[];
  dashboardSignals: DashboardSignal[];
  dataQuality: {
    freshness: number;
    coverage: number;
    confidence: number;
    confidenceLabel: "High" | "Moderate" | "Low";
    counts: Record<DataStatus, number>;
    lastFetchedAt: string | null;
    fetchErrors: { key: string; error: string }[];
    syntheticSeries: number;
  };
}

export function evaluateScores(
  prepared: PreparedIndicator[],
  asOf: string,
  cfg: ModelConfig,
  opts: { publicationLag?: boolean; full?: boolean; withTrend?: boolean; series?: SeriesMap } = {},
): { readings: IndicatorReading[]; scores: ScoreSet } {
  const readings = prepared.map((p) =>
    analyzeIndicator(p, asOf, cfg, {
      publicationLag: opts.publicationLag,
      full: opts.full ?? false,
      withTrend: opts.withTrend ?? false,
      seriesMeta: opts.series,
    }),
  );
  const recession = computeComposite("recession", readings, cfg);
  const inflation = computeComposite("inflation", readings, cfg);
  const financial = computeComposite("financial", readings, cfg);
  const overall = computeOverall({ recession, inflation, financial }, cfg);
  return { readings, scores: { recession, inflation, financial, overall } };
}

function pt(date: string, s: ScoreSet): ScorePoint {
  return { date, recession: s.recession.score, inflation: s.inflation.score, financial: s.financial.score, overall: s.overall.score };
}

export function buildSnapshot(prepared: PreparedIndicator[], series: SeriesMap, cfg: ModelConfig, opts: { asOf?: string; dataMode?: "live" | "demo" } = {}): Snapshot {
  const asOf = opts.asOf ?? todayISO();
  const now = evaluateScores(prepared, asOf, cfg, { full: true, withTrend: true, series });
  const byId: Record<string, IndicatorReading> = Object.fromEntries(now.readings.map((r) => [r.id, r]));
  const prepById: Record<string, PreparedIndicator> = Object.fromEntries(prepared.map((p) => [p.def.id, p]));

  // Weekly history over the past year (light evaluation).
  const history: ScorePoint[] = [];
  const past: Record<number, ScoreSet> = {};
  for (let k = 52; k >= 1; k--) {
    const d = addDays(asOf, -7 * k);
    const s = evaluateScores(prepared, d, cfg).scores;
    history.push(pt(d, s));
    past[k] = s;
  }
  history.push(pt(asOf, now.scores));
  const w1 = past[1];
  const m1 = past[4] ?? null; // ~28 days
  const m3 = past[13] ?? null; // ~91 days

  const delta = (a: number | null, b: number | null | undefined) => (a === null || b === null || b === undefined ? null : a - b);
  const scoreChanges = {} as Snapshot["scoreChanges"];
  for (const id of ["recession", "inflation", "financial", "overall"] as const) {
    scoreChanges[id] = {
      w1: delta(now.scores[id].score, w1?.[id].score),
      m1: delta(now.scores[id].score, m1?.[id].score),
      m3: delta(now.scores[id].score, m3?.[id].score),
    };
  }

  const confluence = computeConfluence(now.scores.recession, m3 ? groupScores(m3.recession) : null, cfg);
  const rates = computeRatesModule(byId);
  const energy = computeEnergy(byId, now.scores.inflation);
  const groups = groupScores(now.scores.recession);
  const rCat = (id: string) => now.scores.recession.categories.find((c) => c.id === id)?.score ?? null;
  const regime = classifyRegime({
    recession: now.scores.recession.score,
    inflation: now.scores.inflation.score,
    financial: now.scores.financial.score,
    labor: groups.labor,
    activity: groups.manufacturing,
    credit: rCat("credit_financial"),
    curve: rCat("curve_rates"),
    breakevens: now.scores.inflation.categories.find((c) => c.id === "market_expectations")?.score ?? null,
    confluenceStressed: confluence.stressed,
    longEndPressure: rates.longEndPressure,
    confidence: now.scores.recession.confidence,
  });

  const explanation = buildExplanation({
    recession: now.scores.recession,
    recessionPast1m: m1?.recession ?? null,
    recessionPast3m: m3?.recession ?? null,
    inflation: now.scores.inflation,
    inflationPast1m: m1?.inflation ?? null,
    financial: now.scores.financial,
    financialPast1m: m1?.financial ?? null,
    readings: byId,
    prepared: prepById,
    confluence,
    rates,
    energy,
    regime,
    cfg,
  });
  const watchNext = buildWatchList(now.scores.recession, now.scores.financial, byId, prepById, cfg);

  const dashboardSignals: DashboardSignal[] = [
    { id: "credit", label: "Credit Stress", score: rCat("credit_financial"), signal: signalFor(rCat("credit_financial"), cfg), source: "Recession › Credit / Financial" },
    { id: "labor", label: "Labor Stress", score: groups.labor, signal: signalFor(groups.labor, cfg), source: "Recession › Growth / Labor (labour clusters)" },
    { id: "manufacturing", label: "Manufacturing / Activity", score: groups.manufacturing, signal: signalFor(groups.manufacturing, cfg), source: "Recession › Growth / Labor (surveys, activity)" },
    { id: "housing", label: "Housing", score: rCat("housing"), signal: signalFor(rCat("housing"), cfg), source: "Recession › Housing" },
    { id: "consumer", label: "Consumer", score: rCat("consumer"), signal: signalFor(rCat("consumer"), cfg), source: "Recession › Consumer" },
    { id: "equities", label: "Equities", score: rCat("equity"), signal: signalFor(rCat("equity"), cfg), source: "Recession › Equity / Market" },
    { id: "curve", label: "Yield Curve", score: rCat("curve_rates"), signal: signalFor(rCat("curve_rates"), cfg), source: "Recession › Yield Curve / Rates" },
    { id: "inflation", label: "Inflation", score: now.scores.inflation.score, signal: now.scores.inflation.signal, source: "Inflation Stress score" },
  ];

  const counts: Record<DataStatus, number> = { LIVE: 0, RECENT: 0, STALE: 0, UNAVAILABLE: 0 };
  for (const r of now.readings) counts[r.status]++;
  let lastFetchedAt: string | null = null;
  const fetchErrors: { key: string; error: string }[] = [];
  let syntheticSeries = 0;
  for (const [k, v] of Object.entries(series)) {
    if (!v) continue;
    if (v.meta.fetchedAt && (!lastFetchedAt || v.meta.fetchedAt > lastFetchedAt)) lastFetchedAt = v.meta.fetchedAt;
    if (v.meta.fetchStatus === "error" && v.meta.fetchError) fetchErrors.push({ key: k, error: v.meta.fetchError });
    if (v.meta.synthetic) syntheticSeries++;
  }
  const o = now.scores.overall;
  const confidenceLabel = o.confidence >= 0.8 ? "High" : o.confidence >= 0.6 ? "Moderate" : "Low";

  return {
    asOf,
    generatedAt: new Date().toISOString(),
    dataMode: opts.dataMode ?? "live",
    scores: now.scores,
    scoreChanges,
    scoreHistory: history,
    regime,
    confluence,
    rates,
    energy,
    indicators: now.readings,
    explanation,
    watchNext,
    dashboardSignals,
    dataQuality: {
      freshness: o.freshness,
      coverage: o.coverage,
      confidence: o.confidence,
      confidenceLabel,
      counts,
      lastFetchedAt,
      fetchErrors,
      syntheticSeries,
    },
  };
}
