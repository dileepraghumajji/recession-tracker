/**
 * End-to-end: synthetic series → snapshot, history and backtest. Also checks
 * that missing data is never invented and that historical scores have no look-ahead.
 */
import { describe, expect, it } from "vitest";
import { truncate } from "@/platform/lib/timeseries";
import { ALERT_METRICS, evaluateRule } from "../alerts";
import { DEFAULT_CONFIG } from "../config";
import { syntheticChain, syntheticSeries } from "../data/synthetic";
import { SERIES } from "../series";
import type { SeriesMap } from "../types";
import { evaluateMaster, prepare } from "./evaluate";
import { backtest, scoreHistory } from "./history";
import { buildSnapshot } from "./snapshot";

function synthetic(filter: (key: string) => boolean = () => true, cut?: string): SeriesMap {
  const out: SeriesMap = {};
  for (const d of SERIES) {
    if (!filter(d.key)) continue;
    const obs = cut ? truncate(syntheticSeries(d), cut) : syntheticSeries(d);
    if (obs.length) out[d.key] = { meta: { key: d.key, kind: d.kind, sourceId: d.sourceId, origin: "synthetic", fetchedAt: null, sourceLastUpdated: null, fetchStatus: "ok", fetchError: null, synthetic: true }, obs };
  }
  return out;
}

const series = synthetic();
const prepared = prepare(series);
const asOf = series["idx:NIFTY50"]!.obs.at(-1)!.date;
const chains = (["NIFTY", "BANKNIFTY", "FINNIFTY"] as const).map((u) => syntheticChain(u));
const snap = buildSnapshot({ prepared, series, chains, cfg: DEFAULT_CONFIG, asOf, dataMode: "demo" });

describe("snapshot", () => {
  it("produces a bounded score, band, regime and confidence", () => {
    expect(snap.score).not.toBeNull();
    expect(snap.score!).toBeGreaterThanOrEqual(0);
    expect(snap.score!).toBeLessThanOrEqual(100);
    expect(snap.band).not.toBeNull();
    expect(snap.regime.primary).not.toBeNull();
    expect(snap.confidence.score).toBeGreaterThan(80);
    expect(snap.factors.every((f) => f.score !== null)).toBe(true);
  });

  it("answers the 20 homepage questions", () => {
    expect(snap.answers).toHaveLength(20);
    expect(snap.answers.every((a) => a.a.length > 0)).toBe(true);
  });

  it("analyses option chains for each underlying and expiry", () => {
    expect(snap.options.map((o) => o.underlying).sort()).toEqual(["BANKNIFTY", "FINNIFTY", "NIFTY"]);
    const nifty = snap.options.find((o) => o.underlying === "NIFTY")!;
    expect(nifty.expiries.some((e) => e.kinds.includes("far"))).toBe(true);
    expect(nifty.near!.maxPain).not.toBeNull();
  });

  it("never gives trading instructions", () => {
    const text = [snap.headline, ...snap.answers.map((a) => a.a), ...Object.values(snap.narrative).flat()].join(" ").toLowerCase();
    for (const w of [" buy ", " sell ", "go long", "go short", "take profit", "stop loss"]) expect(text).not.toContain(w);
  });
});

describe("missing data", () => {
  it("is never invented: removing breadth series makes the factor unavailable and lowers confidence", () => {
    const s = synthetic((k) => !k.startsWith("breadth:"));
    const r = evaluateMaster(prepare(s), s, asOf, DEFAULT_CONFIG).master;
    const breadth = r.factors.find((f) => f.id === "breadth")!;
    // Relative-strength breadth is computed from sector indices, so only that cluster survives.
    expect(breadth.clusters.filter((c) => c.score !== null).map((c) => c.id)).toEqual(["internals"]);
    expect(r.confidence.score).toBeLessThan(snap.confidence.score);
  });

  it("withholds the score when core Indian-market factors are missing", () => {
    const s = synthetic((k) => k.startsWith("fred:"));
    const r = evaluateMaster(prepare(s), s, asOf, DEFAULT_CONFIG).master;
    expect(r.score).toBeNull();
    expect(r.confidence.score).toBeLessThanOrEqual(20);
  });
});

describe("history and backtest", () => {
  const history = scoreHistory(prepared, series, DEFAULT_CONFIG, "2015-01-01", asOf);

  it("has no look-ahead: a historical score is identical when later data is removed", () => {
    const d = history.find((h) => h.date >= "2020-03-20" && h.weekly)!;
    const cut = synthetic(undefined, d.date);
    const again = scoreHistory(prepare(cut), cut, DEFAULT_CONFIG, d.date, d.date);
    expect(again.at(-1)!.date).toBe(d.date);
    expect(again.at(-1)!.score).toBeCloseTo(d.score!, 6);
  });

  it("reports historical observations per band", () => {
    const bt = backtest(history, series["idx:NIFTY50"]!.obs, DEFAULT_CONFIG);
    expect(bt.samples).toBeGreaterThan(100);
    expect(bt.notes[0]).toMatch(/HISTORICAL OBSERVATIONS/);
    expect(bt.buckets.filter((b) => b.n > 0).length).toBeGreaterThan(3);
  });
});

describe("alerts", () => {
  it("fires on crossings only when the level is crossed", () => {
    const rule = { kind: "cross" as const, metric: "sentiment", direction: "up" as const, level: snap.score! - 1 };
    expect(evaluateRule(rule, snap, { state: null, value: snap.score! - 5 }).fire).toBe(true);
    expect(evaluateRule(rule, snap, { state: null, value: snap.score! + 5 }).fire).toBe(false);
    expect(evaluateRule(rule, snap, { state: null, value: null }).fire).toBe(false);
  });

  it("fires level alerts on the false → true transition", () => {
    const rule = { kind: "level" as const, metric: "sentiment", op: "above" as const, level: 0 };
    expect(evaluateRule(rule, snap, { state: false, value: null }).fire).toBe(true);
    expect(evaluateRule(rule, snap, { state: true, value: null }).fire).toBe(false);
  });

  it("every alert metric resolves against a snapshot", () => {
    for (const [id, m] of Object.entries(ALERT_METRICS)) expect(m.get(snap).value, id).not.toBeNull();
  });
});
