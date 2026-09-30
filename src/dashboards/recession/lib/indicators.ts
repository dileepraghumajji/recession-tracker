/**
 * Indicator catalogue: how each displayed indicator is derived from raw series,
 * which direction is "bad", how its stress metric is mapped to 0-100 and which
 * composite score / category / factor-cluster it belongs to.
 *
 * Design rules:
 * - An indicator belongs to at most ONE cluster within a given score, so
 *   correlated measures (e.g. CPI / core CPI / PCE / core PCE) share one slot.
 * - Percentile mapping is the default; absolute anchors are used only where an
 *   economically meaningful level exists (Sahm 0.5pp, curve inversion at 0,
 *   2% inflation target, 52-week drawdowns, GDP growth around 0).
 */
import type { Frequency, IndicatorMembership, Obs, Polarity, StressMapping } from "./types";
import { SERIES_BY_KEY } from "./series-catalog";
import { diff, drawdown, lagChange, movingAverage, rollingMin, sahmRule, spread, yoy } from "@/platform/lib/timeseries";

export type GroupId =
  | "rates"
  | "credit"
  | "labor"
  | "activity"
  | "housing"
  | "inflation"
  | "commodities"
  | "equity"
  | "conditions"
  | "consumer";

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: "rates", label: "Treasury / Yield Curve" },
  { id: "credit", label: "Credit Stress" },
  { id: "labor", label: "Labor Market" },
  { id: "activity", label: "Manufacturing / Activity" },
  { id: "housing", label: "Housing" },
  { id: "inflation", label: "Inflation" },
  { id: "commodities", label: "Commodities / Energy" },
  { id: "equity", label: "Equity Market" },
  { id: "conditions", label: "Financial Conditions" },
  { id: "consumer", label: "Consumer" },
];

type S = Record<string, Obs[]>;

export interface StressSpec {
  label: string;
  /** Builds the stress metric from the display series (defaults to the display series itself). */
  derive?: (display: Obs[], s: S) => Obs[];
  polarity: "higher_worse" | "lower_worse";
  mapping: StressMapping;
}

export interface IndicatorDef {
  id: string;
  name: string;
  group: GroupId;
  inputs: string[];
  display?: (s: S) => Obs[];
  units: string;
  /** Units used when rendering changes, e.g. "bps" for spreads. */
  changeUnits: "pp" | "bps" | "%" | "k" | "pts";
  changeMode: "diff" | "pct";
  polarity: Polarity;
  polarityNote: string;
  stress?: StressSpec;
  memberships: IndicatorMembership[];
  showZ?: boolean;
  decimals?: number;
  description: string;
  /** Static reason when no reliable, licensable, free source exists. */
  unavailableReason?: string;
  /** Show 12-month percentile (credit spreads). */
  percentile12m?: boolean;
  extras?: (display: Obs[], s: S) => Record<string, number | string | boolean | null>;
}

const pct: StressMapping = { kind: "percentile" };

function abs(anchors: [number, number, number, number, number], rationale: string): StressMapping {
  return { kind: "absolute", anchors, rationale };
}

const m = (score: IndicatorMembership["score"], category: string, cluster: string): IndicatorMembership => ({
  score,
  category,
  cluster,
});

const lvl = (key: string) => (s: S) => s[key] ?? [];
const yoyOf = (key: string) => (s: S) => yoy(s[key] ?? []);
const last = (o: Obs[]) => (o.length ? o[o.length - 1].value : null);

const PMI_ANCHORS: [number, number, number, number, number] = [58, 51, 48, 45, 40];
const PMI_RATIONALE =
  "50 separates expansion from contraction in the survey, but readings of 45-50 have frequently occurred without recession, so the Watch band starts just above 50 and Severe only below 45.";

function pmiExtras(display: Obs[]) {
  const cur = last(display);
  const ch3 = lagChange(display, 91, "diff", 25);
  return {
    distanceFrom50: cur === null ? null : cur - 50,
    threeMonthTrend: last(ch3),
  };
}

function ism(id: string, name: string, key: string, cluster: string): IndicatorDef {
  return {
    id,
    name,
    group: "activity",
    inputs: [key],
    units: "index",
    changeUnits: "pts",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Lower = weaker activity. Below 50 signals contraction in the survey, not necessarily recession.",
    stress: { label: "Level vs. 50", polarity: "lower_worse", mapping: abs(PMI_ANCHORS, PMI_RATIONALE) },
    memberships: [m("recession", "growth_labor", cluster)],
    description: `${name}. Diffusion index; 50 = no change in activity versus prior month.`,
    extras: pmiExtras,
  };
}

const CURVE_NOTE = "Lower / more inverted = historically associated with later recessions, with long and variable lags.";

export const INDICATORS: IndicatorDef[] = [
  // ------------------------------------------------------------------ RATES
  ...(
    [
      ["ust30y", "US 30Y Treasury yield", "DGS30"],
      ["ust10y", "US 10Y Treasury yield", "DGS10"],
      ["ust5y", "US 5Y Treasury yield", "DGS5"],
      ["ust2y", "US 2Y Treasury yield", "DGS2"],
      ["ust3m", "US 3M Treasury yield", "DGS3MO"],
    ] as const
  ).map(
    ([id, name, key]): IndicatorDef => ({
      id,
      name,
      group: "rates",
      inputs: [key],
      units: "%",
      changeUnits: "bps",
      changeMode: "diff",
      polarity: "context",
      polarityNote:
        "Context-dependent: rising yields can reflect stronger growth, higher inflation expectations or a higher term premium; falling yields can reflect growth fears or expected easing. Not scored as a recession signal on its own.",
      memberships: [],
      showZ: true,
      description: `${name} (constant maturity, H.15).`,
    }),
  ),
  {
    id: "fedfunds",
    name: "Effective Fed Funds rate",
    group: "rates",
    inputs: ["DFF"],
    units: "%",
    changeUnits: "bps",
    changeMode: "diff",
    polarity: "context",
    polarityNote: "Policy rate. Closely related to the 3M and 2Y yields, so it is not scored separately (avoids double counting).",
    memberships: [],
    description: "Effective federal funds rate.",
  },
  {
    id: "spread_10y2y",
    name: "10Y–2Y spread",
    group: "rates",
    inputs: ["DGS10", "DGS2"],
    display: (s) => spread(s.DGS10 ?? [], s.DGS2 ?? []),
    units: "pp",
    changeUnits: "bps",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: CURVE_NOTE,
    stress: {
      label: "Spread level",
      polarity: "lower_worse",
      mapping: abs([2.0, 0.5, 0.0, -0.5, -1.0], "Inversion (below 0) has preceded most post-war recessions, but with 6-24 month lags and at least one false signal."),
    },
    memberships: [m("recession", "curve_rates", "inversion")],
    showZ: true,
    description: "10-year minus 2-year Treasury yield.",
  },
  {
    id: "spread_10y3m",
    name: "10Y–3M spread",
    group: "rates",
    inputs: ["DGS10", "DGS3MO"],
    display: (s) => spread(s.DGS10 ?? [], s.DGS3MO ?? []),
    units: "pp",
    changeUnits: "bps",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: CURVE_NOTE,
    stress: {
      label: "Spread level",
      polarity: "lower_worse",
      mapping: abs([2.5, 0.75, 0.0, -0.75, -1.5], "The 10Y-3M spread is the NY Fed's preferred curve signal; inversion is the key threshold."),
    },
    memberships: [m("recession", "curve_rates", "inversion")],
    showZ: true,
    description: "10-year minus 3-month Treasury yield.",
  },
  {
    id: "curve_memory",
    name: "10Y–3M deepest inversion (trailing 24M)",
    group: "rates",
    inputs: ["DGS10", "DGS3MO"],
    display: (s) => rollingMin(spread(s.DGS10 ?? [], s.DGS3MO ?? []), 730),
    units: "pp",
    changeUnits: "bps",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Recessions have historically begun after the curve re-steepens, so the depth of a recent inversion is kept in view for 24 months.",
    stress: {
      label: "Minimum spread, trailing 24 months",
      polarity: "lower_worse",
      mapping: abs([1.0, 0.0, -0.5, -1.0, -1.5], "Captures that curve signals operate with long lags; decays after 24 months."),
    },
    memberships: [m("recession", "curve_rates", "inversion_memory")],
    description: "Minimum 10Y-3M spread over the trailing 24 months.",
  },
  {
    id: "spread_30y10y",
    name: "30Y–10Y spread",
    group: "rates",
    inputs: ["DGS30", "DGS10"],
    display: (s) => spread(s.DGS30 ?? [], s.DGS10 ?? []),
    units: "pp",
    changeUnits: "bps",
    changeMode: "diff",
    polarity: "context",
    polarityNote: "A steeper long end often reflects term-premium / fiscal-supply concerns rather than growth expectations.",
    memberships: [],
    showZ: true,
    description: "30-year minus 10-year Treasury yield.",
  },
  {
    id: "spread_2y3m",
    name: "2Y–3M spread (expected policy path)",
    group: "rates",
    inputs: ["DGS2", "DGS3MO"],
    display: (s) => spread(s.DGS2 ?? [], s.DGS3MO ?? []),
    units: "pp",
    changeUnits: "bps",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "A 2Y yield well below the 3M bill means markets are pricing rate cuts - often (not always) in response to expected weakness.",
    stress: {
      label: "Spread level",
      polarity: "lower_worse",
      mapping: abs([0.75, 0.0, -0.35, -0.75, -1.25], "Deeply negative values imply markets expect substantial easing over two years."),
    },
    memberships: [m("recession", "curve_rates", "easing")],
    showZ: true,
    description: "2-year minus 3-month Treasury yield: proxy for expected short-rate changes.",
  },
  {
    id: "real10y",
    name: "10Y real yield (TIPS)",
    group: "rates",
    inputs: ["DFII10"],
    units: "%",
    changeUnits: "bps",
    changeMode: "diff",
    polarity: "context",
    polarityNote: "Higher real yields tighten financial conditions but also reflect stronger growth expectations.",
    memberships: [],
    showZ: true,
    description: "10-year Treasury Inflation-Indexed yield.",
  },
  {
    id: "termpremium",
    name: "10Y term premium (Kim-Wright)",
    group: "rates",
    inputs: ["THREEFYTP10"],
    units: "%",
    changeUnits: "bps",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote:
      "A higher term premium tightens financial conditions (fiscal/supply risk, rate uncertainty). It is a model estimate and is NOT itself a recession signal - weighted lightly.",
    stress: { label: "Level percentile", polarity: "higher_worse", mapping: pct },
    memberships: [m("recession", "curve_rates", "term_premium"), m("financial", "rates", "term_premium")],
    showZ: true,
    description: "Model-based 10-year term premium from the Federal Reserve Board (Kim-Wright).",
  },
  {
    id: "ust10y_vol",
    name: "10Y yield: absolute 3M move (rates volatility proxy)",
    group: "rates",
    inputs: ["DGS10"],
    display: (s) => lagChange(s.DGS10 ?? [], 91, "diff", 7).map((o) => ({ date: o.date, value: Math.abs(o.value) * 100 })),
    units: "bps",
    changeUnits: "bps",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "Large moves in either direction signal rates volatility (the MOVE index is proprietary).",
    stress: { label: "Absolute 3M change percentile", polarity: "higher_worse", mapping: pct },
    memberships: [m("financial", "rates", "rates_vol")],
    decimals: 0,
    description: "Absolute 3-month change in the 10Y yield, in basis points.",
  },

  // ----------------------------------------------------------------- CREDIT
  ...(
    [
      ["hy_oas", "US High Yield OAS", "BAMLH0A0HYM2", "high_yield", "high_yield"],
      ["ccc_oas", "CCC & lower OAS", "BAMLH0A3HYC", "high_yield", "high_yield"],
      ["ig_oas", "Investment Grade OAS", "BAMLC0A0CM", "investment_grade", "investment_grade"],
      ["bbb_oas", "BBB corporate OAS", "BAMLC0A4CBBB", "investment_grade", "investment_grade"],
      ["baa10y", "Baa – 10Y Treasury spread", "BAA10Y", "investment_grade", "investment_grade"],
    ] as const
  ).map(
    ([id, name, key, rcluster, fcluster]): IndicatorDef => ({
      id,
      name,
      group: "credit",
      inputs: [key],
      units: "%",
      changeUnits: "bps",
      changeMode: "diff",
      polarity: "higher_worse",
      polarityNote: "Wider spreads = investors demand more compensation for default risk.",
      stress: { label: "Spread level percentile", polarity: "higher_worse", mapping: pct },
      memberships: [m("recession", "credit_financial", rcluster), m("financial", "credit", fcluster)],
      showZ: true,
      percentile12m: true,
      description: `${name} (option-adjusted / yield spread over Treasuries).`,
      extras: (d) => {
        const w3 = lagChange(d, 91, "diff", 7);
        return { wideningBps3m: last(w3) === null ? null : (last(w3) as number) * 100 };
      },
    }),
  ),
  {
    id: "hy_widening",
    name: "HY OAS rate of widening (3M)",
    group: "credit",
    inputs: ["BAMLH0A0HYM2"],
    display: (s) => lagChange(s.BAMLH0A0HYM2 ?? [], 91, "diff", 7).map((o) => ({ date: o.date, value: o.value * 100 })),
    units: "bps",
    changeUnits: "bps",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "Rapid widening often matters more than the level.",
    stress: {
      label: "3M widening",
      polarity: "higher_worse",
      mapping: abs([-100, 25, 75, 150, 300], "Historical stress episodes feature 3M widening of 100-300+ bps; absolute anchors are used because FRED's ICE history is short."),
    },
    memberships: [m("recession", "credit_financial", "high_yield"), m("financial", "credit", "high_yield")],
    decimals: 0,
    description: "3-month change in the high-yield OAS, basis points.",
  },
  {
    id: "fin_spread",
    name: "Financial-sector credit spread",
    group: "credit",
    inputs: [],
    units: "%",
    changeUnits: "bps",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "Wider = more bank/financial-sector stress.",
    memberships: [],
    unavailableReason: "No free, licensable official daily series. Sector OAS indices are proprietary (ICE/Bloomberg).",
    description: "Financial-sector corporate bond spread.",
  },

  // ------------------------------------------------------------------ LABOR
  {
    id: "unrate",
    name: "Unemployment rate",
    group: "labor",
    inputs: ["UNRATE"],
    units: "%",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "Rising unemployment = deteriorating. The change matters more than the level.",
    stress: {
      label: "12-month change (pp)",
      derive: (d) => lagChange(d, 365, "diff", 20),
      polarity: "higher_worse",
      mapping: abs([-0.5, 0.1, 0.3, 0.5, 1.0], "Increases of 0.5pp+ over a year have been rare outside downturns."),
    },
    memberships: [m("recession", "growth_labor", "unemployment")],
    decimals: 1,
    description: "U-3 unemployment rate (BLS household survey).",
  },
  {
    id: "sahm",
    name: "Sahm Rule indicator",
    group: "labor",
    inputs: ["UNRATE"],
    display: (s) => sahmRule(s.UNRATE ?? []),
    units: "pp",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote:
      "3M avg unemployment minus its minimum over the prior 12 months. Crossing 0.50pp has historically coincided with early recession, but it is a heuristic, not a guarantee (e.g. labour-supply shocks can trigger it).",
    stress: {
      label: "Sahm value",
      polarity: "higher_worse",
      mapping: abs([-0.2, 0.2, 0.35, 0.5, 0.8], "0.50pp is the published Sahm threshold; the Severe band begins exactly there."),
    },
    memberships: [m("recession", "growth_labor", "unemployment")],
    decimals: 2,
    description: "Sahm Rule recession indicator computed from UNRATE.",
    extras: (d) => {
      const v = last(d);
      return { threshold: 0.5, crossed: v === null ? null : v >= 0.5, distanceToThreshold: v === null ? null : 0.5 - v };
    },
  },
  {
    id: "claims_initial",
    name: "Initial jobless claims",
    group: "labor",
    inputs: ["ICSA"],
    units: "claims",
    changeUnits: "%",
    changeMode: "pct",
    polarity: "higher_worse",
    polarityNote: "Rising claims = more layoffs.",
    stress: {
      label: "YoY % change, 4-week average",
      derive: (d) => yoy(movingAverage(d, 4), 10),
      polarity: "higher_worse",
      mapping: pct,
    },
    memberships: [m("recession", "growth_labor", "claims")],
    decimals: 0,
    description: "Weekly initial unemployment insurance claims (SA). Stress uses the YoY change of the 4-week average to strip noise and trend growth in the labour force.",
  },
  {
    id: "claims_continuing",
    name: "Continuing claims",
    group: "labor",
    inputs: ["CCSA"],
    units: "claims",
    changeUnits: "%",
    changeMode: "pct",
    polarity: "higher_worse",
    polarityNote: "Rising continuing claims = slower re-employment.",
    stress: { label: "YoY % change, 4-week average", derive: (d) => yoy(movingAverage(d, 4), 10), polarity: "higher_worse", mapping: pct },
    memberships: [m("recession", "growth_labor", "claims")],
    decimals: 0,
    description: "Insured unemployment (continuing claims, SA).",
  },
  {
    id: "payrolls",
    name: "Nonfarm payroll change (monthly)",
    group: "labor",
    inputs: ["PAYEMS"],
    display: (s) => diff(s.PAYEMS ?? []),
    units: "k jobs",
    changeUnits: "k",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Lower job growth = weaker. Single months are noisy; the 3M average is the scored measure.",
    memberships: [],
    decimals: 0,
    description: "Monthly change in total nonfarm payrolls (thousands).",
  },
  {
    id: "payrolls_3m",
    name: "Payroll growth, 3-month average",
    group: "labor",
    inputs: ["PAYEMS"],
    display: (s) => movingAverage(diff(s.PAYEMS ?? []), 3),
    units: "k jobs",
    changeUnits: "k",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Lower = weaker hiring. Breakeven job growth varies with labour-force growth.",
    stress: { label: "3M avg percentile", polarity: "lower_worse", mapping: pct },
    memberships: [m("recession", "growth_labor", "payrolls")],
    decimals: 0,
    description: "3-month moving average of monthly payroll changes (thousands).",
  },
  {
    id: "ahe_yoy",
    name: "Average hourly earnings, YoY",
    group: "labor",
    inputs: ["CES0500000003"],
    display: yoyOf("CES0500000003"),
    units: "%",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "context",
    polarityNote: "Context: firm wage growth supports consumption but can sustain inflation. Scored only in Inflation Stress.",
    stress: {
      label: "YoY wage growth",
      polarity: "higher_worse",
      mapping: abs([2.0, 3.8, 4.5, 5.5, 7.0], "Wage growth near 3.5-4% is roughly consistent with 2% inflation given trend productivity."),
    },
    memberships: [m("inflation", "wages", "wages")],
    decimals: 1,
    description: "Average hourly earnings of all private employees, year-over-year.",
  },
  {
    id: "jolts",
    name: "Job openings (JOLTS)",
    group: "labor",
    inputs: ["JTSJOL"],
    units: "thousands",
    changeUnits: "%",
    changeMode: "pct",
    polarity: "lower_worse",
    polarityNote: "Falling openings = cooling labour demand (a normalisation from very high levels is not necessarily stress).",
    stress: { label: "YoY % change percentile", derive: (d) => yoy(d), polarity: "lower_worse", mapping: pct },
    memberships: [m("recession", "growth_labor", "labor_demand")],
    decimals: 0,
    description: "JOLTS total nonfarm job openings (thousands).",
  },
  {
    id: "quits",
    name: "Quits rate (JOLTS)",
    group: "labor",
    inputs: ["JTSQUR"],
    units: "%",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Fewer quits = workers less confident about finding new jobs.",
    stress: { label: "Level percentile", polarity: "lower_worse", mapping: pct },
    memberships: [m("recession", "growth_labor", "labor_demand")],
    decimals: 1,
    description: "JOLTS quits rate, total nonfarm.",
  },

  // --------------------------------------------------------------- ACTIVITY
  ism("ism_mfg", "ISM Manufacturing PMI", "ISM_MFG_PMI", "surveys"),
  ism("ism_mfg_no", "ISM Manufacturing New Orders", "ISM_MFG_NO", "surveys"),
  ism("ism_mfg_emp", "ISM Manufacturing Employment", "ISM_MFG_EMP", "surveys"),
  ism("ism_svc", "ISM Services PMI", "ISM_SVC_PMI", "surveys"),
  ism("ism_svc_no", "ISM Services New Orders", "ISM_SVC_NO", "surveys"),
  ...(
    [
      ["philly", "Philadelphia Fed manufacturing activity", "PHILLY_MFG"],
      ["empire", "Empire State manufacturing conditions", "EMPIRE_MFG"],
    ] as const
  ).map(
    ([id, name, key]): IndicatorDef => ({
      id,
      name,
      group: "activity",
      inputs: [key],
      units: "diffusion",
      changeUnits: "pts",
      changeMode: "diff",
      polarity: "lower_worse",
      polarityNote: "Below 0 = more firms reporting declines than increases. Noisy month to month; scored on a 3M average.",
      stress: {
        label: "3M average level",
        derive: (d) => movingAverage(d, 3),
        polarity: "lower_worse",
        mapping: abs([25, 0, -10, -20, -35], "Zero separates expansion from contraction in regional Fed diffusion indices."),
      },
      memberships: [m("recession", "growth_labor", "surveys")],
      decimals: 1,
      description: `${name} (regional Federal Reserve survey; freely available proxy for ISM).`,
      extras: pmiExtras,
    }),
  ),
  {
    id: "indpro_yoy",
    name: "Industrial production, YoY",
    group: "activity",
    inputs: ["INDPRO"],
    display: yoyOf("INDPRO"),
    units: "%",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Lower = weaker output.",
    stress: { label: "YoY percentile", polarity: "lower_worse", mapping: pct },
    memberships: [m("recession", "growth_labor", "activity")],
    decimals: 1,
    description: "Industrial production index, year-over-year % change.",
  },
  {
    id: "retail_real_yoy",
    name: "Real retail sales, YoY",
    group: "activity",
    inputs: ["RRSFS"],
    display: yoyOf("RRSFS"),
    units: "%",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Lower = weaker consumer demand for goods.",
    stress: { label: "YoY percentile", polarity: "lower_worse", mapping: pct },
    memberships: [m("recession", "growth_labor", "activity")],
    decimals: 1,
    description: "Real retail and food services sales, YoY.",
  },
  {
    id: "pce_real_yoy",
    name: "Real personal consumption, YoY",
    group: "activity",
    inputs: ["PCEC96"],
    display: yoyOf("PCEC96"),
    units: "%",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Lower = weaker consumption (~2/3 of GDP).",
    stress: { label: "YoY percentile", polarity: "lower_worse", mapping: pct },
    memberships: [m("recession", "growth_labor", "activity")],
    decimals: 1,
    description: "Real PCE, YoY.",
  },
  {
    id: "gdp",
    name: "Real GDP growth (q/q SAAR)",
    group: "activity",
    inputs: ["GDPC1_GROWTH"],
    units: "%",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Lower = weaker growth. Single quarters are noisy and revised.",
    stress: { label: "Growth level", polarity: "lower_worse", mapping: abs([4.0, 1.5, 0.5, -0.5, -3.0], "Trend growth is ~1.8-2%; sub-1% growth has typically accompanied slowdowns.") },
    memberships: [m("recession", "growth_labor", "activity")],
    decimals: 1,
    description: "Real GDP, percent change from preceding quarter, SAAR.",
  },
  {
    id: "gdpnow",
    name: "Atlanta Fed GDPNow",
    group: "activity",
    inputs: ["GDPNOW"],
    units: "%",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Model nowcast of current-quarter growth; volatile early in the quarter.",
    stress: { label: "Nowcast level", polarity: "lower_worse", mapping: abs([4.0, 1.5, 0.5, -0.5, -3.0], "Same anchors as reported GDP growth.") },
    memberships: [m("recession", "growth_labor", "activity")],
    decimals: 1,
    description: "Atlanta Fed GDPNow model estimate for the current quarter.",
  },

  // ---------------------------------------------------------------- HOUSING
  ...(
    [
      ["houst", "Housing starts", "HOUST", "construction"],
      ["permits", "Building permits", "PERMIT", "construction"],
      ["existing_sales", "Existing home sales", "EXHOSLUSM495S", "sales"],
      ["new_sales", "New home sales", "HSN1F", "sales"],
    ] as const
  ).map(
    ([id, name, key, cluster]): IndicatorDef => ({
      id,
      name,
      group: "housing",
      inputs: [key],
      units: SERIES_BY_KEY[key].units,
      changeUnits: "%",
      changeMode: "pct",
      polarity: "lower_worse",
      polarityNote: "Falling housing activity has historically led broader downturns.",
      stress: { label: "YoY % change percentile", derive: (d) => yoy(d), polarity: "lower_worse", mapping: pct },
      memberships: [m("recession", "housing", cluster)],
      decimals: 0,
      description: `${name} (SAAR). Stress measured on the YoY change.`,
      extras: (d) => ({ yoyPct: last(yoy(d)), threeMonthPct: last(lagChange(d, 91, "pct", 25)) }),
    }),
  ),
  {
    id: "affordability",
    name: "Housing affordability index (NAR)",
    group: "housing",
    inputs: ["FIXHAI"],
    units: "index",
    changeUnits: "pts",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Lower = less affordable (100 = median family income exactly qualifies for median home).",
    stress: { label: "Level percentile", polarity: "lower_worse", mapping: pct },
    memberships: [m("recession", "housing", "affordability")],
    decimals: 1,
    description: "NAR fixed-rate housing affordability index.",
  },
  {
    id: "mortgage30",
    name: "30Y fixed mortgage rate",
    group: "housing",
    inputs: ["MORTGAGE30US"],
    units: "%",
    changeUnits: "bps",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "Higher mortgage rates reduce affordability. Stress is measured on the 12-month change (rate shock) because the level's long history is dominated by the 1980s.",
    stress: { label: "12M change percentile", derive: (d) => lagChange(d, 365, "diff", 10), polarity: "higher_worse", mapping: pct },
    memberships: [m("recession", "housing", "affordability")],
    decimals: 2,
    showZ: true,
    description: "Freddie Mac PMMS 30-year fixed rate.",
  },
  {
    id: "months_supply",
    name: "New home months' supply",
    group: "housing",
    inputs: ["MSACSR"],
    units: "months",
    changeUnits: "pts",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "Rising unsold inventory relative to sales = softening demand.",
    stress: { label: "Level percentile", polarity: "higher_worse", mapping: pct },
    memberships: [m("recession", "housing", "inventory")],
    decimals: 1,
    description: "Months' supply of new houses for sale.",
  },
  {
    id: "listings",
    name: "Active housing listings",
    group: "housing",
    inputs: ["ACTLISCOUUS"],
    units: "listings",
    changeUnits: "%",
    changeMode: "pct",
    polarity: "context",
    polarityNote: "Context: more listings improve affordability but may signal weakening demand. Short history (2016+); not scored.",
    memberships: [],
    decimals: 0,
    description: "Realtor.com active listing count (US).",
    extras: (d) => ({ yoyPct: last(yoy(d)) }),
  },

  // -------------------------------------------------------------- INFLATION
  ...(
    [
      ["cpi_yoy", "CPI inflation, YoY", "CPIAUCSL", "headline"],
      ["core_cpi_yoy", "Core CPI inflation, YoY", "CPILFESL", "core"],
      ["pce_yoy", "PCE inflation, YoY", "PCEPI", "headline"],
      ["core_pce_yoy", "Core PCE inflation, YoY", "PCEPILFE", "core"],
    ] as const
  ).map(
    ([id, name, key, cluster]): IndicatorDef => ({
      id,
      name,
      group: "inflation",
      inputs: [key],
      display: yoyOf(key),
      units: "%",
      changeUnits: "pp",
      changeMode: "diff",
      polarity: "higher_worse",
      polarityNote: "Actual (realised) inflation. Higher = more inflation pressure relative to the Fed's 2% (PCE) target.",
      stress: {
        label: "YoY level vs. 2% target",
        polarity: "higher_worse",
        mapping:
          cluster === "core"
            ? abs([1.0, 2.4, 3.2, 4.5, 7.0], "Anchored to the Fed's 2% target: Watch begins modestly above target, Severe at 4.5%+ core.")
            : abs([1.0, 2.5, 3.5, 5.0, 8.0], "Anchored to the Fed's 2% target; headline is allowed more energy-driven volatility."),
      },
      memberships:
        cluster === "core"
          ? [m("inflation", "realized", "core"), m("recession", "inflation_energy", "core_inflation")]
          : [m("inflation", "realized", "headline")],
      decimals: 1,
      description: `${name}. Realised inflation.`,
    }),
  ),
  ...(
    [
      ["be5y", "5Y breakeven inflation", "T5YIE"],
      ["be10y", "10Y breakeven inflation", "T10YIE"],
    ] as const
  ).map(
    ([id, name, key]): IndicatorDef => ({
      id,
      name,
      group: "inflation",
      inputs: [key],
      units: "%",
      changeUnits: "bps",
      changeMode: "diff",
      polarity: "higher_worse",
      polarityNote: "Market-implied inflation expectations (nominal minus TIPS yield; includes an inflation risk / liquidity premium).",
      stress: {
        label: "Breakeven level",
        polarity: "higher_worse",
        mapping: abs([1.5, 2.4, 2.7, 3.0, 3.5], "CPI-based breakevens of ~2.3-2.5% are consistent with 2% PCE; sustained moves above 2.7% suggest de-anchoring risk."),
      },
      memberships: [m("inflation", "market_expectations", "breakevens")],
      showZ: true,
      decimals: 2,
      description: `${name} (market expectations).`,
    }),
  ),
  {
    id: "mich_1y",
    name: "UMich 1Y inflation expectations",
    group: "inflation",
    inputs: ["MICH"],
    units: "%",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "Survey (household) inflation expectations.",
    stress: { label: "Survey level", polarity: "higher_worse", mapping: abs([2.0, 3.2, 4.0, 5.0, 7.0], "Pre-2020 norm was roughly 2.5-3.2%.") },
    memberships: [m("inflation", "survey_expectations", "survey")],
    decimals: 1,
    description: "University of Michigan median expected price change, next 12 months.",
  },

  // ------------------------------------------------------------ COMMODITIES
  ...(
    [
      ["wti", "WTI crude", "DCOILWTICO", "oil"],
      ["brent", "Brent crude", "DCOILBRENTEU", "oil"],
    ] as const
  ).map(
    ([id, name, key, cluster]): IndicatorDef => ({
      id,
      name,
      group: "commodities",
      inputs: [key],
      units: "$/bbl",
      changeUnits: "%",
      changeMode: "pct",
      polarity: "context",
      polarityNote: "Context: oil up can signal inflation pressure (supply shock) or strong demand; oil down can signal weak demand.",
      stress: {
        label: "YoY % change (inflation impulse)",
        derive: (d) => yoy(d, 7),
        polarity: "higher_worse",
        mapping: abs([-20, 10, 30, 50, 100], "Oil shocks of +30-50% YoY have historically pushed headline inflation up materially."),
      },
      memberships: [m("inflation", "energy", cluster), m("recession", "inflation_energy", "energy")],
      decimals: 2,
      description: `${name} spot price.`,
    }),
  ),
  {
    id: "natgas",
    name: "Henry Hub natural gas",
    group: "commodities",
    inputs: ["DHHNGSP"],
    units: "$/MMBtu",
    changeUnits: "%",
    changeMode: "pct",
    polarity: "context",
    polarityNote: "Context: very volatile; matters mostly through utility and industrial costs.",
    stress: { label: "YoY % change", derive: (d) => yoy(d, 7), polarity: "higher_worse", mapping: abs([-30, 20, 50, 100, 200], "Natural gas is far more volatile than oil; anchors are correspondingly wider.") },
    memberships: [m("inflation", "energy", "natgas")],
    decimals: 2,
    description: "Henry Hub natural gas spot price.",
  },
  {
    id: "gold",
    name: "Gold",
    group: "commodities",
    inputs: ["GOLD"],
    units: "$/oz",
    changeUnits: "%",
    changeMode: "pct",
    polarity: "context",
    polarityNote: "Context: safe-haven demand, real-rate and dollar driven. Not scored.",
    memberships: [],
    decimals: 0,
    description: "Gold spot (XAU/USD).",
  },
  {
    id: "copper",
    name: "Copper",
    group: "commodities",
    inputs: ["PCOPPUSDM"],
    units: "$/t",
    changeUnits: "%",
    changeMode: "pct",
    polarity: "context",
    polarityNote: "Context: sensitive to global (especially Chinese) industrial demand. Not scored.",
    memberships: [],
    decimals: 0,
    description: "Global copper price (monthly average).",
  },

  // ----------------------------------------------------------------- EQUITY
  ...(
    [
      ["sp500", "S&P 500", "SP500"],
      ["ndx", "Nasdaq 100", "NASDAQ100"],
      ["rut", "Russell 2000 (IWM proxy)", "RUT_PROXY"],
    ] as const
  ).map(
    ([id, name, key]): IndicatorDef => ({
      id,
      name,
      group: "equity",
      inputs: [key],
      units: "index",
      changeUnits: "%",
      changeMode: "pct",
      polarity: "lower_worse",
      polarityNote: "Falling prices = tighter financial conditions and weaker risk appetite.",
      stress: {
        label: "Drawdown from 52-week high",
        derive: (d) => drawdown(d, 365),
        polarity: "lower_worse",
        mapping: abs([0, -5, -10, -20, -35], "Conventional correction (-10%) and bear-market (-20%) thresholds."),
      },
      memberships: [m("recession", "equity", "drawdown"), m("financial", "equity", "drawdown")],
      decimals: 0,
      description: `${name}.`,
      extras: (d) => ({
        drawdownPct: last(drawdown(d, 365)),
        momentum1mPct: last(lagChange(d, 30, "pct", 7)),
        momentum3mPct: last(lagChange(d, 91, "pct", 7)),
      }),
    }),
  ),
  {
    id: "sp500_mom3m",
    name: "S&P 500 3-month momentum",
    group: "equity",
    inputs: ["SP500"],
    display: (s) => lagChange(s.SP500 ?? [], 91, "pct", 7),
    units: "%",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Negative momentum = deteriorating risk appetite.",
    stress: { label: "3M return percentile", polarity: "lower_worse", mapping: pct },
    memberships: [m("recession", "equity", "momentum")],
    decimals: 1,
    description: "S&P 500 price return over the past ~3 months.",
  },
  {
    id: "vix",
    name: "VIX",
    group: "equity",
    inputs: ["VIXCLS"],
    units: "index",
    changeUnits: "pts",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "Higher implied volatility = more market stress.",
    stress: { label: "Level percentile", polarity: "higher_worse", mapping: pct },
    memberships: [m("recession", "equity", "volatility"), m("financial", "volatility", "vix")],
    showZ: true,
    decimals: 1,
    description: "CBOE S&P 500 implied volatility index.",
  },
  ...(
    [
      ["fwd_pe", "S&P 500 forward P/E"],
      ["earnings_yield", "S&P 500 earnings yield"],
      ["erp", "10Y Treasury minus S&P earnings yield"],
      ["breadth", "Market breadth (% above 200-day)"],
    ] as const
  ).map(
    ([id, name]): IndicatorDef => ({
      id,
      name,
      group: "equity",
      inputs: [],
      units: "",
      changeUnits: "pts",
      changeMode: "diff",
      polarity: "context",
      polarityNote: "Valuation / breadth context.",
      memberships: [],
      unavailableReason:
        "Consensus forward earnings and constituent-level breadth are proprietary (FactSet, S&P, LSEG). No reliable free API is licensed for redistribution, so the value is not shown rather than estimated.",
      description: name,
    }),
  ),

  // ------------------------------------------------------------- CONDITIONS
  {
    id: "nfci",
    name: "Chicago Fed NFCI",
    group: "conditions",
    inputs: ["NFCI"],
    units: "index",
    changeUnits: "pts",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "Positive = tighter than average financial conditions.",
    stress: { label: "Level percentile", polarity: "higher_worse", mapping: pct },
    memberships: [m("recession", "credit_financial", "conditions"), m("financial", "conditions", "nfci")],
    showZ: true,
    decimals: 2,
    description: "Chicago Fed National Financial Conditions Index (105 measures of risk, credit and leverage).",
  },
  {
    id: "anfci",
    name: "Chicago Fed Adjusted NFCI",
    group: "conditions",
    inputs: ["ANFCI"],
    units: "index",
    changeUnits: "pts",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "NFCI purged of the influence of current economic conditions.",
    stress: { label: "Level percentile", polarity: "higher_worse", mapping: pct },
    memberships: [m("recession", "credit_financial", "conditions"), m("financial", "conditions", "nfci")],
    showZ: true,
    decimals: 2,
    description: "Chicago Fed Adjusted NFCI.",
  },
  {
    id: "gsfci",
    name: "Goldman Sachs Financial Conditions Index",
    group: "conditions",
    inputs: [],
    units: "",
    changeUnits: "pts",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "",
    memberships: [],
    unavailableReason: "Proprietary to Goldman Sachs; no licensed public API. The Chicago Fed NFCI is used instead.",
    description: "GS FCI.",
  },
  {
    id: "dollar",
    name: "Broad US dollar index",
    group: "conditions",
    inputs: ["DTWEXBGS"],
    units: "index",
    changeUnits: "%",
    changeMode: "pct",
    polarity: "context",
    polarityNote: "Context: a rapidly rising dollar tightens global financial conditions.",
    stress: { label: "YoY % change", derive: (d) => yoy(d, 7), polarity: "higher_worse", mapping: pct },
    memberships: [m("financial", "dollar", "dollar")],
    decimals: 1,
    description: "Nominal broad trade-weighted dollar index (Federal Reserve Board).",
  },
  {
    id: "sloos",
    name: "Bank lending standards (SLOOS, C&I)",
    group: "conditions",
    inputs: ["DRTSCILM"],
    units: "net %",
    changeUnits: "pts",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "Positive = more banks tightening than easing.",
    stress: { label: "Net % tightening", polarity: "higher_worse", mapping: abs([-20, 5, 20, 40, 70], "Net tightening above ~20% has accompanied most credit crunches; 0 = neutral.") },
    memberships: [m("recession", "credit_financial", "lending")],
    decimals: 1,
    description: "Senior Loan Officer Opinion Survey: net percentage of domestic banks tightening standards for C&I loans to large and middle-market firms.",
  },

  // --------------------------------------------------------------- CONSUMER
  {
    id: "umcsent",
    name: "UMich consumer sentiment",
    group: "consumer",
    inputs: ["UMCSENT"],
    units: "index",
    changeUnits: "pts",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Lower = more pessimistic households (sentiment has been a weak predictor of spending recently).",
    stress: { label: "Level percentile", polarity: "lower_worse", mapping: pct },
    memberships: [m("recession", "consumer", "sentiment")],
    decimals: 1,
    description: "University of Michigan index of consumer sentiment.",
  },
  {
    id: "consumer_conf",
    name: "Consumer confidence (OECD, US)",
    group: "consumer",
    inputs: ["OECD_CONF"],
    units: "index",
    changeUnits: "pts",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Lower = weaker confidence. (The Conference Board index is proprietary; the OECD series is used.)",
    stress: { label: "Level percentile", polarity: "lower_worse", mapping: pct },
    memberships: [m("recession", "consumer", "sentiment")],
    decimals: 1,
    description: "OECD consumer confidence indicator for the US.",
  },
  {
    id: "cc_delinq",
    name: "Credit-card delinquency rate",
    group: "consumer",
    inputs: ["DRCCLACBS"],
    units: "%",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "Higher = more households falling behind.",
    stress: { label: "Level percentile", polarity: "higher_worse", mapping: pct },
    memberships: [m("recession", "consumer", "credit_health")],
    decimals: 2,
    description: "Delinquency rate on credit card loans, all commercial banks (SA).",
  },
  {
    id: "consumer_delinq",
    name: "Consumer loan delinquency rate",
    group: "consumer",
    inputs: ["DRCLACBS"],
    units: "%",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "Higher = more stress across consumer credit (includes cards and other consumer loans).",
    stress: { label: "Level percentile", polarity: "higher_worse", mapping: pct },
    memberships: [m("recession", "consumer", "credit_health")],
    decimals: 2,
    description: "Delinquency rate on consumer loans, all commercial banks (SA).",
  },
  {
    id: "auto_delinq",
    name: "Auto loan delinquency rate",
    group: "consumer",
    inputs: [],
    units: "%",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "",
    memberships: [],
    unavailableReason: "Published quarterly in the NY Fed Household Debt and Credit Report (Equifax data) without a stable machine-readable API. Consumer-loan delinquency (Fed) is used instead.",
    description: "Auto loan delinquency.",
  },
  {
    id: "dsr",
    name: "Household debt service ratio",
    group: "consumer",
    inputs: ["TDSP"],
    units: "% DPI",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "higher_worse",
    polarityNote: "Higher = more income absorbed by debt payments.",
    stress: { label: "Level percentile", polarity: "higher_worse", mapping: pct },
    memberships: [m("recession", "consumer", "debt_service")],
    decimals: 2,
    description: "Household debt service payments as % of disposable personal income.",
  },
  {
    id: "savings",
    name: "Personal saving rate",
    group: "consumer",
    inputs: ["PSAVERT"],
    units: "%",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Lower = thinner household buffers (but a rising rate can also reflect precautionary saving).",
    stress: { label: "Level percentile", polarity: "lower_worse", mapping: pct },
    memberships: [m("recession", "consumer", "income")],
    decimals: 1,
    description: "Personal saving as % of disposable personal income.",
  },
  {
    id: "rdpi_yoy",
    name: "Real disposable income, YoY",
    group: "consumer",
    inputs: ["DSPIC96"],
    display: yoyOf("DSPIC96"),
    units: "%",
    changeUnits: "pp",
    changeMode: "diff",
    polarity: "lower_worse",
    polarityNote: "Lower = weaker real household income growth.",
    stress: { label: "YoY percentile", polarity: "lower_worse", mapping: pct },
    memberships: [m("recession", "consumer", "income")],
    decimals: 1,
    description: "Real disposable personal income, YoY.",
  },
];

export const INDICATOR_BY_ID: Record<string, IndicatorDef> = Object.fromEntries(INDICATORS.map((d) => [d.id, d]));

export function indicatorFrequency(def: IndicatorDef): Frequency {
  const order: Frequency[] = ["D", "W", "M", "Q"];
  let f: Frequency = "D";
  for (const k of def.inputs) {
    const sf = SERIES_BY_KEY[k]?.frequency ?? "D";
    if (order.indexOf(sf) > order.indexOf(f)) f = sf;
  }
  return f;
}

/** Build the displayed series for an indicator from raw series observations. */
export function buildDisplay(def: IndicatorDef, s: S): Obs[] {
  if (def.inputs.length === 0) return [];
  if (def.display) return def.display(s);
  return lvl(def.inputs[0])(s);
}
