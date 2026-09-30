import { describe, expect, it } from "vitest";
import { applyOverrides, bandFor, DEFAULT_CONFIG, parseOverrides } from "../config";
import { INDICATORS } from "../indicators";
import { FACTOR_IDS } from "../types";
import { capWeights, computeFactors, inferFrequency, masterFromFactors, MIN_SCORE_COVERAGE, type LiteReading } from "./evaluate";

describe("configuration", () => {
  it("keeps the specified factor weights (they sum to 105, so they are used as relative weights)", () => {
    expect(FACTOR_IDS.reduce((s, id) => s + DEFAULT_CONFIG.factors[id].weight, 0)).toBe(105);
    const all = INDICATORS.filter((d) => d.scoring).map((d) => lite(d.id, d.factor, d.cluster, 60));
    const f = computeFactors(all, DEFAULT_CONFIG);
    expect(f.reduce((s, x) => s + x.effectiveWeight, 0)).toBeCloseTo(1);
    expect(f.find((x) => x.id === "breadth")!.effectiveWeight).toBeCloseTo(15 / 105);
  });

  it("every configured cluster has at least one scored indicator and every scored indicator has a cluster", () => {
    for (const id of FACTOR_IDS)
      for (const c of DEFAULT_CONFIG.factors[id].clusters) expect(INDICATORS.some((d) => d.factor === id && d.cluster === c.id && d.scoring), `${id}/${c.id}`).toBe(true);
    for (const d of INDICATORS.filter((x) => x.scoring)) expect(DEFAULT_CONFIG.factors[d.factor].clusters.some((c) => c.id === d.cluster), d.id).toBe(true);
  });

  it("indicator ids are unique", () => {
    expect(new Set(INDICATORS.map((d) => d.id)).size).toBe(INDICATORS.length);
  });

  it("maps scores to the seven configurable bands", () => {
    expect(bandFor(10, DEFAULT_CONFIG)!.label).toBe("Extreme Fear");
    expect(bandFor(40, DEFAULT_CONFIG)!.label).toBe("Mild Fear");
    expect(bandFor(50, DEFAULT_CONFIG)!.cls).toBe("NEUTRAL");
    expect(bandFor(68, DEFAULT_CONFIG)!.label).toBe("Greed");
    expect(bandFor(100, DEFAULT_CONFIG)!.label).toBe("Extreme Greed");
    const cfg = applyOverrides(DEFAULT_CONFIG, { thresholds: [10, 30, 40, 60, 70, 90] });
    expect(bandFor(58, cfg)!.label).toBe("Neutral");
  });

  it("parses overrides defensively", () => {
    expect(parseOverrides('{"factorWeights":{"breadth":20},"maxFactorShare":0.25}')).toEqual({ factorWeights: { breadth: 20 }, maxFactorShare: 0.25 });
    expect(parseOverrides('{"factorWeights":{"breadth":-5}}')).toBeNull();
    expect(parseOverrides("not json")).toBeNull();
    expect(parseOverrides('{"unknown":1}')).toEqual({});
  });
});

describe("weights", () => {
  it("caps any single factor and keeps weights summing to 1", () => {
    const w = capWeights([50, 10, 10, 10, 10, 10], 0.2);
    expect(Math.max(...w)).toBeCloseTo(0.2);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("falls back to equal weights when the cap cannot be satisfied", () => {
    expect(capWeights([10, 5, 0], 0.2)).toEqual([0.5, 0.5, 0]);
  });
});

const lite = (id: string, factor: LiteReading["factor"], cluster: string, score: number | null): LiteReading => ({ id, factor, cluster, score, status: "LIVE", value: 0, date: "2026-09-30" });

describe("factor pooling", () => {
  it("pools correlated indicators inside a cluster instead of double counting them", () => {
    const base = [lite("a", "breadth", "dma_participation", 90), lite("b", "breadth", "dma_participation", 90), lite("c", "breadth", "dma_participation", 90), lite("d", "breadth", "advance_decline", 10)];
    const f = computeFactors(base, DEFAULT_CONFIG).find((x) => x.id === "breadth")!;
    // Cluster weights 30 (DMA) vs 25 (A/D): three copies of the same signal still count once.
    expect(f.score).toBeCloseTo((30 * 90 + 25 * 10) / 55);
    expect(f.coverage).toBeCloseTo(55 / 100);
  });

  it("contributions sum to score − 50 and the score needs minimum coverage", () => {
    const all = INDICATORS.filter((d) => d.scoring).map((d) => lite(d.id, d.factor, d.cluster, 70));
    const factors = computeFactors(all, DEFAULT_CONFIG);
    const s = masterFromFactors(factors)!;
    expect(s).toBeCloseTo(70);
    expect(factors.reduce((a, f) => a + f.points, 0)).toBeCloseTo(s - 50);
    expect(Math.max(...factors.map((f) => f.effectiveWeight))).toBeLessThanOrEqual(DEFAULT_CONFIG.maxFactorShare + 1e-9);
    const sparse = computeFactors(all.filter((r) => r.factor === "global"), DEFAULT_CONFIG);
    expect(masterFromFactors(sparse)).toBeNull();
    expect(MIN_SCORE_COVERAGE).toBeGreaterThan(0.05);
  });
});

describe("frequency inference", () => {
  it("detects daily, weekly and monthly spacing", () => {
    const mk = (step: number) => Array.from({ length: 12 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1 + i * step)).toISOString().slice(0, 10), value: i }));
    expect(inferFrequency(mk(1))).toBe("D");
    expect(inferFrequency(mk(7))).toBe("W");
    expect(inferFrequency(mk(30))).toBe("M");
    expect(inferFrequency(mk(91))).toBe("Q");
    expect(inferFrequency([])).toBeNull();
  });
});
