/**
 * Indicator catalogue. Each indicator turns one or more raw series into a
 * causal metric and maps it to a 0-100 sentiment score (higher = greed /
 * risk-on). Correlated indicators share a cluster so they are pooled (averaged)
 * rather than double counted; clusters are weighted inside each factor
 * (see config.ts).
 *
 * Scoring:
 *  - percentile: point-in-time percentile of the metric within the trailing
 *    `percentileYears` window (polarity-adjusted); used when at least
 *    `minHistoryYears` of history exist, otherwise the optional anchor fallback.
 *  - anchors: piecewise-linear map through economically motivated anchor points.
 */
import { lagChange, spread, yoy } from "@/platform/lib/timeseries";
import { DEFENSIVE_SYMS, SECTORS, RISK_ON_GROUPS, type IndexSym } from "./series";
import type { FactorId, Frequency, Obs } from "./types";
import { alignBinary, chg, coalesce, cumsum, distMA, ema, fromHigh, mapObs, maSlope, meanOf, realizedVol, ret, rollingMean, rollingSum } from "./engine/metrics";

export type Get = (key: string) => Obs[];

export type Scoring = { kind: "percentile"; polarity: 1 | -1; fallback?: { xs: number[]; ys: number[] } } | { kind: "anchors"; xs: number[]; ys: number[] };

export interface IndicatorDef {
  id: string;
  name: string;
  factor: FactorId;
  cluster: string;
  /** Input series in order of preference. */
  series: string[];
  units: string;
  frequency: Frequency;
  decimals: number;
  compute: (g: Get) => Obs[];
  /** null = context/display only (not scored). */
  scoring: Scoring | null;
  changeMode: "diff" | "pct";
  polarityNote: string;
  description: string;
}

const P = (polarity: 1 | -1, fb?: [number[], number[]]): Scoring => ({ kind: "percentile", polarity, fallback: fb ? { xs: fb[0], ys: fb[1] } : undefined });
const A = (xs: number[], ys: number[]): Scoring => ({ kind: "anchors", xs, ys });
const HIGHER = "Higher = more risk appetite (greed).";
const LOWER = "Lower = more risk appetite; higher reads as caution/fear.";

type D = Omit<IndicatorDef, "decimals" | "changeMode" | "polarityNote" | "description" | "frequency"> &
  Partial<Pick<IndicatorDef, "decimals" | "changeMode" | "polarityNote" | "description" | "frequency">>;
const def = (d: D): IndicatorDef => ({
  decimals: 2,
  changeMode: "diff",
  frequency: "D",
  polarityNote: d.scoring === null ? "Context only; not scored." : d.scoring.kind === "percentile" ? (d.scoring.polarity === 1 ? HIGHER : LOWER) : "Mapped through fixed anchors (see methodology).",
  description: "",
  ...d,
});

const I = (s: IndexSym | "INDIAVIX") => `idx:${s}`;
const NIFTY = I("NIFTY50");

/** Average return of a set of indices minus NIFTY over a lag (relative strength, %). */
function relReturn(g: Get, syms: IndexSym[], days: number): Obs[] {
  const legs = syms.map((s) => ret(g(I(s)), days)).filter((x) => x.length);
  if (!legs.length) return [];
  return alignBinary(meanOf(legs), ret(g(NIFTY), days), (a, b) => a - b);
}

function riskOnMinusDefensive(g: Get, days: number): Obs[] {
  const riskOn = SECTORS.filter((s) => (RISK_ON_GROUPS as readonly string[]).includes(s.group)).map((s) => ret(g(I(s.sym)), days)).filter((x) => x.length);
  const def = DEFENSIVE_SYMS.map((s) => ret(g(I(s)), days)).filter((x) => x.length);
  if (!riskOn.length || !def.length) return [];
  return alignBinary(meanOf(riskOn), meanOf(def), (a, b) => a - b);
}

/** % of sector indices outperforming NIFTY over ~1M. */
function rsBreadth(g: Get): Obs[] {
  const legs = SECTORS.map((s) => alignBinary(ret(g(I(s.sym)), 30), ret(g(NIFTY), 30), (a, b) => (a > b ? 100 : 0))).filter((x) => x.length);
  if (legs.length < 5) return [];
  return meanOf(legs);
}

const logRatio = (a: number, b: number) => (a > 0 && b > 0 ? Math.log(a / b) : null);
const tenYear = (g: Get) => coalesce(g("gsec:10y"), g("fred:INDIRLTLT01STM"));
const usdinr = (g: Get) => coalesce(g("fx:USDINR"), g("fred:DEXINUS"));
const cpiYoy = (g: Get) => coalesce(g("macro:cpi_yoy"), yoy(g("fred:INDCPIALLMINMEI")));
const reserves = (g: Get) => coalesce(g("rbi:forex_reserves"), g("fred:TRESEGINM052N"));

export const INDICATORS: IndicatorDef[] = [
  // ------------------------------------------------------------ momentum
  def({ id: "nifty_vs_200dma", name: "NIFTY 50 vs 200DMA", factor: "momentum", cluster: "nifty_trend", series: [NIFTY], units: "%", compute: (g) => distMA(g(NIFTY), 200), scoring: P(1, [[-12, 0, 12], [10, 50, 90]]), description: "Percent distance of NIFTY 50 from its 200-day moving average." }),
  def({ id: "nifty_vs_50dma", name: "NIFTY 50 vs 50DMA", factor: "momentum", cluster: "nifty_trend", series: [NIFTY], units: "%", compute: (g) => distMA(g(NIFTY), 50), scoring: P(1, [[-8, 0, 8], [10, 50, 90]]), description: "Percent distance of NIFTY 50 from its 50-day moving average." }),
  def({ id: "nifty_50dma_slope", name: "NIFTY 50DMA slope (1M)", factor: "momentum", cluster: "nifty_trend", series: [NIFTY], units: "%", compute: (g) => maSlope(g(NIFTY), 50, 21), scoring: P(1, [[-5, 0, 5], [10, 50, 90]]), description: "Change in the 50-day moving average over the last 21 sessions." }),
  def({ id: "sensex_vs_200dma", name: "SENSEX vs 200DMA", factor: "momentum", cluster: "nifty_trend", series: [I("SENSEX")], units: "%", compute: (g) => distMA(g(I("SENSEX")), 200), scoring: P(1, [[-12, 0, 12], [10, 50, 90]]), description: "Cross-check of large-cap trend on BSE." }),
  def({ id: "nifty_ret_1m", name: "NIFTY 50 1M return", factor: "momentum", cluster: "nifty_returns", series: [NIFTY], units: "%", compute: (g) => ret(g(NIFTY), 30), scoring: P(1, [[-8, 0, 8], [10, 50, 90]]) }),
  def({ id: "nifty_ret_3m", name: "NIFTY 50 3M return", factor: "momentum", cluster: "nifty_returns", series: [NIFTY], units: "%", compute: (g) => ret(g(NIFTY), 91), scoring: P(1, [[-15, 0, 15], [10, 50, 90]]) }),
  def({ id: "nifty_ret_6m", name: "NIFTY 50 6M return", factor: "momentum", cluster: "nifty_returns", series: [NIFTY], units: "%", compute: (g) => ret(g(NIFTY), 182), scoring: P(1, [[-20, 0, 20], [10, 50, 90]]) }),
  def({ id: "midcap_rel_3m", name: "Midcap 100 vs NIFTY (3M)", factor: "momentum", cluster: "broad_market", series: [I("NIFTYMIDCAP100"), NIFTY], units: "pp", compute: (g) => relReturn(g, ["NIFTYMIDCAP100"], 91), scoring: P(1, [[-8, 0, 8], [15, 50, 85]]), description: "Mid-cap outperformance: risk appetite moving down the size curve." }),
  def({ id: "smallcap_rel_3m", name: "Smallcap 100 vs NIFTY (3M)", factor: "momentum", cluster: "broad_market", series: [I("NIFTYSMALLCAP100"), NIFTY], units: "pp", compute: (g) => relReturn(g, ["NIFTYSMALLCAP100"], 91), scoring: P(1, [[-10, 0, 10], [15, 50, 85]]) }),
  def({ id: "next50_rel_3m", name: "NIFTY Next 50 vs NIFTY (3M)", factor: "momentum", cluster: "broad_market", series: [I("NIFTYNEXT50"), NIFTY], units: "pp", compute: (g) => relReturn(g, ["NIFTYNEXT50"], 91), scoring: P(1, [[-6, 0, 6], [15, 50, 85]]) }),
  def({ id: "sector_riskon_1m", name: "Risk-on vs defensive sectors (1M)", factor: "momentum", cluster: "sector_rotation", series: SECTORS.map((s) => I(s.sym)), units: "pp", compute: (g) => riskOnMinusDefensive(g, 30), scoring: P(1, [[-6, 0, 6], [15, 50, 85]]), description: "Average 1M return of cyclical, financial, industrial and materials sectors minus pharma and FMCG." }),
  def({ id: "sector_riskon_3m", name: "Risk-on vs defensive sectors (3M)", factor: "momentum", cluster: "sector_rotation", series: SECTORS.map((s) => I(s.sym)), units: "pp", compute: (g) => riskOnMinusDefensive(g, 91), scoring: P(1, [[-10, 0, 10], [15, 50, 85]]) }),
  def({ id: "nifty_from_high", name: "NIFTY 50 distance from 52W high", factor: "momentum", cluster: "highs", series: [NIFTY], units: "%", compute: (g) => fromHigh(g(NIFTY)), scoring: P(1, [[-20, -8, 0], [5, 40, 85]]) }),
  def({ id: "nifty_level", name: "NIFTY 50", factor: "momentum", cluster: "context", series: [NIFTY], units: "index", compute: (g) => g(NIFTY), scoring: null, changeMode: "pct", decimals: 0 }),
  def({ id: "nifty_ret_1d", name: "NIFTY 50 1D return", factor: "momentum", cluster: "context", series: [NIFTY], units: "%", compute: (g) => ret(g(NIFTY), 1), scoring: null }),

  // ------------------------------------------------------------ breadth
  def({ id: "ad_ratio_10d", name: "Advance/decline ratio (10D avg, log)", factor: "breadth", cluster: "advance_decline", series: ["breadth:adv", "breadth:dec"], units: "log ratio", compute: (g) => rollingMean(alignBinary(g("breadth:adv"), g("breadth:dec"), logRatio, 0), 10), scoring: P(1, [[-0.5, 0, 0.5], [10, 50, 90]]), description: "10-session average of ln(advances / declines) across the NSE universe." }),
  def({ id: "ad_vol_ratio_10d", name: "Advance/decline volume ratio (10D, log)", factor: "breadth", cluster: "advance_decline", series: ["breadth:adv_vol", "breadth:dec_vol"], units: "log ratio", compute: (g) => rollingMean(alignBinary(g("breadth:adv_vol"), g("breadth:dec_vol"), logRatio, 0), 10), scoring: P(1, [[-0.6, 0, 0.6], [10, 50, 90]]) }),
  def({ id: "pct_above_20", name: "% of stocks above 20DMA", factor: "breadth", cluster: "dma_participation", series: ["breadth:pct_above_20"], units: "%", compute: (g) => g("breadth:pct_above_20"), scoring: P(1, [[15, 50, 85], [5, 50, 95]]) }),
  def({ id: "pct_above_50", name: "% of stocks above 50DMA", factor: "breadth", cluster: "dma_participation", series: ["breadth:pct_above_50"], units: "%", compute: (g) => g("breadth:pct_above_50"), scoring: P(1, [[15, 50, 85], [5, 50, 95]]) }),
  def({ id: "pct_above_100", name: "% of stocks above 100DMA", factor: "breadth", cluster: "dma_participation", series: ["breadth:pct_above_100"], units: "%", compute: (g) => g("breadth:pct_above_100"), scoring: P(1, [[20, 50, 80], [5, 50, 95]]) }),
  def({ id: "pct_above_200", name: "% of stocks above 200DMA", factor: "breadth", cluster: "dma_participation", series: ["breadth:pct_above_200"], units: "%", compute: (g) => g("breadth:pct_above_200"), scoring: P(1, [[20, 50, 80], [5, 50, 95]]) }),
  def({ id: "hl_ratio_10d", name: "New highs vs new lows (10D, log)", factor: "breadth", cluster: "highs_lows", series: ["breadth:new_high", "breadth:new_low"], units: "log ratio", compute: (g) => alignBinary(rollingSum(g("breadth:new_high"), 10), rollingSum(g("breadth:new_low"), 10), (h, l) => Math.log((h + 1) / (l + 1)), 0), scoring: P(1, [[-2, 0, 2], [10, 50, 90]]) }),
  def({ id: "up_down_value_10d", name: "Up value / down value (10D, log)", factor: "breadth", cluster: "internals", series: ["breadth:up_value", "breadth:down_value"], units: "log ratio", compute: (g) => rollingMean(alignBinary(g("breadth:up_value"), g("breadth:down_value"), logRatio, 0), 10), scoring: P(1, [[-0.6, 0, 0.6], [10, 50, 90]]) }),
  def({ id: "ad_line_1m", name: "A/D line momentum (1M)", factor: "breadth", cluster: "internals", series: ["breadth:adv", "breadth:dec"], units: "issues", compute: (g) => chg(cumsum(alignBinary(g("breadth:adv"), g("breadth:dec"), (a, d) => a - d, 0)), 30), scoring: P(1), decimals: 0, description: "Change in the cumulative advance-minus-decline line over ~1 month." }),
  def({ id: "rs_breadth", name: "Sectors outperforming NIFTY (1M)", factor: "breadth", cluster: "internals", series: SECTORS.map((s) => I(s.sym)), units: "%", compute: rsBreadth, scoring: A([0, 50, 100], [10, 50, 90]), decimals: 0, description: "Relative-strength breadth: share of sector indices beating NIFTY 50 over ~1 month." }),
  def({ id: "breadth_thrust", name: "Breadth thrust (10D EMA of advancers share)", factor: "breadth", cluster: "thrust", series: ["breadth:adv", "breadth:dec"], units: "ratio", compute: (g) => ema(alignBinary(g("breadth:adv"), g("breadth:dec"), (a, d) => (a + d > 0 ? a / (a + d) : null), 0), 10), scoring: A([0.35, 0.5, 0.65], [5, 50, 95]), description: "Zweig-style: a move from below 0.40 to above 0.615 within 10 sessions is flagged as a breadth thrust." }),

  // ------------------------------------------------------------ derivatives positioning
  def({ id: "nifty_oi_pcr", name: "NIFTY OI PCR", factor: "derivatives", cluster: "oi_pcr", series: ["opt:NIFTY:oi_pcr"], units: "ratio", compute: (g) => g("opt:NIFTY:oi_pcr"), scoring: P(1, [[0.6, 1.0, 1.4], [10, 50, 90]]), description: "Put OI / call OI, current expiry within the strike window. Conventionally a higher ratio reflects more put writing (bullish positioning); extremes can also reflect hedging." }),
  def({ id: "banknifty_oi_pcr", name: "BANKNIFTY OI PCR", factor: "derivatives", cluster: "oi_pcr", series: ["opt:BANKNIFTY:oi_pcr"], units: "ratio", compute: (g) => g("opt:BANKNIFTY:oi_pcr"), scoring: P(1, [[0.6, 1.0, 1.4], [10, 50, 90]]) }),
  def({ id: "fii_fut_long_ratio", name: "FII index futures long ratio", factor: "derivatives", cluster: "fii_futures", series: ["flow:fii_idx_fut_long", "flow:fii_idx_fut_short"], units: "%", compute: (g) => alignBinary(g("flow:fii_idx_fut_long"), g("flow:fii_idx_fut_short"), (l, s) => (l + s > 0 ? (l / (l + s)) * 100 : null), 0), scoring: P(1, [[15, 45, 75], [5, 50, 95]]), decimals: 1, description: "FII long index-futures contracts as a share of their long + short positions." }),
  def({ id: "fii_opt_net", name: "FII index options net OI", factor: "derivatives", cluster: "fii_futures", series: ["flow:fii_idx_opt_net"], units: "contracts", compute: (g) => g("flow:fii_idx_opt_net"), scoring: P(1), decimals: 0 }),
  def({ id: "nifty_later_positioning", name: "NIFTY later-expiry positioning", factor: "derivatives", cluster: "expiry_structure", series: ["opt:NIFTY:later_positioning"], units: "0-100", compute: (g) => g("opt:NIFTY:later_positioning"), scoring: A([0, 50, 100], [0, 50, 100]), decimals: 0, description: "OI-weighted positioning read (OI PCR + premium pressure) of expiries after the current one." }),
  def({ id: "nifty_maxpain_dist", name: "NIFTY spot vs Max Pain", factor: "derivatives", cluster: "context", series: ["opt:NIFTY:maxpain_dist"], units: "%", compute: (g) => g("opt:NIFTY:maxpain_dist"), scoring: null, description: "Theoretical positioning metric only; not an expiry forecast." }),

  // ------------------------------------------------------------ premium flow
  def({ id: "nifty_pressure", name: "NIFTY net premium pressure", factor: "premium_flow", cluster: "pressure", series: ["opt:NIFTY:pressure"], units: "-1..1", compute: (g) => g("opt:NIFTY:pressure"), scoring: A([-0.5, 0, 0.5], [0, 50, 100]), description: "Premium-weighted likely buying/writing on calls minus puts, scaled by evidence strength and IV context." }),
  def({ id: "banknifty_pressure", name: "BANKNIFTY net premium pressure", factor: "premium_flow", cluster: "pressure", series: ["opt:BANKNIFTY:pressure"], units: "-1..1", compute: (g) => g("opt:BANKNIFTY:pressure"), scoring: A([-0.5, 0, 0.5], [0, 50, 100]) }),
  def({ id: "nifty_premium_pcr", name: "NIFTY premium PCR", factor: "premium_flow", cluster: "premium_pcr", series: ["opt:NIFTY:premium_pcr"], units: "ratio", compute: (g) => g("opt:NIFTY:premium_pcr"), scoring: P(-1, [[0.6, 1.0, 1.6], [85, 50, 15]]), description: "Put premium traded / call premium traded. Read together with price, OI change and IV; not bullish or bearish by itself." }),
  def({ id: "banknifty_premium_pcr", name: "BANKNIFTY premium PCR", factor: "premium_flow", cluster: "premium_pcr", series: ["opt:BANKNIFTY:premium_pcr"], units: "ratio", compute: (g) => g("opt:BANKNIFTY:premium_pcr"), scoring: P(-1, [[0.6, 1.0, 1.6], [85, 50, 15]]) }),
  def({ id: "nifty_writing_balance", name: "NIFTY writing balance (put − call)", factor: "premium_flow", cluster: "buy_write", series: ["opt:NIFTY:writing_balance"], units: "-1..1", compute: (g) => g("opt:NIFTY:writing_balance"), scoring: A([-0.6, 0, 0.6], [10, 50, 90]), description: "Share of likely-written premium on puts minus calls. Put writing is conventionally read as supportive." }),
  def({ id: "nifty_call_premium", name: "NIFTY call premium traded", factor: "premium_flow", cluster: "context", series: ["opt:NIFTY:call_premium"], units: "₹ Cr", compute: (g) => g("opt:NIFTY:call_premium"), scoring: null, decimals: 0 }),
  def({ id: "nifty_put_premium", name: "NIFTY put premium traded", factor: "premium_flow", cluster: "context", series: ["opt:NIFTY:put_premium"], units: "₹ Cr", compute: (g) => g("opt:NIFTY:put_premium"), scoring: null, decimals: 0 }),

  // ------------------------------------------------------------ volatility
  def({ id: "india_vix", name: "India VIX", factor: "volatility", cluster: "vix_level", series: [I("INDIAVIX")], units: "index", compute: (g) => g(I("INDIAVIX")), scoring: P(-1, [[10, 15, 25, 35], [90, 60, 25, 5]]), changeMode: "pct" }),
  def({ id: "vix_1m_change", name: "India VIX 1M change", factor: "volatility", cluster: "vix_change", series: [I("INDIAVIX")], units: "%", compute: (g) => ret(g(I("INDIAVIX")), 30), scoring: P(-1, [[-30, 0, 40], [85, 50, 10]]) }),
  def({ id: "iv_minus_rv", name: "India VIX minus NIFTY realised vol (20D)", factor: "volatility", cluster: "iv_rv", series: [I("INDIAVIX"), NIFTY], units: "vol pts", compute: (g) => alignBinary(g(I("INDIAVIX")), realizedVol(g(NIFTY), 20), (v, r) => v - r, 0), scoring: P(-1, [[-3, 2, 8], [80, 50, 15]]), description: "Implied volatility premium over realised volatility; a wide premium signals demand for protection." }),
  def({ id: "nifty_skew", name: "NIFTY 25Δ IV skew (put − call)", factor: "volatility", cluster: "skew", series: ["opt:NIFTY:skew25d"], units: "vol pts", compute: (g) => g("opt:NIFTY:skew25d"), scoring: P(-1, [[0, 3, 7], [80, 50, 15]]) }),
  def({ id: "nifty_rv20", name: "NIFTY realised volatility (20D)", factor: "volatility", cluster: "context", series: [NIFTY], units: "%", compute: (g) => realizedVol(g(NIFTY), 20), scoring: null }),
  def({ id: "nifty_atm_iv", name: "NIFTY ATM IV (current expiry)", factor: "volatility", cluster: "context", series: ["opt:NIFTY:atm_iv"], units: "%", compute: (g) => g("opt:NIFTY:atm_iv"), scoring: null }),

  // ------------------------------------------------------------ flows
  def({ id: "fii_cash_5d", name: "FII cash flow (5D cumulative)", factor: "flows", cluster: "fii_cash", series: ["flow:fii_cash"], units: "₹ Cr", compute: (g) => rollingSum(g("flow:fii_cash"), 5), scoring: P(1, [[-20000, 0, 20000], [10, 50, 90]]), decimals: 0 }),
  def({ id: "fii_cash_1m", name: "FII cash flow (1M cumulative)", factor: "flows", cluster: "fii_cash", series: ["flow:fii_cash"], units: "₹ Cr", compute: (g) => rollingSum(g("flow:fii_cash"), 21), scoring: P(1, [[-60000, 0, 60000], [10, 50, 90]]), decimals: 0 }),
  def({ id: "dii_cash_1m", name: "DII cash flow (1M cumulative)", factor: "flows", cluster: "dii_cash", series: ["flow:dii_cash"], units: "₹ Cr", compute: (g) => rollingSum(g("flow:dii_cash"), 21), scoring: P(1, [[-20000, 20000, 80000], [15, 50, 85]]), decimals: 0 }),
  def({ id: "fii_debt_1m", name: "FPI debt flow (1M cumulative)", factor: "flows", cluster: "fii_debt", series: ["flow:fii_debt"], units: "₹ Cr", compute: (g) => rollingSum(g("flow:fii_debt"), 21), scoring: P(1, [[-15000, 0, 15000], [15, 50, 85]]), decimals: 0 }),
  def({ id: "fii_cash_3m", name: "FII cash flow (3M cumulative)", factor: "flows", cluster: "context", series: ["flow:fii_cash"], units: "₹ Cr", compute: (g) => rollingSum(g("flow:fii_cash"), 63), scoring: null, decimals: 0 }),
  def({ id: "fii_cash_6m", name: "FII cash flow (6M cumulative)", factor: "flows", cluster: "context", series: ["flow:fii_cash"], units: "₹ Cr", compute: (g) => rollingSum(g("flow:fii_cash"), 126), scoring: null, decimals: 0 }),
  def({ id: "dii_cash_5d", name: "DII cash flow (5D cumulative)", factor: "flows", cluster: "context", series: ["flow:dii_cash"], units: "₹ Cr", compute: (g) => rollingSum(g("flow:dii_cash"), 5), scoring: null, decimals: 0 }),
  def({ id: "dii_cash_3m", name: "DII cash flow (3M cumulative)", factor: "flows", cluster: "context", series: ["flow:dii_cash"], units: "₹ Cr", compute: (g) => rollingSum(g("flow:dii_cash"), 63), scoring: null, decimals: 0 }),
  def({ id: "dii_cash_6m", name: "DII cash flow (6M cumulative)", factor: "flows", cluster: "context", series: ["flow:dii_cash"], units: "₹ Cr", compute: (g) => rollingSum(g("flow:dii_cash"), 126), scoring: null, decimals: 0 }),
  def({ id: "fii_cash_1d", name: "FII cash flow (daily)", factor: "flows", cluster: "context", series: ["flow:fii_cash"], units: "₹ Cr", compute: (g) => g("flow:fii_cash"), scoring: null, decimals: 0 }),
  def({ id: "dii_cash_1d", name: "DII cash flow (daily)", factor: "flows", cluster: "context", series: ["flow:dii_cash"], units: "₹ Cr", compute: (g) => g("flow:dii_cash"), scoring: null, decimals: 0 }),

  // ------------------------------------------------------------ liquidity
  def({ id: "system_liquidity", name: "System liquidity (net LAF)", factor: "liquidity", cluster: "system", series: ["rbi:system_liquidity"], units: "₹ Cr", compute: (g) => g("rbi:system_liquidity"), scoring: P(1, [[-150000, 0, 150000], [10, 50, 85]]), decimals: 0 }),
  def({ id: "call_minus_repo", name: "Call money − repo", factor: "liquidity", cluster: "money_market", series: ["rbi:call_money", "rbi:repo"], units: "pp", compute: (g) => spread(g("rbi:call_money"), g("rbi:repo"), 60), scoring: P(-1, [[-0.5, 0, 0.25, 0.75], [80, 55, 40, 10]]), description: "Overnight money above repo signals tight liquidity." }),
  def({ id: "cp_minus_repo", name: "3M CP − repo", factor: "liquidity", cluster: "money_market", series: ["rbi:cp_3m", "rbi:repo"], units: "pp", compute: (g) => spread(g("rbi:cp_3m"), g("rbi:repo"), 60), scoring: P(-1, [[0, 0.75, 1.5], [80, 50, 15]]) }),
  def({ id: "interbank_3m_chg", name: "India 3M interbank rate, 3M change", factor: "liquidity", cluster: "money_market", series: ["fred:IR3TIB01INM156N"], units: "pp", frequency: "M", compute: (g) => chg(g("fred:IR3TIB01INM156N"), 91), scoring: P(-1, [[-0.75, 0, 0.75], [80, 50, 20]]) }),
  def({ id: "bank_credit_growth", name: "Bank credit growth", factor: "liquidity", cluster: "credit_deposit", series: ["rbi:bank_credit_yoy"], units: "% YoY", frequency: "W", compute: (g) => g("rbi:bank_credit_yoy"), scoring: P(1, [[5, 12, 18], [20, 55, 80]]) }),
  def({ id: "deposit_growth", name: "Bank deposit growth", factor: "liquidity", cluster: "credit_deposit", series: ["rbi:deposit_yoy"], units: "% YoY", frequency: "W", compute: (g) => g("rbi:deposit_yoy"), scoring: P(1, [[5, 10, 15], [20, 50, 80]]) }),
  def({ id: "govt_cash", name: "Government cash balance", factor: "liquidity", cluster: "govt_cash", series: ["rbi:govt_cash"], units: "₹ Cr", frequency: "W", compute: (g) => g("rbi:govt_cash"), scoring: P(-1), decimals: 0, description: "Large government balances with the RBI drain banking-system liquidity." }),
  def({ id: "repo_rate", name: "RBI repo rate", factor: "liquidity", cluster: "context", series: ["rbi:repo"], units: "%", compute: (g) => g("rbi:repo"), scoring: null }),

  // ------------------------------------------------------------ currency
  def({ id: "usdinr_1m", name: "USD/INR 1M change", factor: "currency", cluster: "inr_move", series: ["fx:USDINR", "fred:DEXINUS"], units: "%", compute: (g) => ret(usdinr(g), 30), scoring: P(-1, [[-1.5, 0.3, 2.5], [85, 55, 10]]), description: "Scored against its own history, so normal gradual depreciation reads as neutral rather than fear." }),
  def({ id: "inr_vol_1m", name: "INR realised volatility (1M)", factor: "currency", cluster: "inr_vol", series: ["fx:USDINR", "fred:DEXINUS"], units: "%", compute: (g) => realizedVol(usdinr(g), 21), scoring: P(-1, [[2, 4, 9], [80, 50, 10]]) }),
  def({ id: "fx_reserves_3m", name: "Forex reserves 3M change", factor: "currency", cluster: "reserves", series: ["rbi:forex_reserves", "fred:TRESEGINM052N"], units: "%", frequency: "M", compute: (g) => ret(reserves(g), 91), scoring: P(1, [[-6, 0, 6], [15, 50, 85]]) }),
  def({ id: "usdinr", name: "USD/INR", factor: "currency", cluster: "context", series: ["fx:USDINR", "fred:DEXINUS"], units: "INR", compute: usdinr, scoring: null, changeMode: "pct" }),
  def({ id: "dxy", name: "Broad US dollar index", factor: "currency", cluster: "context", series: ["fred:DTWEXBGS"], units: "index", compute: (g) => g("fred:DTWEXBGS"), scoring: null, changeMode: "pct" }),

  // ------------------------------------------------------------ bonds
  def({ id: "gsec10y_1m_chg", name: "10Y G-Sec 1M change", factor: "bonds", cluster: "yield_change", series: ["gsec:10y", "fred:INDIRLTLT01STM"], units: "bps", compute: (g) => mapObs(chg(tenYear(g), 30), (v) => v * 100), scoring: P(-1, [[-30, 0, 40], [80, 50, 10]]), decimals: 0 }),
  def({ id: "gsec_curve", name: "G-Sec curve (10Y − 2Y)", factor: "bonds", cluster: "curve", series: ["gsec:10y", "gsec:2y"], units: "pp", compute: (g) => spread(g("gsec:10y"), g("gsec:2y")), scoring: A([-0.5, 0, 0.75, 1.5], [15, 35, 60, 65]), description: "A positively sloped curve is consistent with healthy growth expectations; inversion with policy tightness." }),
  def({ id: "india_us_10y", name: "India − US 10Y spread", factor: "bonds", cluster: "india_us", series: ["gsec:10y", "fred:INDIRLTLT01STM", "fred:DGS10"], units: "pp", compute: (g) => spread(tenYear(g), g("fred:DGS10"), 10), scoring: P(1, [[1.5, 3, 5], [20, 50, 80]]) }),
  def({ id: "gsec10y", name: "India 10Y G-Sec yield", factor: "bonds", cluster: "context", series: ["gsec:10y", "fred:INDIRLTLT01STM"], units: "%", compute: tenYear, scoring: null }),
  def({ id: "gsec2y", name: "India 2Y G-Sec yield", factor: "bonds", cluster: "context", series: ["gsec:2y"], units: "%", compute: (g) => g("gsec:2y"), scoring: null }),
  def({ id: "gsec5y", name: "India 5Y G-Sec yield", factor: "bonds", cluster: "context", series: ["gsec:5y"], units: "%", compute: (g) => g("gsec:5y"), scoring: null }),
  def({ id: "real_10y", name: "Real 10Y yield (10Y − CPI YoY)", factor: "bonds", cluster: "context", series: ["gsec:10y", "fred:INDIRLTLT01STM", "macro:cpi_yoy", "fred:INDCPIALLMINMEI"], units: "pp", frequency: "M", compute: (g) => spread(tenYear(g), cpiYoy(g), 70), scoring: null }),

  // ------------------------------------------------------------ credit
  def({ id: "aaa_spread", name: "AAA corporate spread", factor: "credit", cluster: "corp_spreads", series: ["credit:aaa_spread"], units: "bps", compute: (g) => g("credit:aaa_spread"), scoring: P(-1, [[40, 80, 150], [85, 50, 10]]), decimals: 0 }),
  def({ id: "aa_spread", name: "AA corporate spread", factor: "credit", cluster: "corp_spreads", series: ["credit:aa_spread"], units: "bps", compute: (g) => g("credit:aa_spread"), scoring: P(-1, [[100, 180, 300], [85, 50, 10]]), decimals: 0 }),
  def({ id: "cd_minus_repo", name: "3M CD − repo", factor: "credit", cluster: "short_term", series: ["rbi:cd_3m", "rbi:repo"], units: "pp", frequency: "W", compute: (g) => spread(g("rbi:cd_3m"), g("rbi:repo"), 60), scoring: P(-1, [[0, 0.6, 1.3], [80, 50, 15]]) }),
  def({ id: "gnpa", name: "Bank gross NPA ratio", factor: "credit", cluster: "bank_health", series: ["rbi:gnpa"], units: "%", frequency: "Q", compute: (g) => g("rbi:gnpa"), scoring: P(-1, [[2.5, 5, 10], [80, 50, 10]]) }),
  def({ id: "cd_ratio", name: "Credit/deposit ratio", factor: "credit", cluster: "bank_health", series: ["rbi:credit_deposit_ratio"], units: "%", frequency: "W", compute: (g) => g("rbi:credit_deposit_ratio"), scoring: P(-1, [[70, 76, 82], [75, 50, 20]]), description: "A stretched credit/deposit ratio signals funding pressure for banks." }),

  // ------------------------------------------------------------ global
  def({ id: "spx_1m", name: "S&P 500 1M return", factor: "global", cluster: "us_equity", series: ["fred:SP500"], units: "%", compute: (g) => ret(g("fred:SP500"), 30), scoring: P(1, [[-8, 0, 8], [10, 50, 90]]) }),
  def({ id: "nasdaq_1m", name: "Nasdaq 1M return", factor: "global", cluster: "us_equity", series: ["fred:NASDAQCOM"], units: "%", compute: (g) => ret(g("fred:NASDAQCOM"), 30), scoring: P(1, [[-10, 0, 10], [10, 50, 90]]) }),
  def({ id: "rut_3m", name: "Russell 2000 3M return", factor: "global", cluster: "us_equity", series: ["gl:RUT"], units: "%", compute: (g) => ret(g("gl:RUT"), 91), scoring: P(1, [[-15, 0, 15], [10, 50, 90]]) }),
  def({ id: "nikkei_1m", name: "Nikkei 225 1M return", factor: "global", cluster: "world_equity", series: ["fred:NIKKEI225"], units: "%", compute: (g) => ret(g("fred:NIKKEI225"), 30), scoring: P(1, [[-8, 0, 8], [10, 50, 90]]) }),
  def({ id: "hsi_1m", name: "Hang Seng 1M return", factor: "global", cluster: "world_equity", series: ["gl:HSI"], units: "%", compute: (g) => ret(g("gl:HSI"), 30), scoring: P(1, [[-10, 0, 10], [10, 50, 90]]) }),
  def({ id: "shcomp_1m", name: "Shanghai Composite 1M return", factor: "global", cluster: "world_equity", series: ["gl:SHCOMP"], units: "%", compute: (g) => ret(g("gl:SHCOMP"), 30), scoring: P(1, [[-8, 0, 8], [10, 50, 90]]) }),
  def({ id: "stoxx_1m", name: "STOXX 600 1M return", factor: "global", cluster: "world_equity", series: ["gl:STOXX600"], units: "%", compute: (g) => ret(g("gl:STOXX600"), 30), scoring: P(1, [[-8, 0, 8], [10, 50, 90]]) }),
  def({ id: "msciem_1m", name: "MSCI EM 1M return", factor: "global", cluster: "world_equity", series: ["gl:MSCIEM"], units: "%", compute: (g) => ret(g("gl:MSCIEM"), 30), scoring: P(1, [[-8, 0, 8], [10, 50, 90]]) }),
  def({ id: "msciworld_1m", name: "MSCI World 1M return", factor: "global", cluster: "world_equity", series: ["gl:MSCIWORLD"], units: "%", compute: (g) => ret(g("gl:MSCIWORLD"), 30), scoring: P(1, [[-8, 0, 8], [10, 50, 90]]) }),
  def({ id: "us_vix", name: "CBOE VIX", factor: "global", cluster: "vol_credit", series: ["fred:VIXCLS"], units: "index", compute: (g) => g("fred:VIXCLS"), scoring: P(-1, [[12, 18, 30], [85, 55, 10]]) }),
  def({ id: "us_hy_oas", name: "US high-yield OAS", factor: "global", cluster: "vol_credit", series: ["fred:BAMLH0A0HYM2"], units: "%", compute: (g) => g("fred:BAMLH0A0HYM2"), scoring: P(-1, [[3, 4.5, 7], [85, 50, 10]]) }),
  def({ id: "em_oas", name: "EM corporate OAS", factor: "global", cluster: "vol_credit", series: ["fred:BAMLEMCBPIOAS"], units: "%", compute: (g) => g("fred:BAMLEMCBPIOAS"), scoring: P(-1, [[1.5, 2.5, 4.5], [85, 50, 10]]) }),
  def({ id: "dxy_1m", name: "Broad dollar 1M change", factor: "global", cluster: "dollar_rates", series: ["fred:DTWEXBGS"], units: "%", compute: (g) => ret(g("fred:DTWEXBGS"), 30), scoring: P(-1, [[-2, 0, 2.5], [80, 50, 15]]) }),
  def({ id: "us10y_1m", name: "US 10Y 1M change", factor: "global", cluster: "dollar_rates", series: ["fred:DGS10"], units: "bps", compute: (g) => mapObs(chg(g("fred:DGS10"), 30), (v) => v * 100), scoring: P(-1, [[-40, 0, 50], [75, 50, 15]]), decimals: 0 }),
  def({ id: "us2y_1m", name: "US 2Y 1M change", factor: "global", cluster: "dollar_rates", series: ["fred:DGS2"], units: "bps", compute: (g) => mapObs(chg(g("fred:DGS2"), 30), (v) => v * 100), scoring: P(-1, [[-40, 0, 50], [75, 50, 15]]), decimals: 0 }),

  // ------------------------------------------------------------ commodities
  def({ id: "brent_1m", name: "Brent 1M change", factor: "commodities", cluster: "crude", series: ["fred:DCOILBRENTEU"], units: "%", compute: (g) => ret(g("fred:DCOILBRENTEU"), 30), scoring: P(-1, [[-15, 0, 20], [80, 50, 10]]), description: "India imports most of its crude: rising oil pressures inflation, the INR, the current account and margins." }),
  def({ id: "wti_1m", name: "WTI 1M change", factor: "commodities", cluster: "crude", series: ["fred:DCOILWTICO"], units: "%", compute: (g) => ret(g("fred:DCOILWTICO"), 30), scoring: P(-1, [[-15, 0, 20], [80, 50, 10]]) }),
  def({ id: "brent_level", name: "Brent level", factor: "commodities", cluster: "crude", series: ["fred:DCOILBRENTEU"], units: "USD/bbl", compute: (g) => g("fred:DCOILBRENTEU"), scoring: P(-1, [[50, 75, 110], [80, 50, 10]]), changeMode: "pct" }),
  def({ id: "gold_1m", name: "Gold 1M change", factor: "commodities", cluster: "gold", series: ["cmd:GOLD"], units: "%", compute: (g) => ret(g("cmd:GOLD"), 30), scoring: P(-1, [[-5, 0, 8], [70, 50, 20]]), description: "Sharp gold rallies often reflect haven demand." }),
  def({ id: "silver_1m", name: "Silver 1M change", factor: "commodities", cluster: "gold", series: ["cmd:SILVER"], units: "%", compute: (g) => ret(g("cmd:SILVER"), 30), scoring: P(-1, [[-8, 0, 12], [65, 50, 30]]) }),
  def({ id: "copper_3m", name: "Copper 3M change", factor: "commodities", cluster: "industrial", series: ["fred:PCOPPUSDM"], units: "%", frequency: "M", compute: (g) => ret(g("fred:PCOPPUSDM"), 91), scoring: P(1, [[-15, 0, 15], [15, 50, 85]]) }),
  def({ id: "aluminium_3m", name: "Aluminium 3M change", factor: "commodities", cluster: "industrial", series: ["fred:PALUMUSDM"], units: "%", frequency: "M", compute: (g) => ret(g("fred:PALUMUSDM"), 91), scoring: P(1, [[-15, 0, 15], [15, 50, 85]]) }),
  def({ id: "steel_3m", name: "Domestic steel 3M change", factor: "commodities", cluster: "industrial", series: ["cmd:STEEL"], units: "%", frequency: "M", compute: (g) => ret(g("cmd:STEEL"), 91), scoring: P(1) }),
  def({ id: "natgas_1m", name: "Natural gas 1M change", factor: "commodities", cluster: "gas", series: ["fred:DHHNGSP"], units: "%", compute: (g) => ret(g("fred:DHHNGSP"), 30), scoring: P(-1, [[-25, 0, 35], [75, 50, 20]]) }),

  // ------------------------------------------------------------ valuation (high valuation → lower score)
  def({ id: "nifty_pe", name: "NIFTY 50 trailing P/E", factor: "valuation", cluster: "pe", series: ["val:nifty_pe"], units: "x", compute: (g) => g("val:nifty_pe"), scoring: P(-1, [[16, 21, 26], [85, 50, 15]]), description: "Measures how much optimism is priced in; high valuation is not an immediate bearish signal." }),
  def({ id: "nifty_fwd_pe", name: "NIFTY 50 forward P/E", factor: "valuation", cluster: "pe", series: ["val:nifty_fwd_pe"], units: "x", compute: (g) => g("val:nifty_fwd_pe"), scoring: P(-1, [[14, 18.5, 23], [85, 50, 15]]) }),
  def({ id: "nifty_pb", name: "NIFTY 50 P/B", factor: "valuation", cluster: "pb", series: ["val:nifty_pb"], units: "x", compute: (g) => g("val:nifty_pb"), scoring: P(-1, [[2.5, 3.4, 4.5], [85, 50, 15]]) }),
  def({ id: "erp", name: "Equity risk premium (EY − 10Y G-Sec)", factor: "valuation", cluster: "erp", series: ["val:nifty_pe", "gsec:10y", "fred:INDIRLTLT01STM"], units: "pp", compute: (g) => spread(mapObs(g("val:nifty_pe"), (pe) => (pe > 0 ? 100 / pe : null)), tenYear(g), 45), scoring: P(1, [[-4, -2.5, -1], [15, 50, 85]]), description: "Earnings yield (1/PE) minus the 10Y G-Sec yield." }),
  def({ id: "earnings_yield", name: "NIFTY 50 earnings yield", factor: "valuation", cluster: "context", series: ["val:nifty_pe"], units: "%", compute: (g) => mapObs(g("val:nifty_pe"), (pe) => (pe > 0 ? 100 / pe : null)), scoring: null }),

  // ------------------------------------------------------------ earnings
  def({ id: "fwd_eps_3m", name: "Forward EPS 3M change", factor: "earnings", cluster: "revisions", series: ["earn:nifty_fwd_eps"], units: "%", frequency: "W", compute: (g) => ret(g("earn:nifty_fwd_eps"), 91), scoring: P(1, [[-4, 1, 5], [10, 50, 90]]) }),
  def({ id: "revision_ratio", name: "EPS upgrades share", factor: "earnings", cluster: "revisions", series: ["earn:upgrades", "earn:downgrades"], units: "%", frequency: "M", compute: (g) => alignBinary(rollingSum(g("earn:upgrades"), 3), rollingSum(g("earn:downgrades"), 3), (u, d) => (u + d > 0 ? (u / (u + d)) * 100 : null), 40), scoring: A([25, 50, 75], [10, 50, 90]), decimals: 0, description: "Upgrades / (upgrades + downgrades) over 3 months." }),
  def({ id: "eps_growth", name: "NIFTY 50 EPS growth", factor: "earnings", cluster: "growth", series: ["earn:nifty_eps"], units: "% YoY", frequency: "Q", compute: (g) => lagChange(g("earn:nifty_eps"), 365, "pct", 40), scoring: P(1, [[-5, 10, 25], [10, 50, 90]]) }),
  def({ id: "earnings_surprise", name: "Aggregate earnings surprise", factor: "earnings", cluster: "growth", series: ["earn:surprise"], units: "%", frequency: "Q", compute: (g) => g("earn:surprise"), scoring: A([-5, 0, 5], [15, 50, 85]) }),

  // ------------------------------------------------------------ macro
  def({ id: "iip_yoy", name: "Industrial production growth", factor: "macro", cluster: "growth", series: ["macro:iip_yoy", "fred:INDPROINDMISMEI"], units: "% YoY", frequency: "M", compute: (g) => coalesce(g("macro:iip_yoy"), yoy(g("fred:INDPROINDMISMEI"), 40)), scoring: P(1, [[-2, 4, 9], [15, 50, 85]]) }),
  def({ id: "pmi_mfg", name: "Manufacturing PMI", factor: "macro", cluster: "growth", series: ["macro:pmi_mfg"], units: "index", frequency: "M", compute: (g) => g("macro:pmi_mfg"), scoring: A([45, 50, 55, 60], [10, 40, 70, 90]), decimals: 1 }),
  def({ id: "pmi_services", name: "Services PMI", factor: "macro", cluster: "growth", series: ["macro:pmi_services"], units: "index", frequency: "M", compute: (g) => g("macro:pmi_services"), scoring: A([45, 50, 55, 60], [10, 40, 70, 90]), decimals: 1 }),
  def({ id: "gst_yoy", name: "GST collections growth", factor: "macro", cluster: "growth", series: ["macro:gst"], units: "% YoY", frequency: "M", compute: (g) => yoy(g("macro:gst"), 40), scoring: P(1, [[0, 10, 20], [15, 50, 85]]) }),
  def({ id: "gdp_yoy", name: "Real GDP growth", factor: "macro", cluster: "growth", series: ["fred:NGDPRNSAXDCINQ"], units: "% YoY", frequency: "Q", compute: (g) => yoy(g("fred:NGDPRNSAXDCINQ"), 45), scoring: P(1, [[3, 6.5, 9], [10, 50, 85]]) }),
  def({ id: "consumer_confidence", name: "Consumer confidence", factor: "macro", cluster: "growth", series: ["macro:consumer_confidence"], units: "index", frequency: "Q", compute: (g) => g("macro:consumer_confidence"), scoring: P(1, [[80, 100, 115], [15, 50, 85]]), decimals: 1 }),
  def({ id: "cpi_yoy", name: "CPI inflation", factor: "macro", cluster: "inflation", series: ["macro:cpi_yoy", "fred:INDCPIALLMINMEI"], units: "% YoY", frequency: "M", compute: cpiYoy, scoring: A([1, 2, 4, 6, 8], [45, 60, 70, 40, 15]), description: "Scored against the RBI's 4% ± 2% target band: close to target is supportive; high or very low inflation is not." }),
  def({ id: "core_cpi_yoy", name: "Core CPI inflation", factor: "macro", cluster: "inflation", series: ["macro:core_cpi_yoy"], units: "% YoY", frequency: "M", compute: (g) => g("macro:core_cpi_yoy"), scoring: A([2, 4, 6, 8], [60, 70, 40, 15]) }),
  def({ id: "wpi_yoy", name: "WPI inflation", factor: "macro", cluster: "inflation", series: ["macro:wpi_yoy"], units: "% YoY", frequency: "M", compute: (g) => g("macro:wpi_yoy"), scoring: A([-3, 1, 4, 8, 12], [40, 60, 60, 35, 15]) }),
  def({ id: "exports_yoy", name: "Exports growth", factor: "macro", cluster: "external", series: ["fred:XTEXVA01INM667S"], units: "% YoY", frequency: "M", compute: (g) => yoy(g("fred:XTEXVA01INM667S"), 40), scoring: P(1, [[-10, 5, 20], [15, 50, 85]]) }),
  def({ id: "trade_deficit", name: "Merchandise trade deficit", factor: "macro", cluster: "external", series: ["macro:trade_deficit"], units: "USD bn", frequency: "M", compute: (g) => g("macro:trade_deficit"), scoring: P(-1, [[15, 22, 30], [80, 50, 15]]), decimals: 1 }),
  def({ id: "current_account", name: "Current account balance", factor: "macro", cluster: "external", series: ["macro:current_account"], units: "% of GDP", frequency: "Q", compute: (g) => g("macro:current_account"), scoring: A([-4, -2, 0], [10, 50, 75]) }),
  def({ id: "fiscal_deficit", name: "Fiscal deficit", factor: "macro", cluster: "fiscal", series: ["macro:fiscal_deficit"], units: "% of GDP", frequency: "M", compute: (g) => g("macro:fiscal_deficit"), scoring: A([3, 4.5, 6.5], [70, 50, 20]) }),
  def({ id: "fx_reserves", name: "Forex reserves", factor: "macro", cluster: "context", series: ["rbi:forex_reserves", "fred:TRESEGINM052N"], units: "USD", frequency: "M", compute: reserves, scoring: null, changeMode: "pct", decimals: 0 }),

  // ------------------------------------------------------------ retail / MF / IPO
  def({ id: "mf_inflow_3m", name: "Equity MF inflows (3M avg)", factor: "retail", cluster: "mf", series: ["retail:mf_equity_inflow"], units: "₹ Cr", frequency: "M", compute: (g) => rollingMean(g("retail:mf_equity_inflow"), 3), scoring: P(1), decimals: 0 }),
  def({ id: "sip_yoy", name: "SIP flows growth", factor: "retail", cluster: "mf", series: ["retail:sip"], units: "% YoY", frequency: "M", compute: (g) => yoy(g("retail:sip"), 40), scoring: P(1, [[0, 20, 40], [20, 50, 85]]) }),
  def({ id: "etf_flow_3m", name: "ETF inflows (3M avg)", factor: "retail", cluster: "mf", series: ["retail:etf_flow"], units: "₹ Cr", frequency: "M", compute: (g) => rollingMean(g("retail:etf_flow"), 3), scoring: P(1), decimals: 0 }),
  def({ id: "demat_adds_3m", name: "New demat accounts (3M avg)", factor: "retail", cluster: "participation", series: ["retail:demat_adds"], units: "mn", frequency: "M", compute: (g) => rollingMean(g("retail:demat_adds"), 3), scoring: P(1) }),
  def({ id: "fo_traders", name: "Unique F&O traders", factor: "retail", cluster: "participation", series: ["retail:fo_traders"], units: "mn", frequency: "M", compute: (g) => g("retail:fo_traders"), scoring: P(1) }),
  def({ id: "ipo_count_3m", name: "Mainboard IPOs (3M)", factor: "retail", cluster: "ipo", series: ["retail:ipo_count"], units: "count", frequency: "M", compute: (g) => rollingSum(g("retail:ipo_count"), 3), scoring: P(1), decimals: 0 }),
  def({ id: "sme_ipo_count_3m", name: "SME IPOs (3M)", factor: "retail", cluster: "ipo", series: ["retail:sme_ipo_count"], units: "count", frequency: "M", compute: (g) => rollingSum(g("retail:sme_ipo_count"), 3), scoring: P(1), decimals: 0 }),
  def({ id: "ipo_subscription", name: "Average IPO subscription", factor: "retail", cluster: "ipo", series: ["retail:ipo_subscription"], units: "x", frequency: "M", compute: (g) => g("retail:ipo_subscription"), scoring: P(1, [[3, 20, 80], [15, 50, 90]]), decimals: 1 }),
  def({ id: "ipo_listing_gain", name: "Average IPO listing gain", factor: "retail", cluster: "ipo", series: ["retail:ipo_listing_gain"], units: "%", frequency: "M", compute: (g) => g("retail:ipo_listing_gain"), scoring: P(1, [[-5, 10, 40], [15, 50, 90]]), decimals: 1 }),
];

export const INDICATOR_BY_ID: Record<string, IndicatorDef> = Object.fromEntries(INDICATORS.map((d) => [d.id, d]));

/** Factors without which the score is not a representative read of the Indian market (confidence drops sharply). */
export const CRITICAL_FACTORS: FactorId[] = ["momentum", "breadth", "derivatives", "volatility", "flows"];
