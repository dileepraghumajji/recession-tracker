/**
 * Causal series transforms used by the indicator catalogue. Every output value
 * at date t depends only on inputs dated <= t, so metrics can be truncated at
 * any as-of date without look-ahead.
 */
import { drawdown, lagChange, movingAverage, rollingMin } from "@/platform/lib/timeseries";
import type { Obs } from "../types";

/** % return over a calendar lag (tolerates weekends/holidays). */
export function ret(obs: Obs[], days: number): Obs[] {
  return lagChange(obs, days, "pct", days <= 7 ? 4 : days <= 45 ? 7 : 12);
}

/** Change (difference) over a calendar lag. */
export function chg(obs: Obs[], days: number): Obs[] {
  return lagChange(obs, days, "diff", days <= 7 ? 4 : days <= 45 ? 7 : 20);
}

/** % distance of price from its n-observation simple moving average. */
export function distMA(obs: Obs[], n: number): Obs[] {
  return alignBinary(obs, movingAverage(obs, n), (p, m) => (m > 0 ? (p / m - 1) * 100 : null));
}

/** % change of the n-observation SMA over `lag` observations (moving-average slope). */
export function maSlope(obs: Obs[], n: number, lag: number): Obs[] {
  const ma = movingAverage(obs, n);
  const out: Obs[] = [];
  for (let i = lag; i < ma.length; i++) if (ma[i - lag].value > 0) out.push({ date: ma[i].date, value: (ma[i].value / ma[i - lag].value - 1) * 100 });
  return out;
}

/** % below the trailing 52-week high (<= 0). */
export function fromHigh(obs: Obs[]): Obs[] {
  return drawdown(obs, 365);
}

/** % above the trailing 52-week low (>= 0). */
export function fromLow(obs: Obs[]): Obs[] {
  return alignBinary(obs, rollingMin(obs, 365), (p, lo) => (lo > 0 ? (p / lo - 1) * 100 : null));
}

export function rollingSum(obs: Obs[], n: number): Obs[] {
  const out: Obs[] = [];
  let s = 0;
  for (let i = 0; i < obs.length; i++) {
    s += obs[i].value;
    if (i >= n) s -= obs[i - n].value;
    if (i >= n - 1) out.push({ date: obs[i].date, value: s });
  }
  return out;
}

export const rollingMean = (obs: Obs[], n: number) => movingAverage(obs, n);

export function ema(obs: Obs[], n: number): Obs[] {
  const k = 2 / (n + 1);
  const out: Obs[] = [];
  let e: number | null = null;
  for (const o of obs) {
    e = e === null ? o.value : o.value * k + e * (1 - k);
    out.push({ date: o.date, value: e });
  }
  return out;
}

/** Annualised realised volatility (%) of daily log returns over n observations. */
export function realizedVol(obs: Obs[], n: number): Obs[] {
  const r: Obs[] = [];
  for (let i = 1; i < obs.length; i++) if (obs[i - 1].value > 0 && obs[i].value > 0) r.push({ date: obs[i].date, value: Math.log(obs[i].value / obs[i - 1].value) });
  const out: Obs[] = [];
  for (let i = n - 1; i < r.length; i++) {
    let s = 0;
    let s2 = 0;
    for (let k = i - n + 1; k <= i; k++) {
      s += r[k].value;
      s2 += r[k].value ** 2;
    }
    const v = (s2 - (s * s) / n) / (n - 1);
    out.push({ date: r[i].date, value: Math.sqrt(Math.max(v, 0) * 252) * 100 });
  }
  return out;
}

/**
 * Trend strength: Kaufman efficiency ratio over n observations, signed
 * (-1 = perfectly efficient downtrend, +1 = perfectly efficient uptrend).
 */
export function trendStrength(obs: Obs[], n: number): Obs[] {
  const out: Obs[] = [];
  for (let i = n; i < obs.length; i++) {
    let path = 0;
    for (let k = i - n + 1; k <= i; k++) path += Math.abs(obs[k].value - obs[k - 1].value);
    out.push({ date: obs[i].date, value: path > 0 ? (obs[i].value - obs[i - n].value) / path : 0 });
  }
  return out;
}

/** Cumulative sum (e.g. advance/decline line). */
export function cumsum(obs: Obs[]): Obs[] {
  let s = 0;
  return obs.map((o) => ({ date: o.date, value: (s += o.value) }));
}

/**
 * Combine two series on a's dates using b's latest value at or before each date
 * (b may be at most `maxStale` days older). `fn` may return null to skip a date.
 */
export function alignBinary(a: Obs[], b: Obs[], fn: (x: number, y: number) => number | null, maxStale = 7): Obs[] {
  const out: Obs[] = [];
  let j = -1;
  for (const o of a) {
    while (j + 1 < b.length && b[j + 1].date <= o.date) j++;
    if (j < 0) continue;
    if ((Date.parse(o.date) - Date.parse(b[j].date)) / 86_400_000 > maxStale) continue;
    const v = fn(o.value, b[j].value);
    if (v !== null && Number.isFinite(v)) out.push({ date: o.date, value: v });
  }
  return out;
}

/** Mean of several series on the dates of the first one (each other series aligned, max 7d stale). */
export function meanOf(series: Obs[][]): Obs[] {
  const present = series.filter((s) => s.length);
  if (!present.length) return [];
  const [base, ...rest] = present;
  const idx = rest.map(() => -1);
  const out: Obs[] = [];
  for (const o of base) {
    let sum = o.value;
    let n = 1;
    rest.forEach((s, k) => {
      while (idx[k] + 1 < s.length && s[idx[k] + 1].date <= o.date) idx[k]++;
      const j = idx[k];
      if (j >= 0 && (Date.parse(o.date) - Date.parse(s[j].date)) / 86_400_000 <= 7) {
        sum += s[j].value;
        n++;
      }
    });
    if (n === present.length) out.push({ date: o.date, value: sum / n });
  }
  return out;
}

export function mapObs(obs: Obs[], fn: (v: number) => number | null): Obs[] {
  const out: Obs[] = [];
  for (const o of obs) {
    const v = fn(o.value);
    if (v !== null && Number.isFinite(v)) out.push({ date: o.date, value: v });
  }
  return out;
}

/** First non-empty series (preferred source first). */
export function coalesce(...series: Obs[][]): Obs[] {
  return series.find((s) => s.length) ?? [];
}
