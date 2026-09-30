/**
 * Pure time-series helpers. All functions are causal (a value at date t only
 * depends on observations dated <= t) so derived series can be truncated at any
 * as-of date without look-ahead.
 */
import type { Obs } from "./types";

const DAY_MS = 86_400_000;

export function toTime(date: string): number {
  return Date.parse(date + "T00:00:00Z");
}

export function fromTime(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromTime(toTime(date) + days * DAY_MS);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toTime(b) - toTime(a)) / DAY_MS);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Index of the last observation dated <= date, or -1. Assumes ascending dates. */
export function indexAtOrBefore(obs: Obs[], date: string): number {
  let lo = 0;
  let hi = obs.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (obs[mid].date <= date) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export function valueAtOrBefore(obs: Obs[], date: string): Obs | null {
  const i = indexAtOrBefore(obs, date);
  return i >= 0 ? obs[i] : null;
}

export function truncate(obs: Obs[], asOf: string): Obs[] {
  const i = indexAtOrBefore(obs, asOf);
  return i < 0 ? [] : obs.slice(0, i + 1);
}

export function sortAndClean(obs: Obs[]): Obs[] {
  const clean = obs.filter((o) => Number.isFinite(o.value) && /^\d{4}-\d{2}-\d{2}$/.test(o.date));
  clean.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // de-duplicate dates (keep last)
  const out: Obs[] = [];
  for (const o of clean) {
    if (out.length && out[out.length - 1].date === o.date) out[out.length - 1] = o;
    else out.push(o);
  }
  return out;
}

/** a - b aligned on a's dates using b's latest value at or before each date (max staleness in days). */
export function spread(a: Obs[], b: Obs[], maxStaleDays = 7): Obs[] {
  const out: Obs[] = [];
  let j = -1;
  for (const o of a) {
    while (j + 1 < b.length && b[j + 1].date <= o.date) j++;
    if (j < 0) continue;
    if (daysBetween(b[j].date, o.date) > maxStaleDays) continue;
    out.push({ date: o.date, value: o.value - b[j].value });
  }
  return out;
}

/**
 * Change over a calendar lag. For each observation, compares with the latest
 * observation at or before (date - lagDays), requiring that reference to be
 * within `tolerance` days of the target date.
 */
export function lagChange(obs: Obs[], lagDays: number, mode: "diff" | "pct", tolerance = 20): Obs[] {
  const out: Obs[] = [];
  let j = -1;
  for (let i = 0; i < obs.length; i++) {
    const target = addDays(obs[i].date, -lagDays);
    while (j + 1 < i && obs[j + 1].date <= target) j++;
    if (j < 0) continue;
    if (daysBetween(obs[j].date, target) > tolerance) continue;
    const ref = obs[j].value;
    if (mode === "diff") out.push({ date: obs[i].date, value: obs[i].value - ref });
    else if (ref !== 0) out.push({ date: obs[i].date, value: (obs[i].value / ref - 1) * 100 });
  }
  return out;
}

export function yoy(obs: Obs[], tolerance = 20): Obs[] {
  return lagChange(obs, 365, "pct", tolerance);
}

/** Simple trailing moving average over n observations. */
export function movingAverage(obs: Obs[], n: number): Obs[] {
  const out: Obs[] = [];
  let sum = 0;
  for (let i = 0; i < obs.length; i++) {
    sum += obs[i].value;
    if (i >= n) sum -= obs[i - n].value;
    if (i >= n - 1) out.push({ date: obs[i].date, value: sum / n });
  }
  return out;
}

/** Observation-to-observation difference. */
export function diff(obs: Obs[]): Obs[] {
  const out: Obs[] = [];
  for (let i = 1; i < obs.length; i++) out.push({ date: obs[i].date, value: obs[i].value - obs[i - 1].value });
  return out;
}

/** Trailing min over a calendar window (inclusive of current observation). */
export function rollingMin(obs: Obs[], windowDays: number): Obs[] {
  const out: Obs[] = [];
  const dq: number[] = [];
  let start = 0;
  for (let i = 0; i < obs.length; i++) {
    const cutoff = addDays(obs[i].date, -windowDays);
    while (start <= i && obs[start].date < cutoff) start++;
    while (dq.length && dq[0] < start) dq.shift();
    while (dq.length && obs[dq[dq.length - 1]].value >= obs[i].value) dq.pop();
    dq.push(i);
    out.push({ date: obs[i].date, value: obs[dq[0]].value });
  }
  return out;
}

/** Percent drawdown from trailing high over a calendar window (<= 0). */
export function drawdown(obs: Obs[], windowDays = 365): Obs[] {
  const out: Obs[] = [];
  const dq: number[] = [];
  let start = 0;
  for (let i = 0; i < obs.length; i++) {
    const cutoff = addDays(obs[i].date, -windowDays);
    while (start <= i && obs[start].date < cutoff) start++;
    while (dq.length && dq[0] < start) dq.shift();
    while (dq.length && obs[dq[dq.length - 1]].value <= obs[i].value) dq.pop();
    dq.push(i);
    const hi = obs[dq[0]].value;
    out.push({ date: obs[i].date, value: hi > 0 ? (obs[i].value / hi - 1) * 100 : 0 });
  }
  return out;
}

/**
 * Sahm Rule (real-time formulation): 3-month moving average of the unemployment
 * rate minus the minimum of the 3-month moving averages over the previous 12 months.
 */
export function sahmRule(unrate: Obs[]): Obs[] {
  const ma3 = movingAverage(unrate, 3);
  const out: Obs[] = [];
  for (let i = 12; i < ma3.length; i++) {
    let min = Infinity;
    for (let k = i - 12; k < i; k++) min = Math.min(min, ma3[k].value);
    out.push({ date: ma3[i].date, value: ma3[i].value - min });
  }
  return out;
}

/** Point-in-time percentile (0-100) of `value` within `history` values (mid-rank for ties). */
export function percentileOf(history: number[], value: number): number | null {
  if (history.length === 0) return null;
  let below = 0;
  let equal = 0;
  for (const h of history) {
    if (h < value) below++;
    else if (h === value) equal++;
  }
  return ((below + 0.5 * equal) / history.length) * 100;
}

export function meanStd(values: number[]): { mean: number; std: number } | null {
  if (values.length < 2) return null;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let ss = 0;
  for (const v of values) ss += (v - mean) ** 2;
  return { mean, std: Math.sqrt(ss / (values.length - 1)) };
}

export function zScore(history: number[], value: number): number | null {
  const ms = meanStd(history);
  if (!ms || ms.std === 0) return null;
  return (value - ms.mean) / ms.std;
}

/** Last observation at or before each month end. Output dated at month end. */
export function monthEnds(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + "T00:00:00Z");
  let y = s.getUTCFullYear();
  let m = s.getUTCMonth();
  for (;;) {
    const me = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
    if (me > end) break;
    if (me >= start) out.push(me);
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Piecewise-linear interpolation through (x_i, y_i); x may be ascending or descending. */
export function piecewise(x: number, xs: number[], ys: number[]): number {
  const asc = xs[xs.length - 1] >= xs[0];
  const X = asc ? xs : [...xs].reverse();
  const Y = asc ? ys : [...ys].reverse();
  if (x <= X[0]) return Y[0];
  if (x >= X[X.length - 1]) return Y[Y.length - 1];
  for (let i = 1; i < X.length; i++) {
    if (x <= X[i]) {
      const t = (x - X[i - 1]) / (X[i] - X[i - 1] || 1);
      return Y[i - 1] + t * (Y[i] - Y[i - 1]);
    }
  }
  return Y[Y.length - 1];
}

export function round(x: number | null | undefined, dp = 2): number | null {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
