/**
 * Option-chain analytics (pure functions).
 *
 * Premium traded value = LTP × traded volume × lot size (when the provider
 * reports volume in contracts). LTP is used as the traded price, so values are
 * an approximation of true premium turnover (a VWAP would be more exact).
 *
 * Nothing here infers trader intent with certainty: buying/writing labels are
 * probabilistic ("Likely", "Possible", "Evidence suggests"), OI concentration
 * marks *potential* support/resistance, and Max Pain is a theoretical
 * positioning metric, not an expiry forecast.
 */
import type { OptionChainSnapshot, OptionRecord, OptionType } from "../types";

export type Activity = "fresh_buying" | "writing" | "short_covering" | "long_unwinding" | "indeterminate";
export type Moneyness = "ITM" | "ATM" | "OTM";
export type ExpiryKind = "current" | "next" | "monthly" | "far";

export const ACTIVITY_LABEL: Record<Activity, string> = {
  fresh_buying: "fresh buying",
  writing: "writing",
  short_covering: "short covering",
  long_unwinding: "long unwinding",
  indeterminate: "no clear signal",
};

/** Direction of each activity for the *option holder's* exposure: buying/short covering add long exposure. */
const ACTIVITY_DIR: Record<Activity, number> = { fresh_buying: 1, writing: -1, short_covering: 0.5, long_unwinding: -0.5, indeterminate: 0 };

export interface SideRow {
  ltp: number | null;
  priceChangePct: number | null;
  volume: number;
  oi: number;
  changeInOi: number;
  iv: number | null;
  ivChange: number | null;
  /** Premium traded (₹). */
  premium: number;
  moneyness: Moneyness;
  activity: Activity;
  /** 0-1 strength of evidence for `activity`. */
  activityConfidence: number;
  activityText: string;
  delta: number | null;
}

export interface StrikeRow {
  strike: number;
  call: SideRow | null;
  put: SideRow | null;
}

export interface Totals {
  callPremium: number;
  putPremium: number;
  premiumPcr: number | null;
  callPutPremiumRatio: number | null;
  netPutPremium: number;
  netCallPremium: number;
  callOi: number;
  putOi: number;
  oiPcr: number | null;
  callVolume: number;
  putVolume: number;
  volumePcr: number | null;
  callOiChange: number;
  putOiChange: number;
}

export interface ChainAnalysis {
  underlying: string;
  expiry: string;
  spot: number;
  timestamp: string;
  daysToExpiry: number;
  strikeStep: number;
  atmStrike: number;
  window: number;
  rows: StrikeRow[];
  totals: Totals;
  moneyness: { call: Record<Moneyness, number>; put: Record<Moneyness, number> };
  maxPain: { strike: number; distance: number; distancePct: number } | null;
  zones: {
    callOiTop: { strike: number; oi: number }[];
    putOiTop: { strike: number; oi: number }[];
    callOiAdds: { strike: number; change: number }[];
    putOiAdds: { strike: number; change: number }[];
    resistance: [number, number] | null;
    support: [number, number] | null;
  };
  iv: { atmIv: number | null; atmCallIv: number | null; atmPutIv: number | null; call25dIv: number | null; put25dIv: number | null; skew25d: number | null };
  activity: Record<Activity, { call: number; put: number }>;
  /**
   * Premium pressure (₹, bullish positive): call-side pressure minus put-side
   * pressure, where each side is Σ premium × activity direction × evidence × IV context.
   */
  pressure: { call: number; put: number; net: number; normalized: number | null };
  /** Share of written premium on puts vs calls, -1..1 (positive = more put writing). */
  writingBalance: number | null;
  highlights: {
    maxCallOi: number | null;
    maxPutOi: number | null;
    maxOiAdd: { strike: number; type: OptionType } | null;
    maxPremium: { strike: number; type: OptionType } | null;
    maxVolume: { strike: number; type: OptionType } | null;
  };
}

const CRORE = 1e7;
export const toCrore = (x: number) => x / CRORE;

// --------------------------------------------------------------- Black-Scholes

function normCdf(x: number): number {
  // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Black-Scholes delta. iv in percent, t in years. */
export function bsDelta(type: OptionType, spot: number, strike: number, ivPct: number, t: number, r: number): number | null {
  if (!(spot > 0 && strike > 0 && ivPct > 0 && t > 0)) return null;
  const s = ivPct / 100;
  const d1 = (Math.log(spot / strike) + (r + (s * s) / 2) * t) / (s * Math.sqrt(t));
  return type === "CE" ? normCdf(d1) : normCdf(d1) - 1;
}

// --------------------------------------------------------------- helpers

export function inferStrikeStep(strikes: number[]): number {
  const s = [...new Set(strikes)].sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (let i = 1; i < s.length; i++) {
    const d = Math.round((s[i] - s[i - 1]) * 100) / 100;
    if (d > 0) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best = 0;
  let n = -1;
  for (const [d, c] of counts) if (c > n || (c === n && d < best)) [best, n] = [d, c];
  return best || 1;
}

export function nearestStrike(strikes: number[], spot: number): number {
  let best = strikes[0];
  for (const k of strikes) if (Math.abs(k - spot) < Math.abs(best - spot)) best = k;
  return best;
}

function moneynessOf(type: OptionType, strike: number, atm: number, step: number, bandSteps: number, spot: number): Moneyness {
  if (Math.abs(strike - atm) <= bandSteps * step + 1e-9) return "ATM";
  if (type === "CE") return strike < spot ? "ITM" : "OTM";
  return strike > spot ? "ITM" : "OTM";
}

export function premiumValue(r: Pick<OptionRecord, "ltp" | "volume" | "lotSize">, volumeUnit: "contracts" | "shares"): number {
  if (r.ltp === null || !(r.ltp >= 0) || !(r.volume >= 0)) return 0;
  return r.ltp * r.volume * (volumeUnit === "contracts" ? r.lotSize : 1);
}

/**
 * Probabilistic buying/writing classification from price and OI changes, with
 * volume and IV as supporting evidence. Returns the activity and a 0-1 evidence score.
 */
export function classifyActivity(r: Pick<OptionRecord, "ltp" | "prevClose" | "oi" | "changeInOi" | "volume" | "iv" | "prevIv">): { activity: Activity; confidence: number } {
  if (r.ltp === null || r.prevClose === null || r.prevClose === undefined || !(r.prevClose > 0)) return { activity: "indeterminate", confidence: 0 };
  const dp = (r.ltp - r.prevClose) / r.prevClose;
  const prevOi = Math.max(r.oi - r.changeInOi, 1);
  const doi = r.changeInOi / prevOi;
  if (Math.abs(dp) < 0.005 || Math.abs(doi) < 0.01) return { activity: "indeterminate", confidence: 0 };
  const activity: Activity = dp > 0 ? (doi > 0 ? "fresh_buying" : "short_covering") : doi > 0 ? "writing" : "long_unwinding";
  let conf = 0.4 * Math.min(1, Math.abs(dp) / 0.05) + 0.4 * Math.min(1, Math.abs(doi) / 0.1) + 0.2 * Math.min(1, r.volume / Math.max(r.oi, 1) / 0.5);
  if (r.iv !== null && r.prevIv !== null && r.prevIv !== undefined && r.prevIv > 0) {
    const div = (r.iv - r.prevIv) / r.prevIv;
    // Rising IV is consistent with net buying; falling IV with net writing.
    const consistent = (activity === "fresh_buying" && div > 0) || (activity === "writing" && div < 0);
    const inconsistent = (activity === "fresh_buying" && div < -0.02) || (activity === "writing" && div > 0.02);
    conf += consistent ? 0.1 : inconsistent ? -0.1 : 0;
  }
  return { activity, confidence: Math.max(0, Math.min(1, conf)) };
}

export function activityText(a: Activity, confidence: number): string {
  if (a === "indeterminate") return "No clear signal";
  const q = confidence >= 0.7 ? "Evidence suggests" : confidence >= 0.45 ? "Likely" : "Possible";
  return `${q} ${ACTIVITY_LABEL[a]}`;
}

/** Strike minimising total intrinsic value payable to option holders at expiry (writers' "pain"). */
export function maxPain(records: Pick<OptionRecord, "strike" | "type" | "oi">[]): number | null {
  const strikes = [...new Set(records.map((r) => r.strike))].sort((a, b) => a - b);
  if (!strikes.length) return null;
  let best: number | null = null;
  let bestPain = Infinity;
  for (const k of strikes) {
    let pain = 0;
    for (const r of records) {
      if (r.type === "CE" && k > r.strike) pain += (k - r.strike) * r.oi;
      if (r.type === "PE" && k < r.strike) pain += (r.strike - k) * r.oi;
    }
    if (pain < bestPain) {
      bestPain = pain;
      best = k;
    }
  }
  return best;
}

function ratio(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

/** Contiguous zone around the largest-OI strike covering neighbours with ≥ 60% of the peak. */
function zoneAround(points: { strike: number; oi: number }[], step: number): [number, number] | null {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => a.strike - b.strike);
  const peak = sorted.reduce((m, p) => (p.oi > m.oi ? p : m), sorted[0]);
  if (peak.oi <= 0) return null;
  let lo = peak.strike;
  let hi = peak.strike;
  const at = (k: number) => sorted.find((p) => Math.abs(p.strike - k) < step / 2)?.oi ?? 0;
  while (at(lo - step) >= 0.6 * peak.oi) lo -= step;
  while (at(hi + step) >= 0.6 * peak.oi) hi += step;
  return [lo, hi];
}

// --------------------------------------------------------------- analysis

export interface AnalyzeOpts {
  expiry: string;
  /** Strikes either side of ATM (0 = all). Max pain always uses the full chain. */
  window: number;
  atmBandSteps: number;
  riskFreeRate: number;
}

export function analyzeChain(snap: OptionChainSnapshot, opts: AnalyzeOpts): ChainAnalysis | null {
  const all = snap.records.filter((r) => r.expiry === opts.expiry && Number.isFinite(r.strike));
  if (!all.length || !(snap.spot > 0)) return null;
  const strikesAll = [...new Set(all.map((r) => r.strike))].sort((a, b) => a - b);
  const step = inferStrikeStep(strikesAll);
  const atm = nearestStrike(strikesAll, snap.spot);
  const inWindow = (k: number) => opts.window <= 0 || Math.abs(k - atm) <= opts.window * step + 1e-9;
  const records = all.filter((r) => inWindow(r.strike));
  const days = Math.max(0, (Date.parse(opts.expiry + "T10:00:00Z") - Date.parse(snap.timestamp)) / 86_400_000);
  const t = Math.max(days, 0.5) / 365;

  const byStrike = new Map<number, StrikeRow>();
  const activity: ChainAnalysis["activity"] = {
    fresh_buying: { call: 0, put: 0 },
    writing: { call: 0, put: 0 },
    short_covering: { call: 0, put: 0 },
    long_unwinding: { call: 0, put: 0 },
    indeterminate: { call: 0, put: 0 },
  };
  const moneyness = { call: { ITM: 0, ATM: 0, OTM: 0 }, put: { ITM: 0, ATM: 0, OTM: 0 } };
  const totals: Totals = {
    callPremium: 0, putPremium: 0, premiumPcr: null, callPutPremiumRatio: null, netPutPremium: 0, netCallPremium: 0,
    callOi: 0, putOi: 0, oiPcr: null, callVolume: 0, putVolume: 0, volumePcr: null, callOiChange: 0, putOiChange: 0,
  };
  const pressure = { call: 0, put: 0, net: 0, normalized: null as number | null };

  for (const r of records) {
    const prem = premiumValue(r, snap.volumeUnit);
    const m = moneynessOf(r.type, r.strike, atm, step, opts.atmBandSteps, snap.spot);
    const { activity: act, confidence } = classifyActivity(r);
    const ivChange = r.iv !== null && r.prevIv !== null && r.prevIv !== undefined ? r.iv - r.prevIv : null;
    const dir = ACTIVITY_DIR[act];
    const ivCtx = ivChange !== null && r.prevIv ? Math.max(0.7, Math.min(1.3, 1 + Math.sign(dir) * (ivChange / r.prevIv))) : 1;
    const side: SideRow = {
      ltp: r.ltp,
      priceChangePct: r.ltp !== null && r.prevClose ? (r.ltp / r.prevClose - 1) * 100 : null,
      volume: r.volume,
      oi: r.oi,
      changeInOi: r.changeInOi,
      iv: r.iv,
      ivChange,
      premium: prem,
      moneyness: m,
      activity: act,
      activityConfidence: confidence,
      activityText: activityText(act, confidence),
      delta: r.iv !== null ? bsDelta(r.type, snap.spot, r.strike, r.iv, t, opts.riskFreeRate) : null,
    };
    const row = byStrike.get(r.strike) ?? { strike: r.strike, call: null, put: null };
    if (r.type === "CE") {
      row.call = side;
      totals.callPremium += prem;
      totals.callOi += r.oi;
      totals.callVolume += r.volume;
      totals.callOiChange += r.changeInOi;
      moneyness.call[m] += prem;
      activity[act].call += prem;
      pressure.call += prem * dir * confidence * ivCtx;
    } else {
      row.put = side;
      totals.putPremium += prem;
      totals.putOi += r.oi;
      totals.putVolume += r.volume;
      totals.putOiChange += r.changeInOi;
      moneyness.put[m] += prem;
      activity[act].put += prem;
      pressure.put += prem * dir * confidence * ivCtx;
    }
    byStrike.set(r.strike, row);
  }
  totals.premiumPcr = ratio(totals.putPremium, totals.callPremium);
  totals.callPutPremiumRatio = ratio(totals.callPremium, totals.putPremium);
  totals.netPutPremium = totals.putPremium - totals.callPremium;
  totals.netCallPremium = totals.callPremium - totals.putPremium;
  totals.oiPcr = ratio(totals.putOi, totals.callOi);
  totals.volumePcr = ratio(totals.putVolume, totals.callVolume);
  // Call-side long exposure is bullish, put-side long exposure is bearish.
  pressure.net = pressure.call - pressure.put;
  const tot = totals.callPremium + totals.putPremium;
  pressure.normalized = tot > 0 ? Math.max(-1, Math.min(1, pressure.net / tot)) : null;
  const written = activity.writing.call + activity.writing.put;
  const writingBalance = written > 0 ? (activity.writing.put - activity.writing.call) / written : null;

  const rows = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  const callPts = rows.filter((r) => r.call).map((r) => ({ strike: r.strike, oi: r.call!.oi, change: r.call!.changeInOi }));
  const putPts = rows.filter((r) => r.put).map((r) => ({ strike: r.strike, oi: r.put!.oi, change: r.put!.changeInOi }));
  const top = <T,>(xs: T[], key: (x: T) => number, n = 3) => [...xs].sort((a, b) => key(b) - key(a)).slice(0, n);

  // IV: ATM average and 25-delta wings.
  const atmRow = byStrike.get(atm);
  const atmCallIv = atmRow?.call?.iv ?? null;
  const atmPutIv = atmRow?.put?.iv ?? null;
  const atmIv = atmCallIv !== null && atmPutIv !== null ? (atmCallIv + atmPutIv) / 2 : (atmCallIv ?? atmPutIv);
  const pick = (type: "call" | "put", target: number) => {
    let best: SideRow | null = null;
    for (const r of rows) {
      const s = r[type];
      if (!s || s.delta === null || s.iv === null) continue;
      if (!best || Math.abs(s.delta - target) < Math.abs((best.delta as number) - target)) best = s;
    }
    return best && Math.abs((best.delta as number) - target) < 0.15 ? best.iv : null;
  };
  const call25dIv = pick("call", 0.25);
  const put25dIv = pick("put", -0.25);

  const mp = maxPain(all);
  const sides = rows.flatMap((r) => [
    ...(r.call ? [{ strike: r.strike, type: "CE" as const, s: r.call }] : []),
    ...(r.put ? [{ strike: r.strike, type: "PE" as const, s: r.put }] : []),
  ]);
  const argmax = (key: (x: (typeof sides)[number]) => number) => {
    const b = top(sides, key, 1)[0];
    return b && key(b) > 0 ? { strike: b.strike, type: b.type } : null;
  };

  return {
    underlying: snap.underlying,
    expiry: opts.expiry,
    spot: snap.spot,
    timestamp: snap.timestamp,
    daysToExpiry: Math.round(days * 10) / 10,
    strikeStep: step,
    atmStrike: atm,
    window: opts.window,
    rows,
    totals,
    moneyness,
    maxPain: mp === null ? null : { strike: mp, distance: snap.spot - mp, distancePct: ((snap.spot - mp) / mp) * 100 },
    zones: {
      callOiTop: top(callPts, (p) => p.oi).map(({ strike, oi }) => ({ strike, oi })),
      putOiTop: top(putPts, (p) => p.oi).map(({ strike, oi }) => ({ strike, oi })),
      callOiAdds: top(callPts, (p) => p.change).filter((p) => p.change > 0).map(({ strike, change }) => ({ strike, change })),
      putOiAdds: top(putPts, (p) => p.change).filter((p) => p.change > 0).map(({ strike, change }) => ({ strike, change })),
      resistance: zoneAround(callPts.filter((p) => p.strike >= atm), step),
      support: zoneAround(putPts.filter((p) => p.strike <= atm), step),
    },
    iv: { atmIv, atmCallIv, atmPutIv, call25dIv, put25dIv, skew25d: call25dIv !== null && put25dIv !== null ? put25dIv - call25dIv : null },
    activity,
    pressure,
    writingBalance,
    highlights: {
      maxCallOi: top(callPts, (p) => p.oi, 1)[0]?.strike ?? null,
      maxPutOi: top(putPts, (p) => p.oi, 1)[0]?.strike ?? null,
      maxOiAdd: argmax((x) => x.s.changeInOi),
      maxPremium: argmax((x) => x.s.premium),
      maxVolume: argmax((x) => x.s.volume),
    },
  };
}

// --------------------------------------------------------------- expiries

/** Labels expiries (ascending ISO dates ≥ as-of) as current / next / monthly / far. */
export function classifyExpiries(expiries: string[], asOf: string): { expiry: string; kinds: ExpiryKind[] }[] {
  const list = [...new Set(expiries)].filter((e) => e >= asOf).sort();
  if (!list.length) return [];
  const monthlies = list.filter((e, i) => !list.slice(i + 1).some((x) => x.slice(0, 7) === e.slice(0, 7)));
  const kinds = new Map<string, ExpiryKind[]>(list.map((e) => [e, []]));
  kinds.get(list[0])!.push("current");
  if (list[1]) kinds.get(list[1])!.push("next");
  if (monthlies[0]) kinds.get(monthlies[0])!.push("monthly");
  const far = monthlies.length > 1 ? monthlies[monthlies.length - 1] : list.length > 2 ? list[list.length - 1] : null;
  if (far && !kinds.get(far)!.includes("monthly")) kinds.get(far)!.push("far");
  return list.filter((e) => kinds.get(e)!.length).map((e) => ({ expiry: e, kinds: kinds.get(e)! }));
}

export interface ExpirySummary {
  expiry: string;
  kinds: ExpiryKind[];
  daysToExpiry: number;
  oi: number;
  oiChange: number;
  premium: number;
  premiumPcr: number | null;
  oiPcr: number | null;
  atmIv: number | null;
  skew25d: number | null;
  maxPain: number | null;
  resistance: [number, number] | null;
  support: [number, number] | null;
  pressure: number | null;
  /** 0-100 positioning read for this expiry (50 = balanced). */
  positioning: number | null;
}

/** Positioning read per expiry: OI PCR (conventional reading) blended with net premium pressure. */
export function positioningScore(oiPcr: number | null, pressure: number | null): number | null {
  const parts: number[] = [];
  if (oiPcr !== null) parts.push(Math.max(0, Math.min(100, 50 + (oiPcr - 1) * 125)));
  if (pressure !== null) parts.push(Math.max(0, Math.min(100, 50 + pressure * 100)));
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

export function summarizeExpiry(a: ChainAnalysis, kinds: ExpiryKind[]): ExpirySummary {
  return {
    expiry: a.expiry,
    kinds,
    daysToExpiry: a.daysToExpiry,
    oi: a.totals.callOi + a.totals.putOi,
    oiChange: a.totals.callOiChange + a.totals.putOiChange,
    premium: a.totals.callPremium + a.totals.putPremium,
    premiumPcr: a.totals.premiumPcr,
    oiPcr: a.totals.oiPcr,
    atmIv: a.iv.atmIv,
    skew25d: a.iv.skew25d,
    maxPain: a.maxPain?.strike ?? null,
    resistance: a.zones.resistance,
    support: a.zones.support,
    pressure: a.pressure.normalized,
    positioning: positioningScore(a.totals.oiPcr, a.pressure.normalized),
  };
}

export interface PositioningShift {
  near: number | null;
  later: number | null;
  verdict: "persists" | "concentrated_near" | "disagree" | "balanced" | "unavailable";
  text: string;
}

/** Answers: is the apparent sentiment only in the current expiry, or does it persist into later expiries? */
export function expiryPositioningShift(exps: ExpirySummary[]): PositioningShift {
  const near = exps.find((e) => e.kinds.includes("current"));
  const later = exps.filter((e) => e !== near && e.positioning !== null);
  if (!near || near.positioning === null || !later.length) return { near: near?.positioning ?? null, later: null, verdict: "unavailable", text: "Later-expiry data unavailable; cannot tell whether positioning persists." };
  const w = later.reduce((s, e) => s + Math.max(e.oi, 1), 0);
  const lat = later.reduce((s, e) => s + (e.positioning as number) * Math.max(e.oi, 1), 0) / w;
  const n = near.positioning;
  const side = (x: number) => (x > 55 ? 1 : x < 45 ? -1 : 0);
  const dirWord = (x: number) => (x > 55 ? "bullish-leaning" : "bearish-leaning");
  let verdict: PositioningShift["verdict"];
  let text: string;
  if (side(n) !== 0 && side(n) === side(lat)) {
    verdict = "persists";
    text = `${dirWord(n)[0].toUpperCase()}${dirWord(n).slice(1)} positioning in the current expiry also appears in later expiries (near ${n.toFixed(0)}, later ${lat.toFixed(0)}).`;
  } else if (side(n) !== 0 && side(lat) === 0) {
    verdict = "concentrated_near";
    text = `Positioning looks ${dirWord(n)} mainly in the current expiry (${n.toFixed(0)}); later expiries are close to balanced (${lat.toFixed(0)}).`;
  } else if (side(n) !== 0 && side(lat) !== 0) {
    verdict = "disagree";
    text = `Current expiry reads ${dirWord(n)} (${n.toFixed(0)}) while later expiries read ${dirWord(lat)} (${lat.toFixed(0)}).`;
  } else {
    verdict = side(lat) === 0 ? "balanced" : "persists";
    text = side(lat) === 0 ? `No strong positioning in current (${n.toFixed(0)}) or later expiries (${lat.toFixed(0)}).` : `Current expiry is balanced (${n.toFixed(0)}); later expiries read ${dirWord(lat)} (${lat.toFixed(0)}).`;
  }
  return { near: n, later: lat, verdict, text };
}

export interface PcrDivergence {
  oiRead: "bullish" | "bearish" | "neutral" | "unavailable";
  premiumRead: "bullish" | "bearish" | "neutral" | "unavailable";
  divergent: boolean;
  text: string;
}

/**
 * OI PCR vs Premium PCR. Conventional readings: a high OI PCR (more open puts,
 * often written) is read as bullish positioning; a high premium PCR (more money
 * paid for puts) as bearish-leaning demand for protection. Neither is conclusive.
 */
export function pcrDivergence(oiPcr: number | null, premiumPcr: number | null, t: { oiPcrBullish: number; oiPcrBearish: number; premiumPcrBearish: number; premiumPcrBullish: number }): PcrDivergence {
  const oiRead = oiPcr === null ? "unavailable" : oiPcr >= t.oiPcrBullish ? "bullish" : oiPcr <= t.oiPcrBearish ? "bearish" : "neutral";
  const premiumRead = premiumPcr === null ? "unavailable" : premiumPcr >= t.premiumPcrBearish ? "bearish" : premiumPcr <= t.premiumPcrBullish ? "bullish" : "neutral";
  const divergent = (oiRead === "bullish" && premiumRead === "bearish") || (oiRead === "bearish" && premiumRead === "bullish");
  const text =
    oiRead === "unavailable" || premiumRead === "unavailable"
      ? "Insufficient option data to compare OI PCR and premium PCR."
      : divergent
        ? `POSITIONING DIVERGENCE: open interest reads ${oiRead} (OI PCR ${oiPcr!.toFixed(2)}) while traded premium reads ${premiumRead} (premium PCR ${premiumPcr!.toFixed(2)}). Positioning and fresh money flow point in different directions.`
        : `OI PCR ${oiPcr!.toFixed(2)} (${oiRead}) and premium PCR ${premiumPcr!.toFixed(2)} (${premiumRead}) do not contradict each other.`;
  return { oiRead, premiumRead, divergent, text };
}

// --------------------------------------------------------------- intraday

export interface IntradayPoint {
  ts: string;
  spot: number;
  /** Net premium pressure of the interval (bullish positive), ₹. */
  pressure: number;
  /** Premium traded during the interval, ₹. */
  premium: number;
  oiPcr: number | null;
  premiumPcr: number | null;
}

/**
 * Premium pressure between two snapshots of the same underlying on the same day:
 * interval volume, OI change, price change and IV change are taken snapshot-to-snapshot.
 */
export function intradayPoint(prev: OptionChainSnapshot, cur: OptionChainSnapshot, opts: Omit<AnalyzeOpts, "expiry">): IntradayPoint | null {
  const expiry = classifyExpiries(cur.records.map((r) => r.expiry), cur.timestamp.slice(0, 10))[0]?.expiry;
  if (!expiry || prev.timestamp.slice(0, 10) !== cur.timestamp.slice(0, 10)) return null;
  const before = new Map(prev.records.filter((r) => r.expiry === expiry).map((r) => [`${r.strike}:${r.type}`, r]));
  const records: OptionRecord[] = [];
  for (const r of cur.records) {
    if (r.expiry !== expiry) continue;
    const p = before.get(`${r.strike}:${r.type}`);
    if (!p) continue;
    records.push({ ...r, prevClose: p.ltp, prevIv: p.iv, changeInOi: r.oi - p.oi, volume: Math.max(0, r.volume - p.volume) });
  }
  const a = analyzeChain({ ...cur, records }, { ...opts, expiry });
  if (!a) return null;
  const full = analyzeChain(cur, { ...opts, expiry });
  return { ts: cur.timestamp, spot: cur.spot, pressure: a.pressure.net, premium: a.totals.callPremium + a.totals.putPremium, oiPcr: full?.totals.oiPcr ?? null, premiumPcr: full?.totals.premiumPcr ?? null };
}

/** Buckets intraday points into N-minute bars (pressure and premium summed). */
export function bucketIntraday(points: IntradayPoint[], minutes: number): IntradayPoint[] {
  const out = new Map<number, IntradayPoint>();
  for (const p of points) {
    const t = Date.parse(p.ts);
    const b = Math.floor(t / (minutes * 60_000)) * minutes * 60_000;
    const cur = out.get(b);
    if (!cur) out.set(b, { ...p, ts: new Date(b + minutes * 60_000).toISOString() });
    else out.set(b, { ...cur, spot: p.spot, pressure: cur.pressure + p.pressure, premium: cur.premium + p.premium, oiPcr: p.oiPcr, premiumPcr: p.premiumPcr });
  }
  return [...out.values()].sort((a, b) => (a.ts < b.ts ? -1 : 1));
}

/** Daily aggregate metrics stored as time series for history, charts and scoring. */
export interface ChainAggregates {
  oiPcr: number | null;
  premiumPcr: number | null;
  callPremiumCr: number;
  putPremiumCr: number;
  pressure: number | null;
  writingBalance: number | null;
  atmIv: number | null;
  skew25d: number | null;
  maxPainDistPct: number | null;
  laterPositioning: number | null;
  spot: number;
}

export function aggregatesFor(near: Omit<ChainAnalysis, "rows">, shift: PositioningShift): ChainAggregates {
  return {
    oiPcr: near.totals.oiPcr,
    premiumPcr: near.totals.premiumPcr,
    callPremiumCr: toCrore(near.totals.callPremium),
    putPremiumCr: toCrore(near.totals.putPremium),
    pressure: near.pressure.normalized,
    writingBalance: near.writingBalance,
    atmIv: near.iv.atmIv,
    skew25d: near.iv.skew25d,
    maxPainDistPct: near.maxPain?.distancePct ?? null,
    laterPositioning: shift.later,
    spot: near.spot,
  };
}
