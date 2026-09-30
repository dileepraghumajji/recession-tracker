/**
 * Point-in-time history, historical analogues and backtest.
 *
 * Every historical score uses only data that would have been published by that
 * date (publication lags for weekly/monthly/quarterly data; trailing-only
 * percentiles). Weights are fixed judgement-based values, not fitted to returns.
 * Backtest statistics are HISTORICAL OBSERVATIONS, not forecasts.
 */
import { addDays, indexAtOrBefore } from "@/platform/lib/timeseries";
import { bandsFor, type SentimentConfig } from "../config";
import { FACTOR_IDS, type FactorId, type Obs, type SeriesMap } from "../types";
import { computeFactors, evaluateLite, masterFromFactors, scoreCoverage, type Prepared } from "./evaluate";

export interface HistoryPoint {
  date: string;
  score: number | null;
  coverage: number;
  factors: Record<FactorId, number | null>;
  /** On the weekly (every 5th trading day) grid used by the backtest. */
  weekly: boolean;
}

/**
 * Trading-day grid from NIFTY (falls back to calendar weeks): weekly points over
 * the full history, daily points over the most recent `dailyDays` sessions.
 */
export function historyGrid(series: SeriesMap, start: string, end: string, dailyDays = 400): { date: string; weekly: boolean }[] {
  const nifty = (series["idx:NIFTY50"]?.obs ?? []).filter((o) => o.date >= start && o.date <= end);
  if (nifty.length < 30) {
    const out: { date: string; weekly: boolean }[] = [];
    for (let d = start; d <= end; d = addDays(d, 7)) out.push({ date: d, weekly: true });
    return out;
  }
  const dailyFrom = Math.max(0, nifty.length - dailyDays);
  const out: { date: string; weekly: boolean }[] = [];
  nifty.forEach((o, i) => {
    const weekly = (nifty.length - 1 - i) % 5 === 0;
    if (weekly || i >= dailyFrom) out.push({ date: o.date, weekly });
  });
  return out;
}

export function scoreHistory(prepared: Prepared[], series: SeriesMap, cfg: SentimentConfig, start: string, end: string): HistoryPoint[] {
  return historyGrid(series, start, end).map(({ date, weekly }) => {
    const readings = prepared.map((p) => evaluateLite(p, date, cfg, true));
    const factors = computeFactors(readings, cfg);
    return {
      date,
      weekly,
      score: masterFromFactors(factors),
      coverage: scoreCoverage(factors),
      factors: Object.fromEntries(factors.map((f) => [f.id, f.score])) as Record<FactorId, number | null>,
    };
  });
}

/** Score at (or just before) a date from a computed history. */
export function historyAt(h: HistoryPoint[], date: string): HistoryPoint | null {
  let lo = 0;
  let hi = h.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (h[mid].date <= date) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans >= 0 ? h[ans] : null;
}

// ------------------------------------------------------------------ analogues

export const ANALOGUE_PERIODS = [
  { id: "gfc2008", label: "2008 Global Financial Crisis", start: "2008-01-08", end: "2009-03-09" },
  { id: "taper2013", label: "2013 Taper Tantrum", start: "2013-05-22", end: "2013-09-04" },
  { id: "china2015", label: "2015 China / global slowdown", start: "2015-08-10", end: "2016-02-29" },
  { id: "nbfc2018", label: "2018 NBFC / credit stress", start: "2018-08-29", end: "2018-10-26" },
  { id: "covid2020", label: "2020 COVID crash", start: "2020-02-20", end: "2020-03-24" },
  { id: "rates2022", label: "2022 global inflation / rate shock", start: "2022-01-18", end: "2022-06-17" },
  { id: "election2024", label: "2024 election volatility", start: "2024-05-13", end: "2024-06-07" },
] as const;

export interface AnalogueResult {
  id: string;
  label: string;
  start: string;
  end: string;
  profile: Record<FactorId, number | null>;
  score: number | null;
  similarity: number | null;
  common: number;
  similarities: { id: FactorId; now: number; then: number }[];
  differences: { id: FactorId; now: number; then: number }[];
  text: string;
}

export function analogues(history: HistoryPoint[], current: Record<FactorId, number | null>, labels: Record<FactorId, string>): AnalogueResult[] {
  return ANALOGUE_PERIODS.map((p) => {
    const pts = history.filter((h) => h.date >= p.start && h.date <= p.end);
    const profile = Object.fromEntries(
      FACTOR_IDS.map((id) => {
        const v = pts.map((h) => h.factors[id]).filter((x): x is number => x !== null);
        return [id, v.length ? v.reduce((a, b) => a + b, 0) / v.length : null];
      }),
    ) as Record<FactorId, number | null>;
    const sc = pts.map((h) => h.score).filter((x): x is number => x !== null);
    const score = sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null;
    const common = FACTOR_IDS.filter((id) => profile[id] !== null && current[id] !== null).map((id) => ({ id, now: current[id] as number, then: profile[id] as number }));
    const similarity = common.length ? Math.max(0, 100 - common.reduce((s, c) => s + Math.abs(c.now - c.then), 0) / common.length) : null;
    const similarities = common.filter((c) => Math.abs(c.now - c.then) <= 10).sort((a, b) => Math.abs(a.now - a.then) - Math.abs(b.now - b.then));
    const differences = common.filter((c) => Math.abs(c.now - c.then) > 10).sort((a, b) => Math.abs(b.now - b.then) - Math.abs(a.now - a.then));
    const name = (id: FactorId) => labels[id].toLowerCase();
    let text: string;
    if (common.length < 4) text = `Insufficient overlapping data to compare with ${p.label} (${common.length} common factor groups).`;
    else {
      const sim = similarities.slice(0, 3).map((c) => name(c.id));
      const diff = differences.slice(0, 3).map((c) => `${name(c.id)} (${c.now.toFixed(0)} now vs ${c.then.toFixed(0)} then)`);
      text = `Current conditions share ${similarities.length} of ${common.length} factor characteristics with the ${p.label}${sim.length ? ` (${sim.join(", ")})` : ""}${diff.length ? ` but differ in ${diff.join(", ")}` : ""}.`;
    }
    return { id: p.id, label: p.label, start: p.start, end: p.end, profile, score, similarity, common: common.length, similarities, differences, text };
  });
}

// ------------------------------------------------------------------ backtest

export const HORIZONS = [
  { id: "d1", label: "1 day", days: 1 },
  { id: "w1", label: "1 week", days: 5 },
  { id: "m1", label: "1 month", days: 21 },
  { id: "m3", label: "3 months", days: 63 },
  { id: "m6", label: "6 months", days: 126 },
] as const;

export interface BucketStats {
  band: string;
  horizon: string;
  n: number;
  /** Approximate number of non-overlapping observations. */
  independentN: number;
  mean: number | null;
  median: number | null;
  positive: number | null;
  avgMaxDrawdown: number | null;
  worstMaxDrawdown: number | null;
}

export interface BacktestResult {
  start: string | null;
  end: string | null;
  samples: number;
  minCoverage: number;
  buckets: BucketStats[];
  notes: string[];
}

export function backtest(history: HistoryPoint[], nifty: Obs[], cfg: SentimentConfig, minCoverage = 0.5): BacktestResult {
  const bands = bandsFor(cfg);
  const pts = history.filter((h) => h.weekly && h.score !== null && h.coverage >= minCoverage);
  const rows: { band: string; h: string; ret: number; mdd: number }[] = [];
  for (const p of pts) {
    const i = indexAtOrBefore(nifty, p.date);
    if (i < 0 || nifty[i].date !== p.date) continue;
    const band = bands.find((b) => (p.score as number) < b.max)!.label;
    for (const h of HORIZONS) {
      const j = i + h.days;
      if (j >= nifty.length) continue;
      let peak = nifty[i].value;
      let mdd = 0;
      for (let k = i + 1; k <= j; k++) {
        peak = Math.max(peak, nifty[k].value);
        mdd = Math.min(mdd, (nifty[k].value / peak - 1) * 100);
      }
      rows.push({ band, h: h.id, ret: (nifty[j].value / nifty[i].value - 1) * 100, mdd });
    }
  }
  const buckets: BucketStats[] = [];
  for (const b of bands)
    for (const h of HORIZONS) {
      const r = rows.filter((x) => x.band === b.label && x.h === h.id);
      const rets = r.map((x) => x.ret).sort((a, c) => a - c);
      const n = rets.length;
      buckets.push({
        band: b.label,
        horizon: h.id,
        n,
        independentN: Math.floor(n / Math.max(1, Math.ceil(h.days / 5))),
        mean: n ? rets.reduce((a, c) => a + c, 0) / n : null,
        median: n ? (n % 2 ? rets[(n - 1) / 2] : (rets[n / 2 - 1] + rets[n / 2]) / 2) : null,
        positive: n ? (rets.filter((x) => x > 0).length / n) * 100 : null,
        avgMaxDrawdown: n ? r.reduce((a, c) => a + c.mdd, 0) / n : null,
        worstMaxDrawdown: n ? Math.min(...r.map((x) => x.mdd)) : null,
      });
    }
  return {
    start: pts[0]?.date ?? null,
    end: pts[pts.length - 1]?.date ?? null,
    samples: pts.length,
    minCoverage,
    buckets,
    notes: [
      "HISTORICAL OBSERVATIONS — not forecasts or expected returns.",
      "Scores are reconstructed point-in-time: each date uses only data published by then (publication lags applied) and trailing-only percentiles.",
      "Weekly sampling; forward windows overlap for horizons longer than one week, so the number of independent observations (shown) is much smaller than the sample count.",
      "Index-level returns (NIFTY 50 price index, excluding dividends) avoid single-stock survivorship bias; index membership changes are inherent to the index.",
      "Weights and thresholds are judgement-based and were not optimised on these results (to limit data snooping and overfitting).",
      "Dates with less than the minimum factor coverage are excluded.",
    ],
  };
}
