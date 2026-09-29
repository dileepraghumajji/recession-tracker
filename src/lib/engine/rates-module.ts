/**
 * 30Y Treasury Stress module. Decomposes long-end moves into real yields,
 * breakeven inflation, term premium and the expected short-rate path so that a
 * high 30Y yield is not mistaken for a recession signal.
 */
import type { IndicatorReading } from "../types";

export type LongEndDriver =
  | "inflation_expectations"
  | "term_premium_fiscal"
  | "real_growth_policy"
  | "growth_fears_easing"
  | "falling_inflation_expectations"
  | "mixed"
  | "no_significant_move"
  | "insufficient_data";

export interface RatesModule {
  levels: Record<string, number | null>;
  percentile30y: number | null;
  percentile10y: number | null;
  window: "3M";
  changesBps: {
    y30: number | null;
    y10: number | null;
    y2: number | null;
    y3m: number | null;
    real10: number | null;
    be10: number | null;
    tp10: number | null;
    expectedPath10: number | null;
  };
  curveMove: "bear steepening" | "bull steepening" | "bear flattening" | "bull flattening" | "little change" | "unknown";
  driver: LongEndDriver;
  driverLabel: string;
  shares: { real: number | null; breakeven: number | null; termPremium: number | null };
  easingPriced: boolean | null;
  longEndPressure: number | null;
  interpretation: string[];
  caveat: string;
}

const DRIVER_LABEL: Record<LongEndDriver, string> = {
  inflation_expectations: "Rising inflation expectations",
  term_premium_fiscal: "Term premium / fiscal-supply risk",
  real_growth_policy: "Higher real yields (growth strength / policy path)",
  growth_fears_easing: "Growth fears and expected monetary easing",
  falling_inflation_expectations: "Falling inflation expectations",
  mixed: "Mixed drivers",
  no_significant_move: "No significant move",
  insufficient_data: "Insufficient data",
};

export function computeRatesModule(byId: Record<string, IndicatorReading>): RatesModule {
  const v = (id: string) => byId[id]?.latest?.value ?? null;
  const ch = (id: string) => {
    const c = byId[id]?.changes.m3;
    return c === null || c === undefined ? null : c * 100;
  };
  const y30 = ch("ust30y");
  const y10 = ch("ust10y");
  const y2 = ch("ust2y");
  const y3m = ch("ust3m");
  const real10 = ch("real10y");
  const be10 = ch("be10y");
  const tp10 = ch("termpremium");
  const expectedPath10 = y10 !== null && tp10 !== null ? y10 - tp10 : null;

  let curveMove: RatesModule["curveMove"] = "unknown";
  if (y10 !== null && y2 !== null) {
    const slope = y10 - y2;
    if (Math.abs(slope) < 10 && Math.abs(y10) < 10) curveMove = "little change";
    else if (slope >= 0) curveMove = y10 >= 0 ? "bear steepening" : "bull steepening";
    else curveMove = y2 >= 0 ? "bear flattening" : "bull flattening";
  }

  const share = (x: number | null) => (x === null || y10 === null || Math.abs(y10) < 1 ? null : x / y10);
  const shares = { real: share(real10), breakeven: share(be10), termPremium: share(tp10) };

  let driver: LongEndDriver = "insufficient_data";
  if (y10 !== null) {
    if (Math.abs(y10) < 15) driver = "no_significant_move";
    else if (y10 > 0) {
      if (shares.termPremium !== null && shares.termPremium >= 0.5) driver = "term_premium_fiscal";
      else if (shares.breakeven !== null && shares.breakeven >= 0.5) driver = "inflation_expectations";
      else if (shares.real !== null && shares.real >= 0.5) driver = tp10 !== null && tp10 > 0.3 * y10 ? "term_premium_fiscal" : "real_growth_policy";
      else driver = "mixed";
    } else {
      const shortsLead = y2 !== null && y2 < y10; // short end falling faster
      if (shortsLead || (y3m !== null && y3m < -15)) driver = "growth_fears_easing";
      else if (shares.breakeven !== null && shares.breakeven >= 0.5) driver = "falling_inflation_expectations";
      else driver = "mixed";
    }
  }

  const spread2y3m = v("spread_2y3m");
  const easingPriced = spread2y3m === null ? null : spread2y3m < -0.25;
  const p30 = byId.ust30y?.percentile ?? null;
  const tpStress = byId.termpremium?.stress ?? null;
  const pressureParts = [p30, tpStress].filter((x): x is number => x !== null);
  const longEndPressure = pressureParts.length ? pressureParts.reduce((a, b) => a + b, 0) / pressureParts.length : null;

  const interp: string[] = [];
  const fmt = (x: number | null) => (x === null ? "n/a" : `${x > 0 ? "+" : ""}${x.toFixed(0)} bps`);
  if (y10 !== null) {
    interp.push(
      `Over ~3 months the 10Y yield moved ${fmt(y10)}: real yield ${fmt(real10)}, breakeven inflation ${fmt(be10)}, term premium (model) ${fmt(tp10)}.`,
    );
  }
  if (driver !== "insufficient_data" && driver !== "no_significant_move") interp.push(`Primary driver of the move: ${DRIVER_LABEL[driver].toLowerCase()}.`);
  if (curveMove !== "unknown") interp.push(`Curve shape change (2Y vs 10Y): ${curveMove}.`);
  if (easingPriced) interp.push("The 2Y yield is below the 3M bill, i.e. markets are pricing policy easing.");
  const credit = byId.hy_oas?.stress ?? byId.baa10y?.stress ?? null;
  const labor = byId.sahm?.stress ?? null;
  if (longEndPressure !== null && longEndPressure >= 60 && (credit === null || credit < 60) && (labor === null || labor < 50)) {
    interp.push(
      "Long-end yields are elevated while credit spreads and labour indicators remain contained - more consistent with inflation / term-premium / fiscal pressure than with recession stress.",
    );
  }
  if (driver === "growth_fears_easing" && credit !== null && credit >= 60) {
    interp.push("Falling yields led by the short end, alongside wider credit spreads, is the pattern more typical of growth-scare / recessionary episodes.");
  }

  return {
    levels: {
      y30: v("ust30y"),
      y10: v("ust10y"),
      y5: v("ust5y"),
      y2: v("ust2y"),
      y3m: v("ust3m"),
      s10y2y: v("spread_10y2y"),
      s10y3m: v("spread_10y3m"),
      s30y10y: v("spread_30y10y"),
      s2y3m: spread2y3m,
      real10: v("real10y"),
      be10: v("be10y"),
      be5: v("be5y"),
      tp10: v("termpremium"),
      fedfunds: v("fedfunds"),
    },
    percentile30y: p30,
    percentile10y: byId.ust10y?.percentile ?? null,
    window: "3M",
    changesBps: { y30, y10, y2, y3m, real10, be10, tp10, expectedPath10 },
    curveMove,
    driver,
    driverLabel: DRIVER_LABEL[driver],
    shares,
    easingPriced,
    longEndPressure,
    interpretation: interp,
    caveat:
      "High long-term yields are not inherently recessionary. The decomposition (nominal = real + breakeven; nominal = expected path + term premium) relies on market-implied and model-based estimates, which carry their own premia and model error.",
  };
}
