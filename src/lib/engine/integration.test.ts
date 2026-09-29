import { describe, expect, it } from "vitest";
import { SERIES } from "../series-catalog";
import { syntheticSeries } from "../data/providers/synthetic";
import type { SeriesMap } from "../types";
import { prepareIndicators } from "./analyze";
import { buildSnapshot } from "./snapshot";
import { DEFAULT_CONFIG } from "../model-config";
import { runHistorical, runBacktest, comparePeriods } from "./historical";
import { INDICATORS } from "../indicators";
import { DEFAULT_CONFIG as CFG } from "../model-config";

function demoSeries(): SeriesMap {
  const out: SeriesMap = {};
  for (const d of SERIES) {
    if (d.provider === "manual") continue;
    out[d.key] = {
      meta: { key: d.key, provider: d.provider, sourceId: d.sourceId, fetchedAt: new Date().toISOString(), sourceLastUpdated: null, fetchStatus: "ok", fetchError: null, synthetic: true },
      obs: syntheticSeries(d),
    };
  }
  return out;
}

describe("catalogue consistency", () => {
  it("every scored membership references a configured category and cluster", () => {
    for (const ind of INDICATORS) {
      for (const m of ind.memberships) {
        const cat = CFG.scores[m.score].categories.find((c) => c.id === m.category);
        expect(cat, `${ind.id} -> ${m.score}.${m.category}`).toBeTruthy();
        expect(cat!.clusters.find((c) => c.id === m.cluster), `${ind.id} -> ${m.category}.${m.cluster}`).toBeTruthy();
      }
      const scores = ind.memberships.map((m) => m.score);
      expect(new Set(scores).size, `${ind.id} appears twice in one score`).toBe(scores.length);
      if (ind.memberships.length) expect(ind.stress, `${ind.id} scored without stress spec`).toBeTruthy();
    }
  });
  it("every configured cluster has at least one indicator", () => {
    for (const s of Object.values(CFG.scores))
      for (const c of s.categories)
        for (const cl of c.clusters) {
          const has = INDICATORS.some((i) => i.memberships.some((m) => m.score === s.id && m.category === c.id && m.cluster === cl.id));
          expect(has, `${s.id}.${c.id}.${cl.id}`).toBe(true);
        }
  });
});

describe("snapshot on synthetic data", () => {
  const series = demoSeries();
  const prepared = prepareIndicators(series);
  const snap = buildSnapshot(prepared, series, DEFAULT_CONFIG, { dataMode: "demo" });

  it("produces bounded scores and explainable contributions", () => {
    for (const k of ["recession", "inflation", "financial", "overall"] as const) {
      const s = snap.scores[k].score;
      expect(s).not.toBeNull();
      expect(s!).toBeGreaterThanOrEqual(0);
      expect(s!).toBeLessThanOrEqual(100);
    }
    const r = snap.scores.recession;
    const sum = r.contributions.reduce((a, c) => a + c.points, 0);
    expect(sum).toBeCloseTo(r.score as number, 6);
  });

  it("marks proprietary ISM series as unavailable rather than inventing values", () => {
    const ism = snap.indicators.find((i) => i.id === "ism_mfg")!;
    expect(ism.available).toBe(false);
    expect(ism.status).toBe("UNAVAILABLE");
    expect(ism.latest).toBeNull();
    expect(ism.unavailableReason).toMatch(/proprietary/i);
    const pe = snap.indicators.find((i) => i.id === "fwd_pe")!;
    expect(pe.available).toBe(false);
  });

  it("classifies a regime, confluence and 30Y module", () => {
    expect(snap.regime.label.length).toBeGreaterThan(0);
    expect(snap.confluence.total).toBe(7);
    expect(snap.rates.levels.y30).not.toBeNull();
    expect(snap.explanation.headline).toMatch(/Recession stress/);
    expect(snap.dataQuality.freshness).toBeGreaterThan(0.5);
  });

  it("backtest runs point-in-time and reports all NBER recessions", () => {
    const records = runHistorical(prepared, DEFAULT_CONFIG, "1975-01-31");
    const bt = runBacktest(records);
    expect(bt.recessions.length).toBe(8);
    expect(bt.sensitivity.length).toBeGreaterThan(3);
    const cmp = comparePeriods(records);
    expect(cmp.periods.length).toBe(5);
  }, 60_000);
});
