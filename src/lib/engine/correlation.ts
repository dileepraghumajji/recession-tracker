/**
 * Correlation diagnostics used to justify / audit the factor clusters: pairwise
 * correlations of polarity-adjusted monthly stress metrics over a recent window.
 */
import type { ScoreId } from "../types";
import { addDays, monthEnds, valueAtOrBefore, daysBetween } from "../timeseries";
import type { PreparedIndicator } from "./analyze";

export interface CorrPair {
  a: string;
  b: string;
  aName: string;
  bName: string;
  sameCluster: boolean;
  rho: number;
  n: number;
}

export function correlationCheck(prepared: PreparedIndicator[], score: ScoreId, end: string, years = 15): { pairs: CorrPair[]; withinAvg: number | null; acrossAvg: number | null } {
  const members = prepared.filter((p) => p.available && p.def.stress && p.def.memberships.some((m) => m.score === score));
  const months = monthEnds(addDays(end, -Math.round(years * 365.25)), end);
  const vecs = members.map((p) => {
    const sign = p.def.stress!.polarity === "higher_worse" ? 1 : -1;
    return months.map((d) => {
      const o = valueAtOrBefore(p.stressMetric, d);
      return o && daysBetween(o.date, d) < 120 ? sign * o.value : null;
    });
  });
  const cluster = (p: PreparedIndicator) => {
    const m = p.def.memberships.find((x) => x.score === score)!;
    return `${m.category}/${m.cluster}`;
  };
  const pairs: CorrPair[] = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let k = 0; k < months.length; k++) {
        const a = vecs[i][k];
        const b = vecs[j][k];
        if (a !== null && b !== null) {
          xs.push(a);
          ys.push(b);
        }
      }
      if (xs.length < 36) continue;
      const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
      const my = ys.reduce((s, v) => s + v, 0) / ys.length;
      let sxy = 0,
        sxx = 0,
        syy = 0;
      for (let k = 0; k < xs.length; k++) {
        sxy += (xs[k] - mx) * (ys[k] - my);
        sxx += (xs[k] - mx) ** 2;
        syy += (ys[k] - my) ** 2;
      }
      if (sxx === 0 || syy === 0) continue;
      pairs.push({
        a: members[i].def.id,
        b: members[j].def.id,
        aName: members[i].def.name,
        bName: members[j].def.name,
        sameCluster: cluster(members[i]) === cluster(members[j]),
        rho: sxy / Math.sqrt(sxx * syy),
        n: xs.length,
      });
    }
  }
  const avg = (ps: CorrPair[]) => (ps.length ? ps.reduce((s, p) => s + p.rho, 0) / ps.length : null);
  return { pairs: pairs.sort((x, y) => Math.abs(y.rho) - Math.abs(x.rho)), withinAvg: avg(pairs.filter((p) => p.sameCluster)), acrossAvg: avg(pairs.filter((p) => !p.sameCluster)) };
}
