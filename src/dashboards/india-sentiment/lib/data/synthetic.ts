/**
 * SYNTHETIC DEMO DATA — for UI development and automated tests only.
 *
 * Deterministic series generated from a stylised NIFTY path (shaped loosely
 * around well-known episodes) and a latent sentiment factor derived from it.
 * Values are NOT real; every page shows a prominent warning in demo mode and
 * every indicator is labelled SYNTHETIC. Historical-analogue and backtest
 * results in demo mode are circular and meaningless.
 */
import { addDays, fromTime, toTime, todayISO } from "@/platform/lib/timeseries";
import { OPTION_UNDERLYINGS, SERIES } from "../series";
import type { Obs, OptionChainSnapshot, OptionRecord, SeriesDef } from "../types";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(Math.max(r(), 1e-9))) * Math.cos(2 * Math.PI * r());
}

type Anchor = [string, number];
function interp(anchors: Anchor[], date: string): number {
  const t = toTime(date);
  if (t <= toTime(anchors[0][0])) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const t1 = toTime(anchors[i][0]);
    if (t <= t1) {
      const t0 = toTime(anchors[i - 1][0]);
      return anchors[i - 1][1] + ((t - t0) / (t1 - t0)) * (anchors[i][1] - anchors[i - 1][1]);
    }
  }
  return anchors[anchors.length - 1][1];
}

const START = "2004-01-01";

// Stylised NIFTY shape (approximate turning points only).
const NIFTY_PATH: Anchor[] = [
  ["2004-01-01", 1900], ["2004-05-17", 1400], ["2006-05-10", 3700], ["2006-06-14", 2700], ["2008-01-08", 6300], ["2008-10-27", 2550], ["2009-03-09", 2600],
  ["2010-11-05", 6300], ["2011-12-20", 4550], ["2013-05-20", 6200], ["2013-08-28", 5300], ["2015-03-03", 9000], ["2016-02-29", 6900], ["2018-08-29", 11750],
  ["2018-10-26", 10000], ["2020-01-17", 12350], ["2020-03-24", 7600], ["2021-10-18", 18600], ["2022-06-17", 15300], ["2023-12-29", 21700], ["2024-05-31", 22550],
  ["2024-06-04", 21900], ["2024-09-27", 26250], ["2025-03-04", 22100], ["2025-09-30", 24600], ["2026-06-30", 25900], ["2026-09-30", 25300],
];
const USDINR: Anchor[] = [["2004-01-01", 45.5], ["2007-12-01", 39.4], ["2009-03-01", 51.2], ["2011-07-01", 44.4], ["2013-08-28", 68.5], ["2014-06-01", 59.5], ["2016-02-01", 68.3], ["2018-10-10", 74.3], ["2020-04-01", 76.5], ["2022-10-20", 83.2], ["2024-06-01", 83.4], ["2025-02-10", 87.5], ["2026-09-30", 86.6]];
const GSEC10: Anchor[] = [["2004-01-01", 5.2], ["2008-07-15", 9.4], ["2008-12-31", 5.3], ["2011-10-01", 8.9], ["2013-08-20", 9.2], ["2017-01-01", 6.4], ["2018-09-01", 8.1], ["2020-05-01", 5.8], ["2022-06-01", 7.5], ["2024-01-01", 7.2], ["2025-06-01", 6.3], ["2026-09-30", 6.45]];
const REPO: Anchor[] = [["2004-01-01", 6], ["2008-08-01", 9], ["2009-04-21", 4.75], ["2011-10-25", 8.5], ["2013-01-29", 7.75], ["2014-01-28", 8], ["2016-10-04", 6.25], ["2019-02-07", 6.25], ["2020-05-22", 4], ["2022-05-04", 4.4], ["2023-02-08", 6.5], ["2025-02-07", 6.25], ["2025-06-06", 5.5], ["2026-09-30", 5.25]];
const BRENT: Anchor[] = [["2004-01-01", 30], ["2008-07-03", 143], ["2008-12-24", 36], ["2011-04-08", 126], ["2014-06-19", 115], ["2016-01-20", 27], ["2018-10-03", 86], ["2020-04-21", 19], ["2022-06-08", 123], ["2023-06-12", 72], ["2024-04-05", 91], ["2025-06-01", 66], ["2026-09-30", 71]];
const US10: Anchor[] = [["2004-01-01", 4.2], ["2007-06-12", 5.3], ["2008-12-18", 2.1], ["2012-07-25", 1.4], ["2013-09-05", 3.0], ["2016-07-08", 1.4], ["2018-11-08", 3.2], ["2020-03-09", 0.5], ["2022-10-24", 4.25], ["2023-10-19", 5.0], ["2024-09-16", 3.6], ["2025-05-21", 4.6], ["2026-09-30", 4.1]];
const GNPA: Anchor[] = [["2004-01-01", 7.2], ["2008-03-31", 2.3], ["2013-03-31", 3.4], ["2018-03-31", 11.2], ["2021-03-31", 7.3], ["2025-03-31", 2.3], ["2026-09-30", 2.2]];
const CPI: Anchor[] = [["2004-01-01", 4], ["2008-08-01", 9], ["2009-11-01", 13], ["2012-01-01", 8], ["2013-11-01", 11.2], ["2015-07-01", 3.7], ["2017-06-01", 1.5], ["2019-12-01", 7.4], ["2020-10-01", 7.6], ["2022-04-01", 7.8], ["2023-07-01", 7.4], ["2024-10-01", 6.2], ["2025-06-01", 2.1], ["2026-09-30", 3.4]];
const PE: Anchor[] = [["2004-01-01", 19], ["2008-01-08", 27], ["2008-10-27", 11.5], ["2010-11-01", 24], ["2011-12-20", 16.5], ["2015-03-03", 23.5], ["2016-02-29", 19.5], ["2018-08-29", 28.5], ["2020-03-24", 18], ["2021-10-18", 28], ["2022-06-17", 19.5], ["2024-09-27", 24], ["2025-03-04", 20.2], ["2026-09-30", 22.3]];

/** Business days between start and end (Mon-Fri). */
function businessDays(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = toTime(start); t <= toTime(end); t += 86_400_000) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(fromTime(t));
  }
  return out;
}

interface World {
  days: string[];
  nifty: number[];
  ret: number[];
  /** Latent sentiment, -1..1. */
  s: number[];
  /** Smoothed sentiment (valuation, flows persistence). */
  slow: number[];
  vix: number[];
  global: number[];
}

let cached: { key: string; world: World } | null = null;

function world(): World {
  const end = todayISO();
  if (cached?.key === end) return cached.world;
  const days = businessDays(START, end);
  const r = rng(20260930);
  // AR(1) noise around the stylised path keeps turning points while looking like prices.
  const nifty: number[] = [];
  let noise = 0;
  for (const d of days) {
    noise = 0.985 * noise + 0.0085 * gauss(r);
    nifty.push(interp(NIFTY_PATH, d) * Math.exp(noise));
  }
  const ret = nifty.map((v, i) => (i ? v / nifty[i - 1] - 1 : 0));
  // Latent sentiment from 3M return and distance from 200-day average.
  const s: number[] = [];
  let ma = nifty[0];
  for (let i = 0; i < days.length; i++) {
    ma = ma + (nifty[i] - ma) / 200;
    const r63 = i >= 63 ? nifty[i] / nifty[i - 63] - 1 : 0;
    s.push(Math.tanh(4 * r63 + 3 * (nifty[i] / ma - 1)));
  }
  const slow: number[] = [];
  let sl = 0;
  for (const x of s) slow.push((sl = sl + (x - sl) / 40));
  const vix = s.map((x, i) => {
    const rv = i >= 20 ? Math.sqrt(ret.slice(i - 19, i + 1).reduce((a, b) => a + b * b, 0) / 20 * 252) * 100 : 15;
    return Math.max(9, Math.min(86, 0.55 * rv + 9 + 7 * (1 - x) + 22 * Math.max(0, -x) ** 2));
  });
  const rg = rng(77);
  const global: number[] = [];
  let gn = 0;
  for (const x of s) {
    gn = 0.97 * gn + 0.06 * gauss(rg);
    global.push(Math.max(-1, Math.min(1, 0.75 * x + gn)));
  }
  const w = { days, nifty, ret, s, slow, vix, global };
  cached = { key: end, world: w };
  return w;
}

/** Price index driven by beta to NIFTY returns plus a sentiment tilt and idiosyncratic noise. */
function priceFrom(w: World, key: string, start: number, beta: number, tilt: number, vol: number, driver: "nifty" | "global" = "nifty"): Obs[] {
  const r = rng(hash(key));
  let p = start;
  const out: Obs[] = [];
  for (let i = 0; i < w.days.length; i++) {
    const base = driver === "nifty" ? w.ret[i] : 0.6 * w.ret[i] + 0.004 * (w.global[i] - (w.global[i - 1] ?? 0)) * 10;
    p *= 1 + beta * base + tilt * w.s[i] * 0.0004 + vol * gauss(r);
    out.push({ date: w.days[i], value: p });
  }
  return out;
}

function daily(w: World, key: string, fn: (i: number, n: () => number) => number | null, from = START): Obs[] {
  const r = rng(hash(key));
  const n = () => gauss(r);
  const out: Obs[] = [];
  for (let i = 0; i < w.days.length; i++) {
    if (w.days[i] < from) continue;
    const v = fn(i, n);
    if (v !== null && Number.isFinite(v)) out.push({ date: w.days[i], value: v });
  }
  return out;
}

/** Sample on month starts (value of the business day at/after the 1st) with an optional lag of sentiment. */
function monthly(w: World, key: string, fn: (i: number, n: () => number, date: string) => number | null, from = START, day = "01"): Obs[] {
  const r = rng(hash(key));
  const n = () => gauss(r);
  const out: Obs[] = [];
  let lastMonth = "";
  const endMonth = todayISO().slice(0, 7);
  for (let i = 0; i < w.days.length; i++) {
    const m = w.days[i].slice(0, 7);
    if (m === lastMonth || w.days[i] < from) continue;
    lastMonth = m;
    // Monthly releases describe the previous month and are published with a lag: stop 1-2 months back.
    if (m >= endMonth) continue;
    const v = fn(i, n, `${m}-${day}`);
    if (v !== null && Number.isFinite(v)) out.push({ date: `${m}-${day}`, value: v });
  }
  return out;
}

function quarterly(w: World, key: string, fn: (i: number, n: () => number) => number | null, from = START): Obs[] {
  return monthly(w, key, (i, n, date) => (["01", "04", "07", "10"].includes(date.slice(5, 7)) ? fn(i, n) : null), from).filter((o) => o.date < addDays(todayISO(), -100));
}

function weekly(w: World, key: string, fn: (i: number, n: () => number) => number | null, from = START): Obs[] {
  return daily(w, key, (i, n) => (new Date(toTime(w.days[i])).getUTCDay() === 5 ? fn(i, n) : null), from);
}

const SECTOR_PARAMS: Record<string, [number, number, number]> = {
  // [start level, beta, sentiment tilt]
  NIFTYNEXT50: [5000, 1.1, 0.3],
  NIFTYMIDCAP100: [3000, 1.2, 0.6],
  NIFTYSMALLCAP100: [1500, 1.35, 0.9],
  NIFTYBANK: [2200, 1.25, 0.3],
  NIFTYIT: [3000, 0.8, -0.1],
  NIFTYAUTO: [1900, 1.0, 0.4],
  NIFTYMETAL: [1500, 1.4, 0.5],
  NIFTYPHARMA: [2600, 0.55, -0.6],
  NIFTYFMCG: [2300, 0.5, -0.7],
  NIFTYREALTY: [400, 1.6, 0.8],
  NIFTYPSUBANK: [1100, 1.4, 0.5],
  NIFTYPVTBANK: [2500, 1.2, 0.2],
  NIFTYFINSERVICE: [2000, 1.2, 0.3],
  NIFTYINFRA: [1200, 1.1, 0.5],
};

/** Generates one series. Returns [] for series with no synthetic definition. */
export function syntheticSeries(def: SeriesDef): Obs[] {
  const w = world();
  const k = def.key;
  const S = (i: number) => w.s[i];
  const lag = (i: number, d: number) => w.s[Math.max(0, i - d)];
  if (k === "idx:NIFTY50") return w.days.map((d, i) => ({ date: d, value: w.nifty[i] }));
  if (k === "idx:SENSEX") return daily(w, k, (i, n) => w.nifty[i] * 3.3 * (1 + 0.002 * n()));
  if (k === "idx:INDIAVIX") return daily(w, k, (i, n) => Math.max(8.5, w.vix[i] * (1 + 0.03 * n())));
  if (k.startsWith("idx:")) {
    const p = SECTOR_PARAMS[k.slice(4)];
    return p ? priceFrom(w, k, p[0], p[1], p[2], 0.006) : [];
  }
  const total = (i: number) => 1800 + (i / w.days.length) * 1100;
  switch (k) {
    case "breadth:adv":
      return daily(w, k, (i, n) => Math.round(total(i) * Math.min(0.9, Math.max(0.1, 0.49 + 9 * w.ret[i] + 0.08 * S(i) + 0.05 * n()))));
    case "breadth:dec":
      return daily(w, k, (i, n) => Math.round(total(i) * Math.min(0.9, Math.max(0.1, 0.47 - 9 * w.ret[i] - 0.08 * S(i) + 0.05 * n()))));
    case "breadth:adv_vol":
      return daily(w, k, (i, n) => 4e8 * Math.exp(8 * w.ret[i] + 0.3 * S(i) + 0.15 * n()));
    case "breadth:dec_vol":
      return daily(w, k, (i, n) => 4e8 * Math.exp(-8 * w.ret[i] - 0.3 * S(i) + 0.15 * n()));
    case "breadth:up_value":
      return daily(w, k, (i, n) => 30000 * Math.exp(8 * w.ret[i] + 0.25 * S(i) + 0.15 * n()));
    case "breadth:down_value":
      return daily(w, k, (i, n) => 30000 * Math.exp(-8 * w.ret[i] - 0.25 * S(i) + 0.15 * n()));
    case "breadth:new_high":
      return daily(w, k, (i, n) => Math.max(0, Math.round(total(i) * 0.05 * Math.max(0, S(i) + 0.3) ** 2 * (1 + 0.3 * n()))));
    case "breadth:new_low":
      return daily(w, k, (i, n) => Math.max(0, Math.round(total(i) * 0.05 * Math.max(0, -S(i) + 0.3) ** 2 * (1 + 0.3 * n()))));
    case "breadth:pct_above_20":
      return daily(w, k, (i, n) => Math.min(98, Math.max(2, 50 + 38 * lag(i, 0) + 8 * n())));
    case "breadth:pct_above_50":
      return daily(w, k, (i, n) => Math.min(98, Math.max(2, 50 + 36 * (0.6 * S(i) + 0.4 * w.slow[i]) + 5 * n())));
    case "breadth:pct_above_100":
      return daily(w, k, (i, n) => Math.min(98, Math.max(2, 50 + 34 * (0.4 * S(i) + 0.6 * w.slow[i]) + 4 * n())));
    case "breadth:pct_above_200":
      return daily(w, k, (i, n) => Math.min(98, Math.max(2, 52 + 34 * w.slow[i] + 3 * n())));
    case "flow:fii_cash":
      return daily(w, k, (i, n) => (1 + i / 2500) * (900 * S(i) + 700 * w.global[i] + 1600 * n()));
    case "flow:dii_cash":
      return daily(w, k, (i, n) => (1 + i / 1800) * (400 - 500 * S(i) + 900 * n()));
    case "flow:fii_idx_fut_long":
      return daily(w, k, (i, n) => 200000 * Math.min(0.85, Math.max(0.1, 0.45 + 0.25 * S(i) + 0.04 * n())), "2010-01-01");
    case "flow:fii_idx_fut_short":
      return daily(w, k, (i, n) => 200000 * Math.min(0.9, Math.max(0.15, 0.55 - 0.25 * S(i) + 0.04 * n())), "2010-01-01");
    case "flow:fii_idx_opt_net":
      return daily(w, k, (i, n) => 150000 * S(i) + 60000 * n(), "2012-01-01");
    case "flow:fii_debt":
      return daily(w, k, (i, n) => 250 * w.global[i] + 600 * n());
    case "fx:USDINR":
      return daily(w, k, (i, n) => interp(USDINR, w.days[i]) * (1 + 0.012 * Math.max(0, -S(i)) + 0.002 * n()));
    case "fred:DEXINUS":
      return daily(w, k, (i, n) => interp(USDINR, w.days[i]) * (1 + 0.012 * Math.max(0, -S(i)) + 0.002 * n()) * (1 + 0.0008 * n()), START).filter((_, j) => j % 23 !== 7);
    case "fred:DTWEXBGS":
      return daily(w, k, (i, n) => 100 + 12 * Math.sin(i / 900) - 4 * w.global[i] + 0.5 * n(), "2006-01-02");
    case "fred:TRESEGINM052N":
      return monthly(w, k, (i) => 1000 * (100 + (i / w.days.length) * 560 + 30 * w.slow[i]));
    case "rbi:forex_reserves":
      return weekly(w, k, (i, n) => 100 + (i / w.days.length) * 590 + 30 * w.slow[i] + 2 * n());
    case "gsec:10y":
      return daily(w, k, (i, n) => interp(GSEC10, w.days[i]) + 0.15 * Math.max(0, -S(i)) + 0.04 * n());
    case "gsec:2y":
      return daily(w, k, (i, n) => interp(GSEC10, w.days[i]) - 0.55 - 0.25 * S(i) + 0.05 * n());
    case "gsec:5y":
      return daily(w, k, (i, n) => interp(GSEC10, w.days[i]) - 0.25 - 0.1 * S(i) + 0.04 * n());
    case "fred:INDIRLTLT01STM":
      return monthly(w, k, (i) => interp(GSEC10, w.days[i]) + 0.1 * Math.max(0, -S(i)));
    case "fred:IR3TIB01INM156N":
      return monthly(w, k, (i) => interp(REPO, w.days[i]) + 0.2 - 0.3 * S(i));
    case "rbi:repo":
      return daily(w, k, (i) => Math.round(interp(REPO, w.days[i]) * 4) / 4);
    case "rbi:call_money":
      return daily(w, k, (i, n) => Math.round(interp(REPO, w.days[i]) * 4) / 4 - 0.1 - 0.25 * w.slow[i] + 0.08 * n());
    case "rbi:system_liquidity":
      return daily(w, k, (i, n) => 120000 * w.slow[i] + 60000 * Math.sin(i / 300) + 25000 * n(), "2010-01-01");
    case "rbi:govt_cash":
      return weekly(w, k, (i, n) => 150000 + 80000 * Math.sin(i / 90) + 20000 * n(), "2012-01-01");
    case "rbi:cp_3m":
      return weekly(w, k, (i, n) => interp(REPO, w.days[i]) + 0.7 - 0.5 * S(i) + 0.1 * n());
    case "rbi:cd_3m":
      return weekly(w, k, (i, n) => interp(REPO, w.days[i]) + 0.45 - 0.4 * S(i) + 0.08 * n());
    case "rbi:bank_credit_yoy":
      return weekly(w, k, (i, n) => 14 + 5 * w.slow[i] + 0.3 * n());
    case "rbi:deposit_yoy":
      return weekly(w, k, (i, n) => 11 + 1.5 * w.slow[i] + 0.3 * n());
    case "rbi:credit_deposit_ratio":
      return weekly(w, k, (i, n) => 75 + 3 * w.slow[i] + 0.3 * n());
    case "rbi:gnpa":
      return quarterly(w, k, (i) => interp(GNPA, w.days[i]));
    case "credit:aaa_spread":
      return daily(w, k, (i, n) => 85 - 35 * w.slow[i] + 60 * Math.max(0, -S(i)) ** 2 + 4 * n(), "2008-01-01");
    case "credit:aa_spread":
      return daily(w, k, (i, n) => 190 - 70 * w.slow[i] + 140 * Math.max(0, -S(i)) ** 2 + 8 * n(), "2008-01-01");
    case "fred:SP500":
      return priceFrom(w, k, 1100, 0.45, 0.2, 0.008, "global");
    case "fred:NASDAQCOM":
      return priceFrom(w, k, 2000, 0.55, 0.3, 0.011, "global");
    case "fred:NIKKEI225":
      return priceFrom(w, k, 10500, 0.45, 0.1, 0.011, "global");
    case "gl:RUT":
      return priceFrom(w, k, 560, 0.6, 0.3, 0.012, "global");
    case "gl:HSI":
      return priceFrom(w, k, 12500, 0.55, 0, 0.012, "global");
    case "gl:SHCOMP":
      return priceFrom(w, k, 1500, 0.3, 0, 0.013, "global");
    case "gl:STOXX600":
      return priceFrom(w, k, 200, 0.45, 0.1, 0.009, "global");
    case "gl:MSCIEM":
      return priceFrom(w, k, 440, 0.65, 0.2, 0.009, "global");
    case "gl:MSCIWORLD":
      return priceFrom(w, k, 1000, 0.45, 0.2, 0.007, "global");
    case "fred:VIXCLS":
      return daily(w, k, (i, n) => Math.max(9, 14 - 6 * w.global[i] + 30 * Math.max(0, -w.global[i]) ** 2 + 1.2 * n()));
    case "fred:BAMLH0A0HYM2":
      return daily(w, k, (i, n) => Math.max(2.5, 4.2 - 1.5 * w.global[i] + 9 * Math.max(0, -w.global[i]) ** 3 + 0.1 * n()));
    case "fred:BAMLEMCBPIOAS":
      return daily(w, k, (i, n) => Math.max(1.2, 2.6 - 1 * w.global[i] + 5 * Math.max(0, -w.global[i]) ** 3 + 0.08 * n()));
    case "fred:DGS10":
      return daily(w, k, (i, n) => Math.max(0.4, interp(US10, w.days[i]) + 0.05 * n()));
    case "fred:DGS2":
      return daily(w, k, (i, n) => Math.max(0.1, interp(US10, w.days[i]) - 0.4 - 0.4 * w.global[i] + 0.05 * n()));
    case "fred:DCOILBRENTEU":
      return daily(w, k, (i, n) => Math.max(15, interp(BRENT, w.days[i]) * (1 + 0.02 * n())));
    case "fred:DCOILWTICO":
      return daily(w, k, (i, n) => Math.max(10, interp(BRENT, w.days[i]) * (0.94 + 0.02 * n())));
    case "fred:DHHNGSP":
      return daily(w, k, (i, n) => Math.max(1.5, 4 + 1.5 * Math.sin(i / 200) + 0.3 * n()));
    case "fred:PCOPPUSDM":
      return monthly(w, k, (i, n) => 3000 + (i / w.days.length) * 6000 + 1500 * w.global[i] + 200 * n());
    case "fred:PALUMUSDM":
      return monthly(w, k, (i, n) => 1700 + (i / w.days.length) * 800 + 350 * w.global[i] + 60 * n());
    case "cmd:GOLD":
      return daily(w, k, (i, n) => (400 + (i / w.days.length) ** 1.6 * 2900) * (1 + 0.03 * Math.max(0, -w.global[i]) + 0.008 * n()));
    case "cmd:SILVER":
      return daily(w, k, (i, n) => (7 + (i / w.days.length) * 30) * (1 + 0.02 * w.global[i] + 0.015 * n()));
    case "cmd:STEEL":
      return monthly(w, k, (i, n) => 30000 + (i / w.days.length) * 25000 + 4000 * w.slow[i] + 800 * n(), "2010-01-01");
    case "val:nifty_pe":
      return daily(w, k, (i, n) => interp(PE, w.days[i]) * (w.nifty[i] / interp(NIFTY_PATH, w.days[i])) * (1 + 0.005 * n()), "2004-01-01");
    case "val:nifty_fwd_pe":
      return daily(w, k, (i, n) => 0.84 * interp(PE, w.days[i]) * (w.nifty[i] / interp(NIFTY_PATH, w.days[i])) * (1 + 0.005 * n()), "2008-01-01");
    case "val:nifty_pb":
      return daily(w, k, (i, n) => (interp(PE, w.days[i]) / 6.4) * (w.nifty[i] / interp(NIFTY_PATH, w.days[i])) * (1 + 0.005 * n()), "2004-01-01");
    case "earn:nifty_eps":
      return quarterly(w, k, (i) => w.nifty[i] / interp(PE, w.days[i]));
    case "earn:nifty_fwd_eps":
      return weekly(w, k, (i, n) => (w.nifty[i] / interp(PE, w.days[i])) * (1.14 + 0.03 * lag(i, 60)) * (1 + 0.002 * n()), "2008-01-01");
    case "earn:upgrades":
      return monthly(w, k, (i, n) => Math.max(1, Math.round(22 + 10 * lag(i, 40) + 3 * n())), "2010-01-01");
    case "earn:downgrades":
      return monthly(w, k, (i, n) => Math.max(1, Math.round(22 - 10 * lag(i, 40) + 3 * n())), "2010-01-01");
    case "earn:surprise":
      return quarterly(w, k, (i, n) => 2.5 * lag(i, 40) + 1.5 * n(), "2010-01-01");
    case "fred:INDPROINDMISMEI": {
      let lvl = 60;
      return monthly(w, k, (i, n) => (lvl *= 1 + (0.055 + 0.07 * lag(i, 60)) / 12 + 0.006 * n()));
    }
    case "fred:INDCPIALLMINMEI": {
      let lvl = 50;
      return monthly(w, k, (i, n, date) => (lvl *= 1 + interp(CPI, date) / 1200 + 0.0015 * n()));
    }
    case "fred:XTEXVA01INM667S": {
      let lvl = 5e9;
      return monthly(w, k, (i, n) => (lvl *= 1 + (0.09 + 0.25 * w.global[i]) / 12 + 0.02 * n()));
    }
    case "fred:NGDPRNSAXDCINQ": {
      let lvl = 7e12;
      return quarterly(w, k, (i, n) => (lvl *= 1 + (0.065 + 0.04 * lag(i, 60)) / 4 + 0.004 * n()));
    }
    case "macro:cpi_yoy":
      return monthly(w, k, (_i, n, date) => interp(CPI, date) + 0.25 * n(), "2012-01-01");
    case "macro:core_cpi_yoy":
      return monthly(w, k, (_i, n, date) => 0.7 * interp(CPI, date) + 1.4 + 0.2 * n(), "2012-01-01");
    case "macro:wpi_yoy":
      return monthly(w, k, (i, n, date) => interp(CPI, date) - 2 + 0.05 * (interp(BRENT, date) - 75) + 0.8 * n());
    case "macro:iip_yoy":
      return monthly(w, k, (i, n) => 5 + 6 * lag(i, 60) + 1.5 * n(), "2013-04-01");
    case "macro:pmi_mfg":
      return monthly(w, k, (i, n) => 53 + 4 * lag(i, 30) + 0.8 * n(), "2006-01-01");
    case "macro:pmi_services":
      return monthly(w, k, (i, n) => 54 + 4.5 * lag(i, 30) + 0.9 * n(), "2006-01-01");
    case "macro:gst": {
      let lvl = 90000;
      return monthly(w, k, (i, n) => (lvl *= 1 + (0.1 + 0.08 * lag(i, 30)) / 12 + 0.02 * n()), "2017-08-01");
    }
    case "macro:trade_deficit":
      return monthly(w, k, (i, n, date) => 8 + (i / w.days.length) * 14 + 0.08 * (interp(BRENT, date) - 70) + 1.5 * n());
    case "macro:current_account":
      return quarterly(w, k, (i, n) => -1.2 - 0.02 * (interp(BRENT, w.days[i]) - 70) + 0.4 * n());
    case "macro:fiscal_deficit":
      return monthly(w, k, (i, n, date) => 4.8 + (date >= "2020-04" && date <= "2021-12" ? 4 : 0) - (i / w.days.length) * 0.5 + 0.2 * n());
    case "macro:consumer_confidence":
      return quarterly(w, k, (i, n) => 100 + 18 * w.slow[i] + 3 * n(), "2010-01-01");
    case "retail:mf_equity_inflow":
      return monthly(w, k, (i, n) => (1 + (i / w.days.length) * 6) * (5000 + 5000 * w.slow[i] + 2000 * n()), "2006-01-01");
    case "retail:sip":
      return monthly(w, k, (i, n) => 2000 + ((i - 3000) / 1800) ** 2 * 5000 * (1 + 0.05 * n()), "2016-04-01");
    case "retail:etf_flow":
      return monthly(w, k, (i, n) => (1 + (i / w.days.length) * 5) * (1200 + 800 * S(i) + 700 * n()), "2012-01-01");
    case "retail:demat_adds":
      return monthly(w, k, (i, n) => Math.max(0.1, (0.3 + ((i / w.days.length) ** 3) * 4) * (1 + 0.6 * w.slow[i] + 0.1 * n())), "2008-01-01");
    case "retail:fo_traders":
      return monthly(w, k, (i, n) => Math.max(0.5, (1 + (i / w.days.length) ** 3 * 9) * (1 + 0.3 * w.slow[i] + 0.05 * n())), "2018-01-01");
    case "retail:ipo_count":
      return monthly(w, k, (i, n) => Math.max(0, Math.round(4 + 6 * w.slow[i] + 2 * n())));
    case "retail:sme_ipo_count":
      return monthly(w, k, (i, n) => Math.max(0, Math.round((i / w.days.length) ** 2 * 20 * (1 + w.slow[i]) + 2 * n())), "2012-06-01");
    case "retail:ipo_subscription":
      return monthly(w, k, (i, n) => Math.max(0.5, 15 * Math.exp(1.4 * w.slow[i]) * (1 + 0.2 * n())));
    case "retail:ipo_listing_gain":
      return monthly(w, k, (i, n) => 12 + 25 * w.slow[i] + 6 * n());
  }
  if (k.startsWith("opt:")) {
    const [, u, m] = k.split(":");
    const from = u === "NIFTY" ? "2012-01-02" : u === "BANKNIFTY" ? "2016-06-01" : "2021-01-11";
    const scale = u === "NIFTY" ? 1 : u === "BANKNIFTY" ? 0.9 : 0.25;
    switch (m) {
      case "oi_pcr":
        return daily(w, k, (i, n) => Math.max(0.4, 1.0 + 0.32 * S(i) + 0.08 * n()), from);
      case "premium_pcr":
        return daily(w, k, (i, n) => Math.max(0.3, 1.0 - 0.3 * S(i) + 0.1 * n()), from);
      case "call_premium":
        return daily(w, k, (i, n) => scale * (1 + i / 2000) * 400 * Math.exp(0.3 * S(i) + 0.15 * n()), from);
      case "put_premium":
        return daily(w, k, (i, n) => scale * (1 + i / 2000) * 400 * Math.exp(-0.3 * S(i) + 0.15 * n()), from);
      case "pressure":
        return daily(w, k, (i, n) => Math.max(-1, Math.min(1, 0.28 * S(i) + 0.08 * n())), from);
      case "writing_balance":
        return daily(w, k, (i, n) => Math.max(-1, Math.min(1, 0.4 * S(i) + 0.12 * n())), from);
      case "atm_iv":
        return daily(w, k, (i, n) => Math.max(7, w.vix[i] * (u === "NIFTY" ? 0.95 : 1.15) + 0.6 * n()), from);
      case "skew25d":
        return daily(w, k, (i, n) => 2.5 - 2.5 * S(i) + 0.6 * n(), from);
      case "maxpain_dist":
        return daily(w, k, (i, n) => 0.4 * S(i) + 0.7 * n(), from);
      case "later_positioning":
        return daily(w, k, (i, n) => Math.max(0, Math.min(100, 50 + 20 * lag(i, 3) + 5 * n())), from);
    }
  }
  return [];
}

export function syntheticAll(): Record<string, Obs[]> {
  return Object.fromEntries(SERIES.map((d) => [d.key, syntheticSeries(d)]));
}

// ------------------------------------------------------------------ option chains

function normCdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
function bsPrice(call: boolean, S: number, K: number, ivPct: number, t: number, r = 0.065): number {
  const s = ivPct / 100;
  const d1 = (Math.log(S / K) + (r + (s * s) / 2) * t) / (s * Math.sqrt(t));
  const d2 = d1 - s * Math.sqrt(t);
  return call ? S * normCdf(d1) - K * Math.exp(-r * t) * normCdf(d2) : K * Math.exp(-r * t) * normCdf(-d2) - S * normCdf(-d1);
}

function lastTuesday(y: number, m: number): string {
  const d = new Date(Date.UTC(y, m + 1, 0));
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function expiriesFor(u: string, today: string): string[] {
  const t = new Date(today + "T00:00:00Z");
  const monthlies: string[] = [];
  for (let k = 0; monthlies.length < 3; k++) {
    const e = lastTuesday(t.getUTCFullYear(), t.getUTCMonth() + k);
    if (e >= today) monthlies.push(e);
  }
  if (u !== "NIFTY") return monthlies;
  const weeklies: string[] = [];
  const d = new Date(t);
  while (weeklies.length < 4) {
    if (d.getUTCDay() === 2 && d.toISOString().slice(0, 10) >= today) weeklies.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return [...new Set([...weeklies, ...monthlies])].sort();
}

const CHAIN_PARAMS: Record<string, { step: number; lot: number; spotMult: number; width: number }> = {
  NIFTY: { step: 50, lot: 75, spotMult: 1, width: 40 },
  BANKNIFTY: { step: 100, lot: 35, spotMult: 2.25, width: 40 },
  FINNIFTY: { step: 50, lot: 65, spotMult: 1.05, width: 30 },
};

/**
 * Synthetic option chain consistent with the synthetic market on the latest day:
 * put OI clusters below spot and call OI above it, skewed IV, previous-close
 * prices and IVs so buying/writing classification has something to work with.
 * `minutesIntoSession` (0-375) produces intraday variants for pressure charts.
 */
export function syntheticChain(u: (typeof OPTION_UNDERLYINGS)[number], minutesIntoSession = 375): OptionChainSnapshot {
  const w = world();
  const i = w.days.length - 1;
  const today = w.days[i];
  const p = CHAIN_PARAMS[u];
  const r = rng(hash(`${u}:${today}:${minutesIntoSession}`));
  const rBase = rng(hash(`${u}:${today}`));
  const prevSpot = w.nifty[i - 1] * p.spotMult;
  const closeSpot = w.nifty[i] * p.spotMult;
  const frac = Math.min(1, Math.max(0, minutesIntoSession / 375));
  const spot = prevSpot + (closeSpot - prevSpot) * frac + prevSpot * 0.0015 * Math.sin(frac * 7) * (1 - frac);
  const s = w.s[i];
  const atmIv = w.vix[i] * (u === "NIFTY" ? 0.95 : 1.15);
  const prevAtmIv = w.vix[i - 1] * (u === "NIFTY" ? 0.95 : 1.15);
  const skew = 0.25 * (2.5 - 2.5 * s);
  const atm = Math.round(spot / p.step) * p.step;
  const ts = `${today}T${String(9 + Math.floor((15 + minutesIntoSession) / 60)).padStart(2, "0")}:${String((15 + minutesIntoSession) % 60).padStart(2, "0")}:00+05:30`;
  const records: OptionRecord[] = [];
  const exps = expiriesFor(u, today);
  exps.forEach((exp, ei) => {
    const days = Math.max(0.3, (toTime(exp) - toTime(today)) / 86_400_000 + 0.25);
    const t = days / 365;
    const expScale = Math.exp(-ei * 0.45);
    for (let k = -p.width; k <= p.width; k++) {
      const K = atm + k * p.step;
      const m = (K - spot) / spot / Math.max(0.02, (atmIv / 100) * Math.sqrt(t));
      for (const type of ["CE", "PE"] as const) {
        const iv = Math.max(5, atmIv + (type === "PE" ? skew : -skew * 0.4) * Math.abs(m) + 0.8 * m * m + 0.2 * gauss(rBase));
        const prevIv = Math.max(5, iv - (atmIv - prevAtmIv) + 0.15 * gauss(rBase));
        const ltp = Math.max(0.05, bsPrice(type === "CE", spot, K, iv, t));
        const prevClose = Math.max(0.05, bsPrice(type === "CE", prevSpot, K, prevIv, t + 1 / 365));
        // OI walls: calls above spot at round strikes, puts below; sentiment tilts the balance.
        const dist = (K - spot) / (p.step * 8);
        const round = K % (p.step * 10) === 0 ? 1.8 : K % (p.step * 2) === 0 ? 1.2 : 0.8;
        const base = 1e5 * expScale * round * (u === "NIFTY" ? 1 : 0.6);
        const oi = Math.round(base * (type === "CE" ? Math.exp(-((dist - 0.6) ** 2)) * (1 - 0.25 * s) : Math.exp(-((dist + 0.6) ** 2)) * (1 + 0.25 * s)) * (1 + 0.15 * gauss(rBase)));
        const writeBias = type === "PE" ? 0.08 * (1 + s) : 0.08 * (1 - s);
        const changeInOi = Math.round(oi * (writeBias * frac + 0.04 * gauss(r)));
        const volume = Math.round(Math.max(0, oi * (0.6 + 1.5 * Math.exp(-Math.abs(dist) * 1.5)) * expScale * frac * (1 + 0.2 * gauss(r))) / 10);
        const spread = Math.max(0.05, ltp * 0.004);
        records.push({ underlying: u, expiry: exp, strike: K, type, ltp: Math.round(ltp * 20) / 20, prevClose: Math.round(prevClose * 20) / 20, volume, oi: Math.max(0, oi), changeInOi, iv: Math.round(iv * 100) / 100, prevIv: Math.round(prevIv * 100) / 100, bid: Math.round((ltp - spread) * 20) / 20, ask: Math.round((ltp + spread) * 20) / 20, timestamp: ts, lotSize: p.lot });
      }
    }
  });
  return { underlying: u, spot: Math.round(spot * 100) / 100, timestamp: ts, volumeUnit: "contracts", records, source: "SYNTHETIC", synthetic: true };
}
