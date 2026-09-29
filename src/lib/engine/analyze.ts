/**
 * Indicator-level analysis: prepares derived series once per data load and
 * evaluates each indicator at an arbitrary as-of date without look-ahead.
 */
import { INDICATORS, buildDisplay, indicatorFrequency, type IndicatorDef, GROUPS } from "../indicators";
import type { ModelConfig } from "../model-config";
import { SERIES_BY_KEY } from "../series-catalog";
import {
  addDays,
  daysBetween,
  indexAtOrBefore,
  percentileOf,
  piecewise,
  toTime,
  valueAtOrBefore,
  zScore,
} from "../timeseries";
import type { ChangeSet, DataStatus, Frequency, IndicatorReading, Obs, SeriesMap, Signal, Trend } from "../types";

export interface PreparedIndicator {
  def: IndicatorDef;
  frequency: Frequency;
  display: Obs[];
  stressMetric: Obs[];
  available: boolean;
  unavailableReason?: string;
}

/** Days of age (as-of minus observation date) for LIVE / RECENT; beyond = STALE. */
const STATUS_AGE: Record<Frequency, { live: number; recent: number; usable: number }> = {
  D: { live: 5, recent: 12, usable: 45 },
  W: { live: 13, recent: 25, usable: 75 },
  M: { live: 70, recent: 110, usable: 220 },
  Q: { live: 215, recent: 300, usable: 420 },
};

/** Approximate publication lag (days after observation date) used for historical as-of evaluation. */
export const PUBLICATION_LAG: Record<Frequency, number> = { D: 1, W: 7, M: 40, Q: 120 };

export function statusFor(freq: Frequency, lastDate: string | null, asOf: string): DataStatus {
  if (!lastDate) return "UNAVAILABLE";
  const age = daysBetween(lastDate, asOf);
  const t = STATUS_AGE[freq];
  if (age > t.usable) return "UNAVAILABLE";
  if (age <= t.live) return "LIVE";
  if (age <= t.recent) return "RECENT";
  return "STALE";
}

export const STATUS_FACTOR: Record<DataStatus, number> = { LIVE: 1, RECENT: 0.85, STALE: 0.4, UNAVAILABLE: 0 };

export function prepareIndicators(series: SeriesMap): PreparedIndicator[] {
  const raw: Record<string, Obs[]> = {};
  for (const [k, v] of Object.entries(series)) if (v) raw[k] = v.obs;
  return INDICATORS.map((def) => {
    if (def.unavailableReason) {
      return { def, frequency: indicatorFrequency(def), display: [], stressMetric: [], available: false, unavailableReason: def.unavailableReason };
    }
    const missing = def.inputs.filter((k) => !raw[k] || raw[k].length === 0);
    if (missing.length) {
      const reasons = missing.map((k) => {
        const meta = series[k]?.meta;
        const sd = SERIES_BY_KEY[k];
        if (sd?.provider === "manual") return `${sd.title}: proprietary series not loaded (${sd.notes ?? "manual load required"})`;
        if (sd?.provider === "twelvedata" && !process.env.TWELVE_DATA_API_KEY && !meta?.synthetic)
          return `${sd.title}: TWELVE_DATA_API_KEY not configured`;
        if (meta?.fetchError) return `${sd?.title ?? k}: ${meta.fetchError}`;
        return `${sd?.title ?? k}: no data retrieved`;
      });
      return { def, frequency: indicatorFrequency(def), display: [], stressMetric: [], available: false, unavailableReason: reasons.join("; ") };
    }
    const display = buildDisplay(def, raw);
    const stressMetric = def.stress ? (def.stress.derive ? def.stress.derive(display, raw) : display) : [];
    return {
      def,
      frequency: indicatorFrequency(def),
      display,
      stressMetric,
      available: display.length > 0,
      unavailableReason: display.length > 0 ? undefined : "Insufficient observations to derive this indicator",
    };
  });
}

export function signalFor(stress: number | null, cfg: ModelConfig): Signal {
  if (stress === null) return "unavailable";
  if (stress >= cfg.bands.severe) return "severe";
  if (stress >= cfg.bands.elevated) return "elevated";
  if (stress >= cfg.bands.watch) return "watch";
  return "normal";
}

const STRESS_Y = [0, 50, 75, 90, 100];

/** Stress (0-100) of the stress metric at the last observation of `hist`. */
export function stressAt(p: PreparedIndicator, hist: Obs[], cfg: ModelConfig): number | null {
  const spec = p.def.stress;
  if (!spec || hist.length === 0) return null;
  const v = hist[hist.length - 1].value;
  if (spec.mapping.kind === "absolute") {
    return piecewise(v, [...spec.mapping.anchors], STRESS_Y);
  }
  const spanYears = daysBetween(hist[0].date, hist[hist.length - 1].date) / 365.25;
  if (spanYears < cfg.minHistoryYears) return null;
  const pct = percentileOf(
    hist.map((o) => o.value),
    v,
  );
  if (pct === null) return null;
  return spec.polarity === "higher_worse" ? pct : 100 - pct;
}

/**
 * Metric value at which stress equals `target` (used for "what would confirm /
 * invalidate" statements). Uses history up to the last observation.
 */
export function metricForStress(p: PreparedIndicator, hist: Obs[], target: number): number | null {
  const spec = p.def.stress;
  if (!spec || hist.length === 0) return null;
  if (spec.mapping.kind === "absolute") return piecewise(target, STRESS_Y, [...spec.mapping.anchors]);
  const values = hist.map((o) => o.value).sort((a, b) => a - b);
  const q = spec.polarity === "higher_worse" ? target / 100 : 1 - target / 100;
  const idx = Math.min(values.length - 1, Math.max(0, Math.round(q * (values.length - 1))));
  return values[idx];
}

function changeAt(obs: Obs[], lagDays: number, tolerance: number, mode: "diff" | "pct"): number | null {
  if (obs.length < 2) return null;
  const cur = obs[obs.length - 1];
  const target = addDays(cur.date, -lagDays);
  const ref = valueAtOrBefore(obs, target);
  if (!ref || daysBetween(ref.date, target) > tolerance) return null;
  if (mode === "diff") return cur.value - ref.value;
  return ref.value === 0 ? null : (cur.value / ref.value - 1) * 100;
}

export function computeChanges(obs: Obs[], mode: "diff" | "pct"): ChangeSet {
  return {
    w1: changeAt(obs, 7, 4, mode),
    m1: changeAt(obs, 30, 12, mode),
    m3: changeAt(obs, 91, 25, mode),
    m6: changeAt(obs, 182, 35, mode),
    m12: changeAt(obs, 365, 25, mode),
  };
}

export interface AnalyzeOptions {
  /** Apply publication lags (historical/backtest evaluation). */
  publicationLag?: boolean;
  /** Compute the 3M stress trend (costs one extra percentile). */
  withTrend?: boolean;
  /** Full reading (changes, z-scores, sources). Disable for fast history loops. */
  full?: boolean;
  seriesMeta?: SeriesMap;
}

export function analyzeIndicator(p: PreparedIndicator, asOf: string, cfg: ModelConfig, opts: AnalyzeOptions = {}): IndicatorReading {
  const def = p.def;
  const cutoff = opts.publicationLag ? addDays(asOf, -PUBLICATION_LAG[p.frequency]) : asOf;
  const di = indexAtOrBefore(p.display, cutoff);
  const display = di >= 0 ? p.display.slice(0, di + 1) : [];
  const si = indexAtOrBefore(p.stressMetric, cutoff);
  const stressHist = si >= 0 ? p.stressMetric.slice(0, si + 1) : [];
  const latest = display.length ? display[display.length - 1] : null;
  let status = statusFor(p.frequency, latest?.date ?? null, asOf);
  if (opts.publicationLag && latest) {
    // In historical mode, freshness is judged relative to the lag-adjusted cutoff.
    status = statusFor(p.frequency, latest.date, cutoff);
  }
  const available = p.available && latest !== null && status !== "UNAVAILABLE";

  let stress: number | null = null;
  let trend: Trend = "unknown";
  if (available && def.stress && stressHist.length) {
    stress = stressAt(p, stressHist, cfg);
    if (opts.withTrend && stress !== null) {
      const past = stressHist.slice(0, indexAtOrBefore(stressHist, addDays(stressHist[stressHist.length - 1].date, -91)) + 1);
      const pastStress = past.length ? stressAt(p, past, cfg) : null;
      if (pastStress !== null) {
        const d = stress - pastStress;
        trend = d > cfg.trendThreshold ? "deteriorating" : d < -cfg.trendThreshold ? "improving" : "stable";
      }
    }
  }
  if (def.polarity === "context" && !def.stress) trend = "context";

  const full = opts.full !== false;
  const values = full ? display.map((o) => o.value) : [];
  const percentile = full && latest ? percentileOf(values, latest.value) : null;
  let percentile12m: number | null = null;
  if (full && latest && def.percentile12m) {
    const from = addDays(latest.date, -365);
    percentile12m = percentileOf(
      display.filter((o) => o.date >= from).map((o) => o.value),
      latest.value,
    );
  }
  const historyStart = display.length ? display[0].date : null;
  const historyYears = latest && historyStart ? (toTime(latest.date) - toTime(historyStart)) / (365.25 * 86_400_000) : null;

  const sources = def.inputs.map((k) => {
    const sd = SERIES_BY_KEY[k];
    const meta = opts.seriesMeta?.[k]?.meta;
    const obs = opts.seriesMeta?.[k]?.obs;
    return {
      key: k,
      title: sd?.title ?? k,
      source: sd?.source ?? "unknown",
      sourceId: sd?.sourceId ?? k,
      url: sd?.url,
      frequency: sd?.frequency ?? p.frequency,
      lastObservation: obs && obs.length ? obs[obs.length - 1].date : null,
      fetchedAt: meta?.fetchedAt ?? null,
      sourceLastUpdated: meta?.sourceLastUpdated ?? null,
      synthetic: meta?.synthetic ?? false,
    };
  });

  return {
    id: def.id,
    name: def.name,
    group: def.group,
    units: def.units,
    frequency: p.frequency,
    polarity: def.polarity,
    polarityNote: def.polarityNote,
    available,
    unavailableReason: available ? undefined : p.unavailableReason ?? (latest ? "Latest observation is too old to be used" : "No data"),
    latest,
    changes: full ? computeChanges(display, def.changeMode) : { w1: null, m1: null, m3: null, m6: null, m12: null },
    changeMode: def.changeMode,
    percentile,
    percentile12m,
    zScore: full && latest && def.showZ ? zScore(values, latest.value) : null,
    historyStart,
    historyYears,
    stressMetricLabel: def.stress?.label ?? "Not scored",
    stressMetric: stressHist.length ? stressHist[stressHist.length - 1].value : null,
    scored: !!def.stress && def.memberships.length > 0,
    stress,
    signal: def.stress ? signalFor(stress, cfg) : "unavailable",
    trend,
    status: p.available ? status : "UNAVAILABLE",
    sources,
    memberships: def.memberships,
    description: def.description,
    extra: full && def.extras && display.length ? def.extras(display, {}) : undefined,
  };
}

export function groupLabel(id: string): string {
  return GROUPS.find((g) => g.id === id)?.label ?? id;
}
