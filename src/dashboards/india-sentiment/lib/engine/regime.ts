/**
 * Market regime classifier. Separate from the sentiment score: each regime
 * requires several independent conditions (different factor groups), and the
 * matched/unmatched conditions are shown so the classification is auditable.
 */
import type { FactorId, FactorResult, IndicatorReading } from "../types";

export type RegimeId =
  | "RISK-ON"
  | "RISK-OFF"
  | "CAUTIOUS RISK-ON"
  | "CAUTIOUS RISK-OFF"
  | "NEUTRAL"
  | "HIGH-VOLATILITY"
  | "LIQUIDITY-DRIVEN"
  | "MACRO-DRIVEN"
  | "EARNINGS-DRIVEN"
  | "EVENT-DRIVEN"
  | "STAGFLATIONARY"
  | "DEFLATIONARY";

export interface Condition {
  text: string;
  met: boolean | null;
}

export interface RegimeCandidate {
  id: RegimeId;
  conditions: Condition[];
  matched: boolean;
}

export interface RegimeResult {
  primary: RegimeId | null;
  secondary: RegimeId[];
  candidates: RegimeCandidate[];
  text: string;
}

export interface RegimeInputs {
  score: number | null;
  factors: Record<FactorId, FactorResult>;
  byId: Record<string, IndicatorReading>;
  /** Current-expiry ATM IV minus next-expiry ATM IV (vol points), if available. */
  ivTermInversion: number | null;
}

const cond = (text: string, v: boolean | null): Condition => ({ text, met: v });
const ge = (x: number | null | undefined, t: number) => (x === null || x === undefined ? null : x >= t);
const le = (x: number | null | undefined, t: number) => (x === null || x === undefined ? null : x <= t);
const between = (x: number | null | undefined, a: number, b: number) => (x === null || x === undefined ? null : x >= a && x <= b);
const any = (...xs: (boolean | null)[]) => (xs.some((x) => x === true) ? true : xs.every((x) => x === null) ? null : false);

export function classifyRegime(x: RegimeInputs): RegimeResult {
  const f = (id: FactorId) => x.factors[id].score;
  const v = (id: string) => (x.byId[id]?.available ? x.byId[id].value : null);
  const S = x.score;
  const growth = x.factors.macro.clusters.find((c) => c.id === "growth")?.score ?? null;
  const vixPct = x.byId["india_vix"]?.pct10y ?? x.byId["india_vix"]?.pct5y ?? null;
  const pos = [...Object.values(x.factors)].filter((q) => q.score !== null).sort((a, b) => b.points - a.points);
  const topPos = (id: FactorId, n: number) => pos.slice(0, n).some((q) => q.id === id && q.points > 0);
  const absTotal = pos.reduce((s, q) => s + Math.abs(q.points), 0);
  const macroShare = absTotal > 0 ? (["macro", "bonds", "currency"] as FactorId[]).reduce((s, id) => s + Math.abs(x.factors[id].points), 0) / absTotal : null;
  const niftyW = x.byId["nifty_level"]?.changes.w1 ?? null;

  const defs: { id: RegimeId; conditions: Condition[] }[] = [
    {
      id: "HIGH-VOLATILITY",
      conditions: [
        cond("India VIX at or above its 85th percentile (10Y)", ge(vixPct, 85)),
        cond("NIFTY moved ≥ 3% in a week or realised vol ≥ 25%", any(niftyW === null ? null : Math.abs(niftyW) >= 3, ge(v("nifty_rv20"), 25))),
        cond("Volatility factor ≤ 30", le(f("volatility"), 30)),
      ],
    },
    {
      id: "EVENT-DRIVEN",
      conditions: [
        cond("Current-expiry ATM IV ≥ 2 vol pts above next expiry (event premium)", ge(x.ivTermInversion, 2)),
        cond("India VIX up ≥ 10% over 1M", ge(v("vix_1m_change"), 10)),
        cond("Macro factor not in stress (35–65)", between(f("macro"), 35, 65)),
      ],
    },
    {
      id: "STAGFLATIONARY",
      conditions: [cond("CPI inflation ≥ 6%", ge(v("cpi_yoy"), 6)), cond("Growth cluster ≤ 40", le(growth, 40)), cond("Crude up ≥ 10% (1M) or bond factor ≤ 40", any(ge(v("brent_1m"), 10), le(f("bonds"), 40)))],
    },
    {
      id: "DEFLATIONARY",
      conditions: [cond("CPI inflation ≤ 2.5%", le(v("cpi_yoy"), 2.5)), cond("Growth cluster ≤ 40", le(growth, 40)), cond("10Y G-Sec down ≥ 25 bps (1M)", le(v("gsec10y_1m_chg"), -25))],
    },
    {
      id: "RISK-OFF",
      conditions: [cond("Sentiment ≤ 35", le(S, 35)), cond("Breadth ≤ 40", le(f("breadth"), 40)), cond("Flows or credit ≤ 40", any(le(f("flows"), 40), le(f("credit"), 40))), cond("Volatility factor ≤ 40", le(f("volatility"), 40))],
    },
    {
      id: "RISK-ON",
      conditions: [cond("Sentiment ≥ 65", ge(S, 65)), cond("Breadth ≥ 60", ge(f("breadth"), 60)), cond("Volatility factor ≥ 55", ge(f("volatility"), 55)), cond("Flows ≥ 50 or global ≥ 60", any(ge(f("flows"), 50), ge(f("global"), 60)))],
    },
    {
      id: "LIQUIDITY-DRIVEN",
      conditions: [cond("Liquidity factor ≥ 65", ge(f("liquidity"), 65)), cond("Liquidity among top-2 positive contributors", f("liquidity") === null ? null : topPos("liquidity", 2)), cond("Earnings factor ≤ 50", le(f("earnings"), 50))],
    },
    {
      id: "EARNINGS-DRIVEN",
      conditions: [cond("Earnings factor ≥ 65", ge(f("earnings"), 65)), cond("Earnings among top-3 positive contributors", f("earnings") === null ? null : topPos("earnings", 3)), cond("Valuation not extreme (≥ 40)", ge(f("valuation"), 40))],
    },
    {
      id: "MACRO-DRIVEN",
      conditions: [cond("Macro, bonds and currency carry ≥ 35% of absolute contributions", macroShare === null ? null : macroShare >= 0.35), cond("Macro factor available", f("macro") !== null), cond("Bond or currency factor available", f("bonds") !== null || f("currency") !== null)],
    },
  ];
  const candidates: RegimeCandidate[] = defs.map((d) => ({ ...d, matched: d.conditions.every((c) => c.met === true) }));

  const special: RegimeId[] = ["HIGH-VOLATILITY", "EVENT-DRIVEN", "STAGFLATIONARY", "DEFLATIONARY", "RISK-OFF", "RISK-ON"];
  const drivers: RegimeId[] = ["LIQUIDITY-DRIVEN", "EARNINGS-DRIVEN", "MACRO-DRIVEN"];
  const matched = candidates.filter((c) => c.matched).map((c) => c.id);
  let primary: RegimeId | null = special.find((id) => matched.includes(id)) ?? null;
  if (!primary && S !== null) primary = S >= 55 ? "CAUTIOUS RISK-ON" : S <= 45 ? "CAUTIOUS RISK-OFF" : "NEUTRAL";
  const secondary = matched.filter((id) => id !== primary && (drivers.includes(id) || special.includes(id)));
  const text =
    primary === null
      ? "Regime unavailable: insufficient data for a sentiment score."
      : `${primary}${secondary.length ? ` (also: ${secondary.join(", ")})` : ""}. ${
          special.includes(primary) ? "All required conditions across independent factor groups are met." : "No specialised regime has all of its conditions met; classified from the overall score and its breadth of support."
        }`;
  return { primary, secondary, candidates, text };
}
