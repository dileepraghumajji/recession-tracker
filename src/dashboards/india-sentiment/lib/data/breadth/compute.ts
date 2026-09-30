/**
 * Market breadth of the NSE cash market, computed from each stock's daily
 * candles (Dhan daily candles are adjusted for splits and bonuses, so moving
 * averages and 52-week highs/lows are not distorted by corporate actions).
 *
 * Pure functions only: the job (job.ts) fetches candles stock by stock and adds
 * each stock's contribution to per-date counters; the published series are
 * derived from those counters. Definitions (per stock, per session date d):
 *
 * - advance / decline / unchanged: close(d) vs the stock's previous close (its
 *   previous traded session). Not counted on the stock's first candle.
 * - advancing / declining volume: that day's volume of advancing / declining stocks.
 * - % above N-day moving average (N = 20, 50, 100, 200): close(d) > simple
 *   average of its last N closes (including d). Only stocks with at least N
 *   sessions of history count, in the numerator and the denominator.
 * - new 52-week high / low: high(d) > highest high, or low(d) < lowest low, of
 *   the stock's sessions in the preceding 52 weeks (d-364 … d-1). Only stocks
 *   trading for at least 52 weeks count.
 *
 * Nothing is estimated: a stock without a candle on d simply did not trade on d.
 */
import { addDays } from "@/platform/lib/timeseries";
import type { Obs } from "../../types";

export interface DailyBar {
  date: string;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Raw Dhan daily-candle payload (parallel arrays; epoch seconds). */
export interface CandleArrays {
  high?: number[];
  low?: number[];
  close?: number[];
  volume?: number[];
  timestamp?: number[];
}

export const DMA_WINDOWS = [20, 50, 100, 200] as const;

/** Counter positions in a per-date row. */
export const C = {
  traded: 0,
  adv: 1,
  dec: 2,
  unch: 3,
  advVol: 4,
  decVol: 5,
  n20: 6,
  above20: 7,
  n50: 8,
  above50: 9,
  n100: 10,
  above100: 11,
  n200: 12,
  above200: 13,
  hlEligible: 14,
  newHigh: 15,
  newLow: 16,
} as const;
export const COUNTER_COUNT = 17;

const DMA_SLOTS: Record<(typeof DMA_WINDOWS)[number], [number, number]> = {
  20: [C.n20, C.above20],
  50: [C.n50, C.above50],
  100: [C.n100, C.above100],
  200: [C.n200, C.above200],
};

/** Per-date counters summed over stocks. */
export type Accumulator = Record<string, number[]>;

/** Series this module publishes. Traded value (breadth:up_value / down_value) is not derivable from candles and stays ingestion-only. */
export const BREADTH_OUTPUT_KEYS = [
  "breadth:adv",
  "breadth:dec",
  "breadth:adv_vol",
  "breadth:dec_vol",
  "breadth:new_high",
  "breadth:new_low",
  "breadth:pct_above_20",
  "breadth:pct_above_50",
  "breadth:pct_above_100",
  "breadth:pct_above_200",
] as const;

const IST_OFFSET_MS = 5.5 * 3600_000;
const istDate = (epochSec: number) => new Date(epochSec * 1000 + IST_OFFSET_MS).toISOString().slice(0, 10);
const finitePos = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Candle arrays → one bar per IST date up to `until` (inclusive), sorted.
 * Rows with a missing/non-positive close are dropped (never filled); a missing
 * high/low falls back to the close; a missing volume counts as 0.
 */
export function candlesToBars(c: CandleArrays, until: string): DailyBar[] {
  const ts = c.timestamp ?? [];
  const close = c.close ?? [];
  const byDate = new Map<string, DailyBar>();
  for (let i = 0; i < Math.min(ts.length, close.length); i++) {
    if (!finitePos(close[i]) || typeof ts[i] !== "number") continue;
    const date = istDate(ts[i]);
    if (date > until) continue;
    const cl = close[i];
    const h = c.high?.[i];
    const l = c.low?.[i];
    const v = c.volume?.[i];
    byDate.set(date, {
      date,
      close: cl,
      high: finitePos(h) ? Math.max(h, cl) : cl,
      low: finitePos(l) ? Math.min(l, cl) : cl,
      volume: typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0,
    });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Relative tolerance for "unchanged" (adjusted prices are not rounded to the tick). */
const UNCHANGED_EPS = 1e-9;

/**
 * Adds one stock's contribution for every session in [from, to] to `acc`.
 * `bars` must include enough earlier history (≥ 200 sessions and 52 weeks) for
 * the moving-average and 52-week counts; the job fetches ~15 months extra.
 */
export function addStock(acc: Accumulator, bars: DailyBar[], from: string, to: string): void {
  const n = bars.length;
  if (!n) return;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + bars[i].close;
  // Monotonic deques over the trailing 52-week window of *previous* sessions.
  const maxQ: number[] = [];
  const minQ: number[] = [];
  let maxHead = 0;
  let minHead = 0;
  const firstDate = bars[0].date;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (i > 0) {
      const j = i - 1;
      while (maxQ.length > maxHead && bars[maxQ[maxQ.length - 1]].high <= bars[j].high) maxQ.pop();
      maxQ.push(j);
      while (minQ.length > minHead && bars[minQ[minQ.length - 1]].low >= bars[j].low) minQ.pop();
      minQ.push(j);
    }
    const windowStart = addDays(b.date, -364);
    while (maxQ.length > maxHead && bars[maxQ[maxHead]].date < windowStart) maxHead++;
    while (minQ.length > minHead && bars[minQ[minHead]].date < windowStart) minHead++;
    if (b.date < from || b.date > to) continue;

    const row = (acc[b.date] ??= new Array(COUNTER_COUNT).fill(0));
    row[C.traded]++;
    if (i > 0) {
      const prev = bars[i - 1].close;
      const tol = UNCHANGED_EPS * Math.max(prev, b.close);
      if (b.close > prev + tol) {
        row[C.adv]++;
        row[C.advVol] += b.volume;
      } else if (b.close < prev - tol) {
        row[C.dec]++;
        row[C.decVol] += b.volume;
      } else row[C.unch]++;
    }
    for (const w of DMA_WINDOWS) {
      if (i + 1 < w) continue;
      const [nSlot, aSlot] = DMA_SLOTS[w];
      row[nSlot]++;
      const sma = (prefix[i + 1] - prefix[i + 1 - w]) / w;
      if (b.close > sma * (1 + UNCHANGED_EPS)) row[aSlot]++;
    }
    if (firstDate <= windowStart && maxQ.length > maxHead) {
      row[C.hlEligible]++;
      if (b.high > bars[maxQ[maxHead]].high) row[C.newHigh]++;
      if (b.low < bars[minQ[minHead]].low) row[C.newLow]++;
    }
  }
}

/** Adds `from` into `into` (both per-date counter maps). */
export function mergeAcc(into: Accumulator, from: Accumulator): void {
  for (const [d, row] of Object.entries(from)) {
    const t = (into[d] ??= new Array(COUNTER_COUNT).fill(0));
    for (let k = 0; k < COUNTER_COUNT; k++) t[k] += row[k] ?? 0;
  }
}

export interface PublishOptions {
  /** Official session dates (from the NIFTY 50 index); other dates are never published. */
  sessions: string[];
  /** Publish only dates in [from, to]. */
  from: string;
  to: string;
  /** Minimum stocks behind a published value (and behind each percentage denominator). */
  minStocks?: number;
  /** A session is withheld when fewer stocks traded than this share of the median of its ±10 neighbouring sessions (catches incomplete source data). */
  minTradedRatio?: number;
}

export interface PublishResult {
  series: Record<(typeof BREADTH_OUTPUT_KEYS)[number], Obs[]>;
  /** Sessions in range that were not published, with the reason. */
  withheld: { date: string; reason: string }[];
}

const pct = (a: number, n: number) => Math.round((a / n) * 10000) / 100;

/** Per-date counters → published observations for the official sessions in range. */
export function breadthSeries(acc: Accumulator, opts: PublishOptions): PublishResult {
  const minStocks = opts.minStocks ?? 100;
  const minRatio = opts.minTradedRatio ?? 0.8;
  const series = Object.fromEntries(BREADTH_OUTPUT_KEYS.map((k) => [k, [] as Obs[]])) as PublishResult["series"];
  const withheld: PublishResult["withheld"] = [];
  const sessions = [...new Set(opts.sessions)].sort();
  const traded = sessions.map((d) => acc[d]?.[C.traded] ?? 0);
  for (let i = 0; i < sessions.length; i++) {
    const date = sessions[i];
    if (date < opts.from || date > opts.to) continue;
    const row = acc[date];
    if (!row || row[C.traded] < minStocks) {
      withheld.push({ date, reason: `only ${row?.[C.traded] ?? 0} stocks traded` });
      continue;
    }
    const neighbours: number[] = [];
    for (let k = Math.max(0, i - 10); k < Math.min(sessions.length, i + 11); k++) if (k !== i && traded[k] > 0) neighbours.push(traded[k]);
    neighbours.sort((a, b) => a - b);
    const median = neighbours.length ? neighbours[Math.floor(neighbours.length / 2)] : 0;
    if (median > 0 && row[C.traded] < minRatio * median) {
      withheld.push({ date, reason: `${row[C.traded]} stocks traded vs a typical ${median}: incomplete source data` });
      continue;
    }
    const push = (key: (typeof BREADTH_OUTPUT_KEYS)[number], value: number) => series[key].push({ date, value });
    push("breadth:adv", row[C.adv]);
    push("breadth:dec", row[C.dec]);
    // Split-adjusted volumes can be fractional; the totals are published in whole shares.
    push("breadth:adv_vol", Math.round(row[C.advVol]));
    push("breadth:dec_vol", Math.round(row[C.decVol]));
    if (row[C.hlEligible] >= minStocks) {
      push("breadth:new_high", row[C.newHigh]);
      push("breadth:new_low", row[C.newLow]);
    }
    for (const w of DMA_WINDOWS) {
      const [nSlot, aSlot] = DMA_SLOTS[w];
      if (row[nSlot] >= minStocks) push(`breadth:pct_above_${w}`, pct(row[aSlot], row[nSlot]));
    }
  }
  return { series, withheld };
}
