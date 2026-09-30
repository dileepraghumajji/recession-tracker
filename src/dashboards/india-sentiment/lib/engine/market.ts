/**
 * Market analytics used for display and interpretation: momentum table, sector
 * rotation matrix, breadth thrust/divergence, institutional flow reads and
 * context interpretation for volatility, currency and bonds.
 * Wording is descriptive; divergences are never presented as reversal signals.
 */
import { addDays, indexAtOrBefore, movingAverage } from "@/platform/lib/timeseries";
import type { SentimentConfig } from "../config";
import { INDICES, SECTORS, type IndexSym } from "../series";
import type { FactorResult, IndicatorReading, Obs, SeriesMap } from "../types";
import { ema, alignBinary, trendStrength } from "./metrics";

const at = (obs: Obs[], date: string) => {
  const i = indexAtOrBefore(obs, date);
  return i >= 0 ? obs[i] : null;
};
const pctRet = (obs: Obs[], i: number, days: number): number | null => {
  const ref = at(obs, addDays(obs[i].date, -days));
  if (!ref || ref.date === obs[i].date || ref.value <= 0) return null;
  return (obs[i].value / ref.value - 1) * 100;
};

export interface MomentumRow {
  sym: IndexSym;
  name: string;
  last: number | null;
  date: string | null;
  r1d: number | null;
  r1w: number | null;
  r1m: number | null;
  r3m: number | null;
  r6m: number | null;
  r12m: number | null;
  fromHigh: number | null;
  fromLow: number | null;
  dma: Record<20 | 50 | 100 | 200, number | null>;
  aboveDma: Record<20 | 50 | 100 | 200, boolean | null>;
  slope50: number | null;
  trendStrength: number | null;
}

export function momentumTable(series: SeriesMap, asOf: string): MomentumRow[] {
  return INDICES.map(([sym, name]) => {
    const all = series[`idx:${sym}`]?.obs ?? [];
    const i = indexAtOrBefore(all, asOf);
    const empty: MomentumRow = { sym, name, last: null, date: null, r1d: null, r1w: null, r1m: null, r3m: null, r6m: null, r12m: null, fromHigh: null, fromLow: null, dma: { 20: null, 50: null, 100: null, 200: null }, aboveDma: { 20: null, 50: null, 100: null, 200: null }, slope50: null, trendStrength: null };
    if (i < 1) return empty;
    const obs = all.slice(Math.max(0, i - 400), i + 1);
    const k = obs.length - 1;
    const last = obs[k];
    const yr = obs.filter((o) => o.date > addDays(last.date, -365)).map((o) => o.value);
    const hi = Math.max(...yr);
    const lo = Math.min(...yr);
    const dma = (n: 20 | 50 | 100 | 200) => {
      const m = movingAverage(obs, n);
      return m.length ? m[m.length - 1].value : null;
    };
    const d = { 20: dma(20), 50: dma(50), 100: dma(100), 200: dma(200) } as MomentumRow["dma"];
    const ma50 = movingAverage(obs, 50);
    const ts = trendStrength(obs, 50);
    return {
      sym,
      name,
      last: last.value,
      date: last.date,
      r1d: (obs[k].value / obs[k - 1].value - 1) * 100,
      r1w: pctRet(obs, k, 7),
      r1m: pctRet(obs, k, 30),
      r3m: pctRet(obs, k, 91),
      r6m: pctRet(obs, k, 182),
      r12m: pctRet(obs, k, 365),
      fromHigh: (last.value / hi - 1) * 100,
      fromLow: (last.value / lo - 1) * 100,
      dma: d,
      aboveDma: { 20: d[20] === null ? null : last.value > d[20], 50: d[50] === null ? null : last.value > d[50], 100: d[100] === null ? null : last.value > d[100], 200: d[200] === null ? null : last.value > d[200] },
      slope50: ma50.length > 21 ? (ma50[ma50.length - 1].value / ma50[ma50.length - 22].value - 1) * 100 : null,
      trendStrength: ts.length ? ts[ts.length - 1].value : null,
    };
  });
}

export interface SectorRow {
  sym: IndexSym;
  name: string;
  group: string;
  ret: { d1: number | null; w1: number | null; m1: number | null; m3: number | null };
  rel: { d1: number | null; w1: number | null; m1: number | null; m3: number | null };
}

export interface Rotation {
  rows: SectorRow[];
  groups: { group: string; rel1m: number | null; rel3m: number | null }[];
  read: "risk_on" | "defensive" | "mixed" | "unavailable";
  text: string;
}

export function sectorRotation(mom: MomentumRow[]): Rotation {
  const nifty = mom.find((m) => m.sym === "NIFTY50");
  const rel = (a: number | null, b: number | null | undefined) => (a === null || b === null || b === undefined ? null : a - b);
  const rows: SectorRow[] = SECTORS.map((s) => {
    const m = mom.find((x) => x.sym === s.sym)!;
    return {
      sym: s.sym,
      name: m.name,
      group: s.group,
      ret: { d1: m.r1d, w1: m.r1w, m1: m.r1m, m3: m.r3m },
      rel: { d1: rel(m.r1d, nifty?.r1d), w1: rel(m.r1w, nifty?.r1w), m1: rel(m.r1m, nifty?.r1m), m3: rel(m.r3m, nifty?.r3m) },
    };
  });
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const groupNames = [...new Set(SECTORS.map((s) => s.group))];
  const groups = groupNames.map((g) => ({ group: g, rel1m: avg(rows.filter((r) => r.group === g).map((r) => r.rel.m1)), rel3m: avg(rows.filter((r) => r.group === g).map((r) => r.rel.m3)) }));
  const riskOn = avg(groups.filter((g) => ["Cyclicals", "Financials", "Industrials", "Materials"].includes(g.group)).map((g) => g.rel1m));
  const defensive = avg(groups.filter((g) => g.group === "Defensives" || g.group === "Consumer").map((g) => g.rel1m));
  if (riskOn === null || defensive === null) return { rows, groups, read: "unavailable", text: "Sector data unavailable." };
  const gap = riskOn - defensive;
  const leaders = [...groups].filter((g) => g.rel1m !== null).sort((a, b) => (b.rel1m as number) - (a.rel1m as number));
  const lead = leaders.slice(0, 2).map((g) => g.group).join(" and ");
  const read = gap > 1.5 ? "risk_on" : gap < -1.5 ? "defensive" : "mixed";
  const text =
    read === "risk_on"
      ? `Risk-on sectors are outperforming defensives by ${gap.toFixed(1)} pp over 1M; leadership: ${lead}.`
      : read === "defensive"
        ? `Defensive sectors are outperforming risk-on sectors by ${(-gap).toFixed(1)} pp over 1M; leadership: ${lead}.`
        : `No clear rotation: risk-on and defensive sectors within ${Math.abs(gap).toFixed(1)} pp over 1M; leadership: ${lead}.`;
  return { rows, groups, read, text };
}

export interface BreadthRead {
  thrust: { value: number | null; triggered: boolean; text: string };
  divergence: { label: "Bullish breadth divergence" | "Bearish breadth divergence" | "Neutral divergence" | "Unavailable"; text: string };
  broadBased: boolean | null;
}

export function breadthRead(series: SeriesMap, byId: Record<string, IndicatorReading>, breadth: FactorResult, cfg: SentimentConfig, asOf: string): BreadthRead {
  const adv = series["breadth:adv"]?.obs ?? [];
  const dec = series["breadth:dec"]?.obs ?? [];
  const share = ema(alignBinary(adv, dec, (a, d) => (a + d > 0 ? a / (a + d) : null), 0), 10);
  const i = indexAtOrBefore(share, asOf);
  let thrust: BreadthRead["thrust"] = { value: null, triggered: false, text: "Advance/decline data unavailable." };
  if (i >= 0) {
    const window = share.slice(Math.max(0, i - 10), i + 1);
    const minRecent = Math.min(...window.map((o) => o.value));
    const v = share[i].value;
    const triggered = minRecent < 0.4 && v > 0.615;
    thrust = { value: v, triggered, text: triggered ? `Breadth thrust: the 10-day advancing share moved from ${minRecent.toFixed(2)} to ${v.toFixed(2)} within 10 sessions — an unusually broad surge in participation.` : `10-day advancing share at ${v.toFixed(2)} (thrust requires a move from < 0.40 to > 0.615 within 10 sessions).` };
  }
  const nifty = byId["nifty_ret_1m"]?.value ?? null;
  const b50 = byId["pct_above_50"];
  const breadthChg = b50?.available ? b50.changes.m1 : null;
  const adLine = byId["ad_line_1m"]?.available ? byId["ad_line_1m"].value : null;
  const bDir = breadthChg !== null ? (breadthChg > 5 ? 1 : breadthChg < -5 ? -1 : 0) : adLine !== null ? Math.sign(adLine) : null;
  let divergence: BreadthRead["divergence"];
  if (nifty === null || bDir === null) divergence = { label: "Unavailable", text: "NIFTY or breadth data unavailable." };
  else {
    const t = cfg.divergenceMovePct;
    const nDir = nifty > t ? 1 : nifty < -t ? -1 : 0;
    const desc = `NIFTY ${nifty >= 0 ? "+" : ""}${nifty.toFixed(1)}% over 1M; ${breadthChg !== null ? `% of stocks above 50DMA ${breadthChg >= 0 ? "+" : ""}${breadthChg.toFixed(0)} pp` : "A/D line " + (adLine! >= 0 ? "rising" : "falling")}.`;
    const caveat = " Divergences describe current conditions and do not guarantee a reversal.";
    if ((nDir === 1 && bDir === -1) || (nDir === 0 && bDir === -1)) divergence = { label: "Bearish breadth divergence", text: `${nDir === 1 ? "Index rising while participation narrows" : "Index flat while breadth deteriorates"}. ${desc}${caveat}` };
    else if ((nDir === -1 && bDir === 1) || (nDir === 0 && bDir === 1)) divergence = { label: "Bullish breadth divergence", text: `${nDir === -1 ? "Index falling while participation improves" : "Index flat while breadth improves"}. ${desc}${caveat}` };
    else divergence = { label: "Neutral divergence", text: `Index and breadth are moving consistently. ${desc}` };
  }
  return { thrust, divergence, broadBased: breadth.score === null ? null : breadth.score >= 55 };
}

export interface FlowRead {
  fii: { d1: number | null; d5: number | null; m1: number | null; m3: number | null; m6: number | null };
  dii: { d1: number | null; d5: number | null; m1: number | null; m3: number | null; m6: number | null };
  debt1m: number | null;
  futLongRatio: number | null;
  label: "Strongly positive" | "Positive" | "Neutral" | "Negative" | "Strongly negative" | "Unavailable";
  detections: string[];
}

export function flowRead(byId: Record<string, IndicatorReading>, flows: FactorResult, cfg: SentimentConfig): FlowRead {
  const v = (id: string) => (byId[id]?.available ? byId[id].value : null);
  const s = flows.score;
  const label: FlowRead["label"] = s === null ? "Unavailable" : s >= 70 ? "Strongly positive" : s >= 57 ? "Positive" : s > 43 ? "Neutral" : s > 30 ? "Negative" : "Strongly negative";
  const fii1m = v("fii_cash_1m");
  const dii1m = v("dii_cash_1m");
  const nifty1m = v("nifty_ret_1m");
  const t = cfg.divergenceMovePct;
  const detections: string[] = [];
  if (fii1m !== null && nifty1m !== null) {
    if (fii1m < 0 && nifty1m > t) detections.push(`FII selling (₹${Math.round(-fii1m).toLocaleString("en-IN")} Cr over 1M) while NIFTY rose ${nifty1m.toFixed(1)}%.`);
    if (fii1m > 0 && nifty1m < -t) detections.push(`FII buying (₹${Math.round(fii1m).toLocaleString("en-IN")} Cr over 1M) while NIFTY fell ${Math.abs(nifty1m).toFixed(1)}%.`);
  }
  if (fii1m !== null && dii1m !== null && fii1m < 0 && dii1m >= 0.8 * -fii1m) detections.push(`DII buying (₹${Math.round(dii1m).toLocaleString("en-IN")} Cr) absorbed ${Math.min(100, Math.round((dii1m / -fii1m) * 100))}% of FII selling over 1M.`);
  return {
    fii: { d1: v("fii_cash_1d"), d5: v("fii_cash_5d"), m1: fii1m, m3: v("fii_cash_3m"), m6: v("fii_cash_6m") },
    dii: { d1: v("dii_cash_1d"), d5: v("dii_cash_5d"), m1: dii1m, m3: v("dii_cash_3m"), m6: v("dii_cash_6m") },
    debt1m: v("fii_debt_1m"),
    futLongRatio: v("fii_fut_long_ratio"),
    label,
    detections,
  };
}

export interface ContextRead {
  text: string;
}

/** Volatility in context (never "low VIX = greed" by itself). */
export function volatilityRead(byId: Record<string, IndicatorReading>, f: Record<string, FactorResult>, cfg: SentimentConfig): ContextRead {
  const vix = byId["india_vix"];
  if (!vix?.available || vix.value === null) return { text: "India VIX unavailable." };
  const pct = vix.pct10y ?? vix.pct5y;
  const breadth = f.breadth.score;
  const val = f.valuation.score;
  const credit = f.credit.score;
  const n1m = byId["nifty_ret_1m"]?.value ?? null;
  const n1w = byId["nifty_level"]?.changes.w1 ?? null;
  const b50chg = byId["pct_above_50"]?.available ? byId["pct_above_50"].changes.m1 : null;
  const pctTxt = pct !== null ? ` (${pct.toFixed(0)}th percentile, 10Y)` : "";
  const low = pct !== null && pct <= 30;
  const high = pct !== null && pct >= 70;
  let text = `India VIX ${vix.value.toFixed(1)}${pctTxt}.`;
  if (low && breadth !== null && breadth >= 60) text += " Low volatility alongside strong breadth is consistent with healthy risk appetite.";
  else if (low && val !== null && val <= 30 && ((breadth !== null && breadth < 45) || (b50chg !== null && b50chg < -5))) text += " Low volatility with stretched valuation and narrowing breadth may indicate complacency.";
  else if (high && n1m !== null && n1m < -cfg.divergenceMovePct && credit !== null && credit <= 40) text += " High volatility with a falling market and weak credit conditions describes a broad risk-off environment.";
  else if (high && n1w !== null && n1w >= 0 && b50chg !== null && b50chg > 0) text += " Volatility is high but the market is stabilising and breadth is improving — possible stress normalisation.";
  else if (high) text += " Elevated volatility: investors are paying up for protection.";
  else if (low) text += " Volatility is subdued.";
  else text += " Volatility is near normal levels.";
  return { text };
}

export function currencyRead(byId: Record<string, IndicatorReading>): ContextRead {
  const m = byId["usdinr_1m"];
  if (!m?.available || m.value === null) return { text: "USD/INR data unavailable." };
  const x = m.value;
  const dxy = byId["dxy_1m"]?.available ? byId["dxy_1m"].value : null;
  const fii = byId["fii_cash_1m"]?.available ? byId["fii_cash_1m"].value : null;
  const brent = byId["brent_1m"]?.available ? byId["brent_1m"].value : null;
  const us10 = byId["us10y_1m"]?.available ? byId["us10y_1m"].value : null;
  const lvl = byId["usdinr"]?.value;
  const parts: string[] = [];
  const dir = x > 0 ? "depreciated" : "appreciated";
  parts.push(`INR ${dir} ${Math.abs(x).toFixed(2)}% vs USD over 1M${lvl ? ` (USD/INR ${lvl.toFixed(2)})` : ""}.`);
  if (Math.abs(x) < 1) parts.push("The move is within its normal range.");
  else if (x > 0) {
    const causes: string[] = [];
    if (dxy !== null && dxy > 1) causes.push("broad dollar strength");
    if (fii !== null && fii < 0) causes.push("foreign equity outflows");
    if (brent !== null && brent > 8) causes.push("higher crude oil");
    if (us10 !== null && us10 > 20) causes.push("rising US yields");
    parts.push(causes.length ? `The weakness is consistent with ${causes.join(", ")}.` : "No single external driver stands out.");
  } else parts.push("INR strength is consistent with supportive external conditions.");
  return { text: parts.join(" ") };
}

export function bondRead(byId: Record<string, IndicatorReading>): ContextRead {
  const y = byId["gsec10y"];
  const ch = byId["gsec10y_1m_chg"];
  if (!y?.available || y.value === null) return { text: "G-Sec data unavailable." };
  const parts = [`10Y G-Sec ${y.value.toFixed(2)}%${ch?.available && ch.value !== null ? ` (${ch.value >= 0 ? "+" : ""}${ch.value.toFixed(0)} bps over 1M)` : ""}.`];
  const curve = byId["gsec_curve"];
  if (curve?.available && curve.value !== null && curve.changes.m1 !== null) {
    const c = curve.changes.m1 * 100;
    parts.push(`Curve (10Y−2Y) ${curve.value.toFixed(2)} pp, ${Math.abs(c) < 5 ? "little changed" : c > 0 ? `steepening ${c.toFixed(0)} bps` : `flattening ${(-c).toFixed(0)} bps`} over 1M.`);
  }
  const cm = byId["call_minus_repo"];
  const cpi = byId["cpi_yoy"];
  const fiscal = byId["fiscal_deficit"];
  const real = byId["real_10y"];
  const drivers: string[] = [];
  if (cm?.available && cm.value !== null && cm.value > 0.15) drivers.push("liquidity tightness (call money above repo)");
  if (cpi?.available && cpi.value !== null && cpi.value > 5.5) drivers.push("elevated inflation");
  if (fiscal?.available && fiscal.value !== null && fiscal.value > 5.5) drivers.push("fiscal pressure");
  if (ch?.available && ch.value !== null && ch.value < -15 && !drivers.length) drivers.push("easing growth/inflation expectations");
  if (drivers.length) parts.push(`Yield dynamics are consistent with ${drivers.join(" and ")}.`);
  if (real?.available && real.value !== null) parts.push(`Real 10Y yield ≈ ${real.value.toFixed(1)} pp.`);
  return { text: parts.join(" ") };
}
