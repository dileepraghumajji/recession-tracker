/**
 * Point-in-time evaluation: indicator scores → clusters → factors → master
 * score and model confidence. Pure and deterministic.
 */
import { addDays, daysBetween, indexAtOrBefore, percentileOf, piecewise } from "@/platform/lib/timeseries";
import { bandFor, type SentimentConfig } from "../config";
import { CRITICAL_FACTORS, INDICATORS, type IndicatorDef } from "../indicators";
import { CROSS_CHECKS, SERIES_BY_KEY } from "../series";
import { FACTOR_IDS, type ConfidenceResult, type DataStatus, type FactorId, type FactorResult, type Frequency, type IndicatorReading, type MasterScore, type Obs, type SeriesMap } from "../types";

export interface Prepared {
  def: IndicatorDef;
  metric: Obs[];
  /** Effective frequency of the metric as computed (a daily source may fall back to a monthly one). */
  frequency: Frequency;
}

/** Frequency implied by the median spacing of the most recent observations. */
export function inferFrequency(obs: Obs[]): Frequency | null {
  if (obs.length < 4) return null;
  const tail = obs.slice(-11);
  const gaps = tail.slice(1).map((o, i) => daysBetween(tail[i].date, o.date)).sort((a, b) => a - b);
  const med = gaps[Math.floor(gaps.length / 2)];
  return med <= 4 ? "D" : med <= 10 ? "W" : med <= 45 ? "M" : "Q";
}

export function prepare(series: SeriesMap): Prepared[] {
  const get = (k: string) => series[k]?.obs ?? [];
  return INDICATORS.map((def) => {
    let metric: Obs[] = [];
    try {
      metric = def.compute(get).filter((o) => Number.isFinite(o.value));
    } catch (e) {
      console.error(`indicator ${def.id} failed`, e);
    }
    return { def, metric, frequency: inferFrequency(metric) ?? def.frequency };
  });
}

/** Publication lags applied when evaluating past dates (avoid look-ahead on monthly/quarterly releases). */
export const PUBLICATION_LAG: Record<Frequency, number> = { D: 0, W: 5, M: 45, Q: 100 };
const FRESH: Record<Frequency, [number, number, number]> = {
  // [LIVE ≤, RECENT ≤, usable ≤] days of age
  D: [4, 10, 45],
  W: [10, 21, 75],
  M: [75, 120, 240],
  Q: [150, 250, 450],
};
export const STATUS_FACTOR: Record<DataStatus, number> = { LIVE: 1, RECENT: 0.85, STALE: 0.4, UNAVAILABLE: 0 };
/** Minimum share of (coverage-weighted) factor weight required to publish a master score. */
export const MIN_SCORE_COVERAGE = 0.35;

export function statusFor(freq: Frequency, lastDate: string | null, asOf: string): { status: DataStatus; usable: boolean } {
  if (!lastDate) return { status: "UNAVAILABLE", usable: false };
  const age = daysBetween(lastDate, asOf);
  const [live, recent, usable] = FRESH[freq];
  return { status: age <= live ? "LIVE" : age <= recent ? "RECENT" : "STALE", usable: age <= usable };
}

export interface LiteReading {
  id: string;
  factor: FactorId;
  cluster: string;
  score: number | null;
  status: DataStatus;
  value: number | null;
  date: string | null;
}

function scoreMetric(p: Prepared, i: number, cfg: SentimentConfig): { score: number | null; reason?: string } {
  const s = p.def.scoring;
  if (!s) return { score: null };
  const last = p.metric[i];
  if (s.kind === "anchors") return { score: piecewise(last.value, s.xs, s.ys) };
  const start = addDays(last.date, -Math.round(cfg.percentileYears * 365.25));
  const j = Math.max(0, indexAtOrBefore(p.metric, start) + 1);
  const spanDays = daysBetween(p.metric[0].date, last.date);
  if (spanDays >= cfg.minHistoryYears * 365 && i - j >= 12) {
    // Same as percentileOf over metric[j..i-1], without allocating (hot path for history/backtests).
    let below = 0;
    let equal = 0;
    for (let k = j; k < i; k++) {
      const v = p.metric[k].value;
      if (v < last.value) below++;
      else if (v === last.value) equal++;
    }
    const pct = ((below + 0.5 * equal) / (i - j)) * 100;
    return { score: s.polarity === 1 ? pct : 100 - pct };
  }
  if (s.fallback) return { score: piecewise(last.value, s.fallback.xs, s.fallback.ys) };
  return { score: null, reason: `insufficient history (<${cfg.minHistoryYears}y) for a percentile score` };
}

/** Fast evaluation used for history, momentum and backtests. */
export function evaluateLite(p: Prepared, asOf: string, cfg: SentimentConfig, historical: boolean): LiteReading {
  const cutoff = historical ? addDays(asOf, -PUBLICATION_LAG[p.frequency]) : asOf;
  const i = indexAtOrBefore(p.metric, cutoff);
  const base = { id: p.def.id, factor: p.def.factor, cluster: p.def.cluster };
  if (i < 0) return { ...base, score: null, status: "UNAVAILABLE", value: null, date: null };
  const last = p.metric[i];
  const st = statusFor(p.frequency, last.date, cutoff);
  if (!st.usable) return { ...base, score: null, status: "STALE", value: last.value, date: last.date };
  return { ...base, score: scoreMetric(p, i, cfg).score, status: st.status, value: last.value, date: last.date };
}

function valueAt(obs: Obs[], date: string): number | null {
  const i = indexAtOrBefore(obs, date);
  return i >= 0 ? obs[i].value : null;
}

function pctOver(obs: Obs[], i: number, years: number): number | null {
  const last = obs[i];
  const start = addDays(last.date, -Math.round(years * 365.25));
  if (obs[0].date > addDays(start, 120)) return null; // not enough history for this window
  const j = Math.max(0, indexAtOrBefore(obs, start) + 1);
  const vals: number[] = [];
  for (let k = j; k <= i; k++) vals.push(obs[k].value);
  return percentileOf(vals, last.value);
}

/** Full reading with changes, historical percentiles and data-quality metadata (current as-of only). */
export function evaluateFull(p: Prepared, series: SeriesMap, asOf: string, cfg: SentimentConfig): IndicatorReading {
  const d = p.def;
  const lite = evaluateLite(p, asOf, cfg, false);
  const withData = d.series.filter((k) => (series[k]?.obs.length ?? 0) > 0);
  const primary = withData[0] ?? d.series[0];
  const meta = series[primary]?.meta;
  const def = SERIES_BY_KEY[primary];
  const i = indexAtOrBefore(p.metric, asOf);
  const change = (days: number) => {
    if (i < 0) return null;
    const ref = valueAt(p.metric, addDays(p.metric[i].date, -days));
    if (ref === null) return null;
    const v = p.metric[i].value;
    return d.changeMode === "pct" ? (ref !== 0 ? (v / ref - 1) * 100 : null) : v - ref;
  };
  const scoring = i >= 0 ? scoreMetric(p, i, cfg) : { score: null };
  const available = lite.status !== "UNAVAILABLE" && lite.date !== null && (lite.score !== null || d.scoring === null) && statusFor(p.frequency, lite.date, asOf).usable;
  let reason: string | undefined;
  if (!available) {
    if (!withData.length) reason = `no data: ${d.series.map((k) => SERIES_BY_KEY[k]?.source ?? k).filter((v, k, a) => a.indexOf(v) === k).join(" / ")} not connected`;
    else if (i < 0) reason = "insufficient data to compute this metric";
    else if (!statusFor(p.frequency, lite.date, asOf).usable) reason = `latest observation ${lite.date} is too old to use`;
    else reason = scoring.reason ?? "unavailable";
  }
  return {
    id: d.id,
    name: d.name,
    factor: d.factor,
    cluster: d.cluster,
    units: d.units,
    frequency: p.frequency,
    scored: d.scoring !== null,
    available,
    unavailableReason: reason,
    value: lite.value,
    date: lite.date,
    changes: { d1: change(1), w1: change(7), m1: change(30), m3: change(91) },
    score: available ? lite.score : null,
    pct5y: i >= 0 ? pctOver(p.metric, i, 5) : null,
    pct10y: i >= 0 ? pctOver(p.metric, i, 10) : null,
    pct15y: i >= 0 ? pctOver(p.metric, i, 15) : null,
    status: lite.date ? statusFor(p.frequency, lite.date, asOf).status : "UNAVAILABLE",
    source: def?.source ?? "—",
    sourceKind: def?.kind ?? "market",
    sourceIds: withData.length ? withData : d.series,
    fetchedAt: meta?.fetchedAt ?? null,
    synthetic: meta?.synthetic ?? false,
    polarityNote: d.polarityNote,
    description: d.description,
  };
}

// ------------------------------------------------------------------ composite

/** Caps any single weight at `cap` (share of total), redistributing the excess proportionally. */
export function capWeights(weights: number[], cap: number): number[] {
  const n = weights.filter((w) => w > 0).length;
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) return weights.map(() => 0);
  if (n * cap <= 1) return weights.map((w) => (w > 0 ? 1 / n : 0)); // cap infeasible: equal weights
  let w = weights.map((x) => x / total);
  const capped = new Set<number>();
  for (let iter = 0; iter < weights.length; iter++) {
    const over = w.findIndex((x, i) => x > cap + 1e-12 && !capped.has(i));
    if (over < 0) break;
    for (let i = 0; i < w.length; i++) if (w[i] > cap + 1e-12) capped.add(i);
    const freeTotal = w.reduce((s, x, i) => (capped.has(i) ? s : s + x), 0);
    const remaining = 1 - capped.size * cap;
    w = w.map((x, i) => (capped.has(i) ? cap : freeTotal > 0 ? (x / freeTotal) * remaining : 0));
  }
  return w;
}

export function computeFactors(readings: LiteReading[], cfg: SentimentConfig): FactorResult[] {
  const byCluster = new Map<string, LiteReading[]>();
  for (const r of readings) {
    const k = `${r.factor}/${r.cluster}`;
    byCluster.set(k, [...(byCluster.get(k) ?? []), r]);
  }
  const raw = FACTOR_IDS.map((fid) => {
    const fc = cfg.factors[fid];
    const clusters = fc.clusters.map((c) => {
      const members = byCluster.get(`${fid}/${c.id}`) ?? [];
      const avail = members.filter((m) => m.score !== null);
      return {
        id: c.id,
        label: c.label,
        weight: c.weight,
        score: avail.length ? avail.reduce((s, m) => s + (m.score as number), 0) / avail.length : null,
        members: members.map((m) => m.id),
        available: avail.map((m) => m.id),
        fresh: avail.length ? avail.reduce((s, m) => s + STATUS_FACTOR[m.status], 0) / avail.length : 0,
      };
    });
    const tw = clusters.reduce((s, c) => s + c.weight, 0);
    const aw = clusters.reduce((s, c) => s + (c.score !== null ? c.weight : 0), 0);
    const score = aw > 0 ? clusters.reduce((s, c) => s + (c.score !== null ? c.weight * c.score : 0), 0) / aw : null;
    const freshness = aw > 0 ? clusters.reduce((s, c) => s + (c.score !== null ? c.weight * c.fresh : 0), 0) / aw : 0;
    return { fid, fc, clusters, coverage: tw > 0 ? aw / tw : 0, score, freshness };
  });
  // Factors with partial coverage carry proportionally less weight (min 50% of nominal).
  const base = raw.map((f) => (f.score !== null ? f.fc.weight * (0.5 + 0.5 * f.coverage) : 0));
  const eff = capWeights(base, cfg.maxFactorShare);
  return raw.map((f, i) => ({
    id: f.fid,
    label: f.fc.label,
    nominalWeight: f.fc.weight,
    effectiveWeight: eff[i],
    score: f.score,
    coverage: f.coverage,
    points: f.score !== null ? eff[i] * (f.score - 50) : 0,
    clusters: f.clusters.map(({ fresh: _f, ...c }) => c),
    freshness: f.freshness,
  }));
}

export function scoreCoverage(factors: FactorResult[]): number {
  const total = factors.reduce((s, f) => s + f.nominalWeight, 0);
  return total ? factors.reduce((s, f) => s + (f.score !== null ? f.nominalWeight * f.coverage : 0), 0) / total : 0;
}

export function masterFromFactors(factors: FactorResult[]): number | null {
  if (scoreCoverage(factors) < MIN_SCORE_COVERAGE) return null;
  return Math.max(0, Math.min(100, 50 + factors.reduce((s, f) => s + f.points, 0)));
}

export interface CrossCheckResult {
  name: string;
  a: string;
  b: string;
  diffPct: number;
  agree: boolean;
}

export function crossChecks(series: SeriesMap, asOf: string): CrossCheckResult[] {
  const out: CrossCheckResult[] = [];
  for (const c of CROSS_CHECKS) {
    const a = series[c.a]?.obs ?? [];
    const b = series[c.b]?.obs ?? [];
    const ib = indexAtOrBefore(b, asOf);
    if (ib < 0 || !a.length) continue;
    const bObs = b[ib];
    if (daysBetween(bObs.date, asOf) > c.maxAgeDays) continue;
    const ia = indexAtOrBefore(a, addDays(bObs.date, c.mode === "abs" ? 15 : 0));
    if (ia < 0 || Math.abs(daysBetween(a[ia].date, bObs.date)) > 20) continue;
    const va = a[ia].value;
    const diff = c.mode === "pct" ? (Math.abs(va - bObs.value) / Math.abs(bObs.value)) * 100 : Math.abs(va - bObs.value);
    out.push({ name: c.name, a: c.a, b: c.b, diffPct: diff, agree: diff <= c.tolerance });
  }
  return out;
}

export function computeConfidence(factors: FactorResult[], checks: CrossCheckResult[], readings: LiteReading[]): ConfidenceResult {
  const coverage = scoreCoverage(factors);
  const avail = factors.filter((f) => f.score !== null);
  const aw = avail.reduce((s, f) => s + f.nominalWeight * f.coverage, 0);
  const freshness = aw > 0 ? avail.reduce((s, f) => s + f.nominalWeight * f.coverage * f.freshness, 0) / aw : 0;
  const critical = CRITICAL_FACTORS.map((id) => factors.find((f) => f.id === id)!);
  const criticalCoverage = critical.reduce((s, f) => s + (f.score !== null ? Math.min(1, f.coverage / 0.5) : 0), 0) / critical.length;
  const agreement = checks.length ? checks.filter((c) => c.agree).length / checks.length : 1;
  let score = 100 * (0.35 * coverage + 0.25 * freshness + 0.25 * criticalCoverage + 0.15 * agreement);
  if (masterFromFactors(factors) === null) score = Math.min(score, 20);
  const reasons: string[] = [];
  const missing = factors.filter((f) => f.score === null);
  if (missing.length) reasons.push(`Unavailable factors: ${missing.map((f) => f.label).join(", ")}.`);
  const partial = factors.filter((f) => f.score !== null && f.coverage < 0.6);
  if (partial.length) reasons.push(`Partial coverage: ${partial.map((f) => `${f.label} (${Math.round(f.coverage * 100)}%)`).join(", ")}.`);
  const missingCritical = critical.filter((f) => f.score === null);
  if (missingCritical.length) reasons.push(`Core Indian-market segments not covered: ${missingCritical.map((f) => f.label).join(", ")}.`);
  const stale = readings.filter((r) => r.status === "STALE" && r.score === null && r.date !== null);
  if (stale.length) reasons.push(`${stale.length} indicator(s) excluded because their latest data is too old.`);
  const staleUsed = readings.filter((r) => r.status === "STALE" && r.score !== null);
  if (staleUsed.length) reasons.push(`${staleUsed.length} indicator(s) are stale but still used at reduced confidence.`);
  for (const c of checks.filter((x) => !x.agree)) reasons.push(`Sources disagree on ${c.name} (${c.diffPct.toFixed(2)}${c.a.startsWith("gsec") ? " pp" : "%"} apart).`);
  if (!reasons.length) reasons.push("All factor groups covered with current data.");
  return {
    score: Math.round(score),
    coverage,
    freshness,
    criticalCoverage,
    agreement,
    reasons,
    disagreements: checks.filter((c) => !c.agree).map((c) => ({ name: c.name, a: c.a, b: c.b, diffPct: c.diffPct })),
  };
}

export function evaluateMaster(prepared: Prepared[], series: SeriesMap, asOf: string, cfg: SentimentConfig, historical = false): { master: MasterScore; readings: LiteReading[] } {
  const readings = prepared.map((p) => evaluateLite(p, asOf, cfg, historical));
  const factors = computeFactors(readings, cfg);
  const score = masterFromFactors(factors);
  const confidence = computeConfidence(factors, historical ? [] : crossChecks(series, asOf), readings);
  return { master: { score, band: bandFor(score, cfg), factors, confidence }, readings };
}
