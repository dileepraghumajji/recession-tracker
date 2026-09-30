/**
 * Sentiment divergence engine: cases where the index and an independent
 * segment move in opposite directions. Divergences describe current
 * conditions; they are not reversal signals.
 */
import type { SentimentConfig } from "../config";
import type { IndicatorReading } from "../types";

export interface Divergence {
  id: string;
  kind: "bullish" | "bearish";
  label: string;
  /** null = required data unavailable. */
  active: boolean | null;
  evidence: string;
}

const val = (r: IndicatorReading | undefined) => (r?.available ? r.value : null);
const fmt = (x: number, dp = 1) => `${x >= 0 ? "+" : ""}${x.toFixed(dp)}`;

export function detectDivergences(byId: Record<string, IndicatorReading>, cfg: SentimentConfig): Divergence[] {
  const n = val(byId["nifty_ret_1m"]);
  const t = cfg.divergenceMovePct;
  const up = n === null ? null : n > t;
  const down = n === null ? null : n < -t;
  const nTxt = n === null ? "NIFTY 1M n/a" : `NIFTY ${fmt(n)}% (1M)`;

  const b50 = byId["pct_above_50"];
  const bChg = b50?.available ? b50.changes.m1 : null;
  const ad = val(byId["ad_line_1m"]);
  const breadthDir = bChg !== null ? (bChg > 5 ? 1 : bChg < -5 ? -1 : 0) : ad !== null ? Math.sign(ad) : null;
  const breadthTxt = bChg !== null ? `% above 50DMA ${fmt(bChg, 0)} pp` : ad !== null ? `A/D line ${ad >= 0 ? "rising" : "falling"}` : "breadth n/a";

  const fii = val(byId["fii_cash_1m"]);
  const fiiChg = byId["fii_cash_1m"]?.available ? byId["fii_cash_1m"].changes.m1 : null;
  const fiiPrev = fii !== null && fiiChg !== null ? fii - fiiChg : null;
  const slowing = fii !== null && fiiPrev !== null && fiiPrev < 0 ? fii > fiiPrev + 0.25 * Math.abs(fiiPrev) : null;

  const vixChg = val(byId["vix_1m_change"]);
  const eps = byId["fwd_eps_3m"];
  const rev = val(byId["revision_ratio"]);
  const epsDown = eps?.available && eps.changes.m1 !== null ? eps.changes.m1 < 0 : rev !== null ? rev < 45 : null;
  const aaa = byId["aaa_spread"];
  const aa = byId["aa_spread"];
  const creditUp = aaa?.available && aaa.changes.m1 !== null ? aaa.changes.m1 > 10 : aa?.available && aa.changes.m1 !== null ? aa.changes.m1 > 20 : null;
  const dii = val(byId["dii_cash_1m"]);
  const press = byId["nifty_pressure"];
  const pressChg = press?.available ? (press.changes.w1 ?? press.changes.m1) : null;

  const both = (a: boolean | null, b: boolean | null) => (a === null || b === null ? null : a && b);
  const cr = (x: number) => `₹${Math.round(x).toLocaleString("en-IN")} Cr`;

  return [
    { id: "up_breadth_down", kind: "bearish", label: "NIFTY ↑ + breadth ↓", active: both(up, breadthDir === null ? null : breadthDir < 0), evidence: `${nTxt}; ${breadthTxt}.` },
    { id: "up_fii_selling", kind: "bearish", label: "NIFTY ↑ + FII selling", active: both(up, fii === null ? null : fii < 0), evidence: `${nTxt}; FII 1M ${fii === null ? "n/a" : cr(fii)}.` },
    { id: "up_vix_up", kind: "bearish", label: "NIFTY ↑ + India VIX ↑", active: both(up, vixChg === null ? null : vixChg > 10), evidence: `${nTxt}; India VIX ${vixChg === null ? "n/a" : fmt(vixChg) + "%"} (1M).` },
    { id: "up_eps_down", kind: "bearish", label: "NIFTY ↑ + earnings revisions ↓", active: both(up, epsDown), evidence: `${nTxt}; ${eps?.available && eps.changes.m1 !== null ? `forward EPS 3M change moved ${fmt(eps.changes.m1)} pp over 1M` : rev !== null ? `upgrades share ${rev.toFixed(0)}%` : "revisions n/a"}.` },
    { id: "up_credit_stress", kind: "bearish", label: "NIFTY ↑ + credit stress ↑", active: both(up, creditUp), evidence: `${nTxt}; ${aaa?.available && aaa.changes.m1 !== null ? `AAA spread ${fmt(aaa.changes.m1, 0)} bps (1M)` : aa?.available && aa.changes.m1 !== null ? `AA spread ${fmt(aa.changes.m1, 0)} bps (1M)` : "credit spreads n/a"}.` },
    { id: "down_breadth_up", kind: "bullish", label: "NIFTY ↓ + breadth ↑", active: both(down, breadthDir === null ? null : breadthDir > 0), evidence: `${nTxt}; ${breadthTxt}.` },
    { id: "down_fii_slowing", kind: "bullish", label: "NIFTY ↓ + FII selling slowing", active: both(down, slowing), evidence: `${nTxt}; FII 1M ${fii === null ? "n/a" : cr(fii)} vs ${fiiPrev === null ? "n/a" : cr(fiiPrev)} a month earlier.` },
    { id: "down_vix_down", kind: "bullish", label: "NIFTY ↓ + India VIX ↓", active: both(down, vixChg === null ? null : vixChg < -10), evidence: `${nTxt}; India VIX ${vixChg === null ? "n/a" : fmt(vixChg) + "%"} (1M).` },
    { id: "down_dii_buying", kind: "bullish", label: "NIFTY ↓ + DII buying", active: both(down, dii === null ? null : dii > 0), evidence: `${nTxt}; DII 1M ${dii === null ? "n/a" : cr(dii)}.` },
    { id: "down_pressure_up", kind: "bullish", label: "NIFTY ↓ + option premium pressure improving", active: both(down, pressChg === null ? null : pressChg > 0.1), evidence: `${nTxt}; net premium pressure ${pressChg === null ? "n/a" : fmt(pressChg, 2)} (1W change).` },
  ];
}
