/**
 * Energy Inflation Stress component. Distinguishes an energy-supply /
 * inflation pattern (oil up, breakevens up, yields up) from a demand-shock /
 * growth-scare pattern (oil down, unemployment up, spreads wider, short rates
 * down). Both are displayed; neither is a forecast.
 */
import type { CompositeScore, IndicatorReading } from "../types";

export interface PatternCheck {
  label: string;
  met: boolean | null;
  detail: string;
}

export interface EnergyComponent {
  score: number | null;
  oil3mPct: number | null;
  oil12mPct: number | null;
  supplyPattern: { matched: number; available: number; checks: PatternCheck[] };
  demandPattern: { matched: number; available: number; checks: PatternCheck[] };
  interpretation: string;
}

const fmt = (x: number | null, unit: string, dp = 1) => (x === null ? "n/a" : `${x > 0 ? "+" : ""}${x.toFixed(dp)}${unit}`);

export function computeEnergy(byId: Record<string, IndicatorReading>, inflation: CompositeScore): EnergyComponent {
  const oil = byId.wti?.available ? byId.wti : byId.brent;
  const oil3m = oil?.changes.m3 ?? null;
  const oil12 = oil?.changes.m12 ?? null;
  const be3m = byId.be5y?.changes.m3 != null ? (byId.be5y.changes.m3 as number) * 100 : null;
  const y10 = byId.ust10y?.changes.m3 != null ? (byId.ust10y.changes.m3 as number) * 100 : null;
  const y2 = byId.ust2y?.changes.m3 != null ? (byId.ust2y.changes.m3 as number) * 100 : null;
  const ur = byId.unrate?.changes.m3 ?? null;
  const hy = byId.hy_oas?.changes.m3 != null ? (byId.hy_oas.changes.m3 as number) * 100 : byId.baa10y?.changes.m3 != null ? (byId.baa10y.changes.m3 as number) * 100 : null;

  const chk = (label: string, v: number | null, cond: (x: number) => boolean, detail: string): PatternCheck => ({
    label,
    met: v === null ? null : cond(v),
    detail,
  });
  const supply = [
    chk("Oil rising (3M > +10%)", oil3m, (x) => x > 10, fmt(oil3m, "%")),
    chk("5Y breakevens rising (3M > +10 bps)", be3m, (x) => x > 10, fmt(be3m, " bps", 0)),
    chk("10Y yield rising (3M > +15 bps)", y10, (x) => x > 15, fmt(y10, " bps", 0)),
  ];
  const demand = [
    chk("Oil falling (3M < -10%)", oil3m, (x) => x < -10, fmt(oil3m, "%")),
    chk("Unemployment rising (3M > +0.2pp)", ur, (x) => x > 0.2, fmt(ur, "pp", 1)),
    chk("Credit spreads widening (3M > +50 bps)", hy, (x) => x > 50, fmt(hy, " bps", 0)),
    chk("2Y yield falling (3M < -25 bps)", y2, (x) => x < -25, fmt(y2, " bps", 0)),
  ];
  const summarize = (cs: PatternCheck[]) => ({
    matched: cs.filter((c) => c.met === true).length,
    available: cs.filter((c) => c.met !== null).length,
    checks: cs,
  });
  const sp = summarize(supply);
  const dp = summarize(demand);

  const energyCat = inflation.categories.find((c) => c.id === "energy")?.score ?? null;
  const beCat = inflation.categories.find((c) => c.id === "market_expectations")?.score ?? null;
  const oilImpulse = oil3m === null ? null : Math.max(0, Math.min(100, 50 + oil3m * 2));
  const parts: [number | null, number][] = [
    [energyCat, 0.5],
    [beCat, 0.25],
    [oilImpulse, 0.25],
  ];
  const avail = parts.filter((p) => p[0] !== null);
  const w = avail.reduce((a, p) => a + p[1], 0);
  const score = w > 0 ? avail.reduce((a, p) => a + (p[0] as number) * p[1], 0) / w : null;

  let interpretation = "Energy signals are mixed or unavailable.";
  if (sp.matched >= 2 && sp.matched > dp.matched)
    interpretation =
      "Pattern resembles an energy / inflation impulse (oil, inflation expectations and yields rising together). This mainly raises inflation stress; it becomes a growth risk if it persists and squeezes real incomes.";
  else if (dp.matched >= 2 && dp.matched > sp.matched)
    interpretation =
      "Pattern resembles a demand shock / growth scare (oil falling with rising unemployment, wider spreads and falling short rates). This is disinflationary but consistent with rising recession stress.";
  else if (sp.matched === 0 && dp.matched === 0 && sp.available > 0) interpretation = "Neither an energy-supply shock nor a demand-shock pattern is present.";
  return { score, oil3mPct: oil3m, oil12mPct: oil12, supplyPattern: sp, demandPattern: dp, interpretation };
}
