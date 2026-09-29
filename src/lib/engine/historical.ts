/**
 * Historical evaluation: runs the SAME scoring methodology month by month using
 * only data dated before each month (with approximate publication lags), then
 * derives a backtest against NBER recession dates and period comparisons.
 *
 * Limitations (displayed in the UI): FRED provides today's revised data, not
 * real-time vintages; some series have short histories so coverage varies over
 * time; weights are judgemental and were NOT fitted to these recessions.
 */
import type { ModelConfig } from "../model-config";
import { addDays, monthEnds, todayISO } from "../timeseries";
import type { ScoreId } from "../types";
import type { PreparedIndicator } from "./analyze";
import { CONFLUENCE_GROUPS, groupScores } from "./confluence";
import { evaluateScores } from "./snapshot";
import { NBER_RECESSIONS } from "../nber";

export { NBER_RECESSIONS };

export const KEY_INDICATORS = [
  "unrate",
  "sahm",
  "payrolls_3m",
  "claims_initial",
  "spread_10y3m",
  "spread_10y2y",
  "ust10y",
  "ust2y",
  "fedfunds",
  "baa10y",
  "hy_oas",
  "nfci",
  "vix",
  "core_cpi_yoy",
  "cpi_yoy",
  "be10y",
  "indpro_yoy",
  "houst",
  "umcsent",
  "mortgage30",
] as const;

export interface MonthRecord {
  date: string;
  recession: number | null;
  inflation: number | null;
  financial: number | null;
  overall: number | null;
  coverage: number;
  categories: Record<string, number | null>;
  groups: Record<string, number | null>;
  indicators: Record<string, number | null>;
  inRecession: boolean;
}

export function inRecession(date: string): boolean {
  const month = date.slice(0, 7) + "-01";
  return NBER_RECESSIONS.some((r) => month > r.peak && month <= r.trough);
}

export function runHistorical(prepared: PreparedIndicator[], cfg: ModelConfig, start = "1970-01-31", end = todayISO()): MonthRecord[] {
  // Longer minimum history for historical percentiles so early readings are not
  // driven by a handful of observations.
  const hcfg: ModelConfig = { ...cfg, minHistoryYears: Math.max(cfg.minHistoryYears, 5) };
  const out: MonthRecord[] = [];
  for (const d of monthEnds(start, end)) {
    const { readings, scores } = evaluateScores(prepared, d, hcfg, { publicationLag: true });
    const categories: Record<string, number | null> = {};
    for (const c of scores.recession.categories) categories[`recession.${c.id}`] = c.score;
    for (const c of scores.inflation.categories) categories[`inflation.${c.id}`] = c.score;
    for (const c of scores.financial.categories) categories[`financial.${c.id}`] = c.score;
    const indicators: Record<string, number | null> = {};
    for (const id of KEY_INDICATORS) {
      const r = readings.find((x) => x.id === id);
      indicators[id] = r && r.available ? (r.latest?.value ?? null) : null;
    }
    out.push({
      date: d,
      recession: scores.recession.score,
      inflation: scores.inflation.score,
      financial: scores.financial.score,
      overall: scores.overall.score,
      coverage: scores.recession.coverage,
      categories,
      groups: groupScores(scores.recession),
      indicators,
      inRecession: inRecession(d),
    });
  }
  return out;
}

// ------------------------------------------------------------------ BACKTEST

export interface BacktestParams {
  threshold: number;
  sustainMonths: number;
  horizonMonths: number;
  minCoverage: number;
  score: ScoreId;
}

export const DEFAULT_BACKTEST: BacktestParams = { threshold: 60, sustainMonths: 2, horizonMonths: 18, minCoverage: 0.5, score: "recession" };

export interface Episode {
  start: string;
  confirmed: string;
  end: string;
  maxScore: number;
  classification: "true_signal" | "false_positive" | "unresolved";
  recession?: string;
}

export interface RecessionEval {
  name: string;
  peak: string;
  trough: string;
  evaluable: boolean;
  coverageAtPeak: number | null;
  detected: boolean;
  firstSignal: string | null;
  leadMonths: number | null;
  scoreAtPeak: number | null;
  maxScore12mBefore: number | null;
}

export interface BacktestResult {
  params: BacktestParams;
  start: string;
  end: string;
  recessions: RecessionEval[];
  episodes: Episode[];
  summary: {
    evaluable: number;
    detected: number;
    falseNegatives: number;
    falsePositives: number;
    unresolved: number;
    avgLeadMonths: number | null;
    medianLeadMonths: number | null;
    shareOfExpansionMonthsSignalling: number | null;
  };
  phases: { label: string; mean: number | null; n: number }[];
  eventStudy: { offset: number; mean: number | null; min: number | null; max: number | null; n: number }[];
  sensitivity: { threshold: number; detected: number; falseNegatives: number; falsePositives: number; avgLeadMonths: number | null }[];
  series: { date: string; score: number | null; coverage: number; inRecession: boolean }[];
  caveats: string[];
}

function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

function evaluate(records: MonthRecord[], p: BacktestParams): Omit<BacktestResult, "sensitivity" | "series" | "caveats" | "eventStudy" | "phases"> {
  const val = (r: MonthRecord) => (r.coverage >= p.minCoverage ? r[p.score] : null);
  const episodes: Episode[] = [];
  let run: { start: string; count: number; max: number; confirmed?: string } | null = null;
  const lastDate = records.length ? records[records.length - 1].date : todayISO();
  const flush = (endDate: string) => {
    if (run && run.confirmed) {
      episodes.push({ start: run.start, confirmed: run.confirmed, end: endDate, maxScore: run.max, classification: "false_positive" });
    }
    run = null;
  };
  let prevDate = "";
  for (const r of records) {
    const v = val(r);
    if (v !== null && v >= p.threshold) {
      if (!run) run = { start: r.date, count: 0, max: v };
      run.count++;
      run.max = Math.max(run.max, v);
      if (!run.confirmed && run.count >= p.sustainMonths) run.confirmed = r.date;
    } else if (run) {
      flush(prevDate);
    }
    prevDate = r.date;
  }
  if (run) flush(lastDate);

  const firstEval = records.find((r) => r.coverage >= p.minCoverage && r[p.score] !== null)?.date ?? null;
  const recessions: RecessionEval[] = NBER_RECESSIONS.map((rec) => {
    const windowStart = addDays(rec.peak, -Math.round(p.horizonMonths * 30.44));
    const evaluable = firstEval !== null && firstEval <= windowStart;
    const atPeak = records.find((r) => r.date.slice(0, 7) === rec.peak.slice(0, 7));
    const before = records.filter((r) => r.date < rec.peak && r.date >= addDays(rec.peak, -366));
    const vals = before.map(val).filter((x): x is number => x !== null);
    const ep = episodes
      .filter((e) => e.confirmed >= windowStart && e.confirmed <= addDays(rec.trough, 31))
      .sort((a, b) => (a.confirmed < b.confirmed ? -1 : 1))[0];
    // An episode that began before the window but is still running at the window start also counts.
    const ongoing = episodes.find((e) => e.confirmed < windowStart && e.end >= windowStart);
    const hit = ep ?? ongoing;
    if (hit) {
      hit.classification = "true_signal";
      hit.recession = rec.name;
    }
    const firstSignal = hit ? (hit.confirmed < windowStart ? windowStart : hit.confirmed) : null;
    return {
      name: rec.name,
      peak: rec.peak,
      trough: rec.trough,
      evaluable,
      coverageAtPeak: atPeak?.coverage ?? null,
      detected: !!hit,
      firstSignal,
      leadMonths: firstSignal ? monthsBetween(firstSignal, rec.peak) : null,
      scoreAtPeak: atPeak ? val(atPeak) : null,
      maxScore12mBefore: vals.length ? Math.max(...vals) : null,
    };
  });
  // Episodes too recent to judge are "unresolved" rather than false positives.
  const resolveCutoff = addDays(lastDate, -Math.round(p.horizonMonths * 30.44));
  for (const e of episodes) if (e.classification === "false_positive" && e.confirmed > resolveCutoff) e.classification = "unresolved";
  // Episodes that start inside a recession are coincident, not false positives.
  for (const e of episodes) if (e.classification === "false_positive" && inRecession(e.confirmed)) e.classification = "true_signal";

  const ev = recessions.filter((r) => r.evaluable);
  const leads = ev.filter((r) => r.detected && r.leadMonths !== null).map((r) => r.leadMonths as number);
  const sorted = [...leads].sort((a, b) => a - b);
  const expansion = records.filter((r) => !r.inRecession && val(r) !== null);
  const signalling = expansion.filter((r) => (val(r) as number) >= p.threshold).length;
  return {
    params: p,
    start: firstEval ?? records[0]?.date ?? "",
    end: lastDate,
    recessions,
    episodes,
    summary: {
      evaluable: ev.length,
      detected: ev.filter((r) => r.detected).length,
      falseNegatives: ev.filter((r) => !r.detected).length,
      falsePositives: episodes.filter((e) => e.classification === "false_positive" && (!firstEval || e.confirmed >= firstEval)).length,
      unresolved: episodes.filter((e) => e.classification === "unresolved").length,
      avgLeadMonths: leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : null,
      medianLeadMonths: sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null,
      shareOfExpansionMonthsSignalling: expansion.length ? signalling / expansion.length : null,
    },
  };
}

export function runBacktest(records: MonthRecord[], params: Partial<BacktestParams> = {}): BacktestResult {
  const p: BacktestParams = { ...DEFAULT_BACKTEST, ...params };
  const base = evaluate(records, p);
  const val = (r: MonthRecord) => (r.coverage >= p.minCoverage ? r[p.score] : null);

  const eventStudy: BacktestResult["eventStudy"] = [];
  for (let off = -24; off <= 24; off++) {
    const vals: number[] = [];
    for (const rec of base.recessions.filter((r) => r.evaluable)) {
      const [y, mo] = rec.peak.split("-").map(Number);
      const dt = new Date(Date.UTC(y, mo - 1 + off + 1, 0)).toISOString().slice(0, 10);
      const r = records.find((x) => x.date === dt);
      const v = r ? val(r) : null;
      if (v !== null) vals.push(v);
    }
    eventStudy.push({
      offset: off,
      n: vals.length,
      mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      min: vals.length ? Math.min(...vals) : null,
      max: vals.length ? Math.max(...vals) : null,
    });
  }

  const phase = (label: string, pred: (r: MonthRecord) => boolean) => {
    const vals = records.filter(pred).map(val).filter((x): x is number => x !== null);
    return { label, n: vals.length, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
  };
  const within = (d: string, a: string, b: string) => d >= a && d <= b;
  const phases = [
    phase("12 months before peak", (r) => NBER_RECESSIONS.some((x) => within(r.date, addDays(x.peak, -365), x.peak))),
    phase("During recession", (r) => r.inRecession),
    phase("12 months after trough", (r) => NBER_RECESSIONS.some((x) => within(r.date, addDays(x.trough, 31), addDays(x.trough, 396)))),
    phase(
      "Other expansion months",
      (r) => !r.inRecession && !NBER_RECESSIONS.some((x) => within(r.date, addDays(x.peak, -365), x.peak) || within(r.date, addDays(x.trough, 31), addDays(x.trough, 396))),
    ),
  ];

  const sensitivity = [45, 50, 55, 60, 65, 70, 75].map((t) => {
    const e = evaluate(records, { ...p, threshold: t });
    return { threshold: t, detected: e.summary.detected, falseNegatives: e.summary.falseNegatives, falsePositives: e.summary.falsePositives, avgLeadMonths: e.summary.avgLeadMonths };
  });

  return {
    ...base,
    eventStudy,
    phases,
    sensitivity,
    series: records.map((r) => ({ date: r.date, score: val(r), coverage: r.coverage, inRecession: r.inRecession })),
    caveats: [
      "Uses today's revised data from FRED, not the data available in real time (no vintage/ALFRED data). Revisions can make historical signals look cleaner than they were.",
      "Publication lags are approximated (daily 1d, weekly 7d, monthly 40d, quarterly 120d).",
      "Percentiles are computed point-in-time (expanding window, minimum 5 years of history), so no future data enters any historical score.",
      "Indicator coverage varies over time: several series (ICE credit spreads, breakevens, JOLTS, VIX, SLOOS) start decades after others. Months below the minimum coverage are excluded.",
      "Only ~7-8 recessions are available. Weights and thresholds were set judgementally beforehand and are NOT optimised to these episodes; the sensitivity table shows how results vary with the threshold rather than picking the best one.",
      "A signal is defined as the score staying at or above the threshold for the required consecutive months, dated when that is first confirmed. A detection counts if the signal is confirmed between the horizon before the NBER peak and the trough.",
    ],
  };
}

// ------------------------------------------------------- PERIOD COMPARISON

export const COMPARISON_PERIODS = [
  { id: "2000-01", label: "2000–01 (dot-com bust)", start: "2000-03-01", end: "2001-11-30" },
  { id: "2007-09", label: "2007–09 (global financial crisis)", start: "2007-06-01", end: "2009-06-30" },
  { id: "2019-20", label: "2019–20 (late cycle → pandemic)", start: "2019-06-01", end: "2020-06-30" },
  { id: "2022", label: "2022 (inflation shock)", start: "2022-01-01", end: "2022-12-31" },
  { id: "2023-24", label: "2023–24 (disinflation, inverted curve)", start: "2023-01-01", end: "2024-12-31" },
] as const;

export interface PeriodProfile {
  id: string;
  label: string;
  start: string;
  end: string;
  months: number;
  scores: Record<string, number | null>;
  groups: Record<string, number | null>;
  indicators: Record<string, number | null>;
  coverage: number | null;
}

export interface Comparison {
  current: PeriodProfile;
  periods: (PeriodProfile & {
    distance: number | null;
    similarities: string[];
    differences: string[];
  })[];
  dimensions: { id: string; label: string }[];
  note: string;
}

function mean(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function profile(records: MonthRecord[], id: string, label: string, start: string, end: string): PeriodProfile {
  const rs = records.filter((r) => r.date >= start && r.date <= end);
  const scores: Record<string, number | null> = {
    recession: mean(rs.map((r) => r.recession)),
    inflation: mean(rs.map((r) => r.inflation)),
    financial: mean(rs.map((r) => r.financial)),
    overall: mean(rs.map((r) => r.overall)),
  };
  const groups: Record<string, number | null> = {};
  for (const g of CONFLUENCE_GROUPS) groups[g.id] = mean(rs.map((r) => r.groups[g.id] ?? null));
  const indicators: Record<string, number | null> = {};
  for (const k of KEY_INDICATORS) indicators[k] = mean(rs.map((r) => r.indicators[k] ?? null));
  return { id, label, start, end, months: rs.length, scores, groups, indicators, coverage: mean(rs.map((r) => r.coverage)) };
}

export function comparePeriods(records: MonthRecord[]): Comparison {
  const last = records.length ? records[records.length - 1].date : todayISO();
  const current = profile(records, "current", "Current (last 3 months)", addDays(last, -92), last);
  const dims: { id: string; label: string; get: (p: PeriodProfile) => number | null }[] = [
    { id: "inflation", label: "Inflation Stress", get: (p) => p.scores.inflation },
    { id: "financial", label: "Financial Market Stress", get: (p) => p.scores.financial },
    ...CONFLUENCE_GROUPS.map((g) => ({ id: g.id, label: g.label, get: (p: PeriodProfile) => p.groups[g.id] ?? null })),
  ];
  const periods = COMPARISON_PERIODS.map((cp) => {
    const p = profile(records, cp.id, cp.label, cp.start, cp.end);
    const diffs = dims
      .map((d) => {
        const a = d.get(current);
        const b = d.get(p);
        return { d, a, b, delta: a !== null && b !== null ? a - b : null };
      })
      .filter((x) => x.delta !== null) as { d: (typeof dims)[number]; a: number; b: number; delta: number }[];
    const distance = diffs.length >= 3 ? Math.sqrt(diffs.reduce((s, x) => s + x.delta * x.delta, 0) / diffs.length) : null;
    const similarities = diffs.filter((x) => Math.abs(x.delta) < 10).map((x) => `${x.d.label}: ${x.a.toFixed(0)} now vs ${x.b.toFixed(0)} then`);
    const differences = diffs
      .filter((x) => Math.abs(x.delta) >= 10)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .map((x) => `${x.d.label}: ${x.a.toFixed(0)} now vs ${x.b.toFixed(0)} then (${x.delta > 0 ? "higher" : "lower"} today)`);
    return { ...p, distance, similarities, differences };
  });
  return {
    current,
    periods,
    dimensions: dims.map((d) => ({ id: d.id, label: d.label })),
    note:
      "All five reference periods are always shown, including dissimilar ones. Distance is the root-mean-square difference across category stress scores (lower = more similar on these dimensions only). Similarity on these dimensions does not imply similar outcomes; historical averages use revised data.",
  };
}
