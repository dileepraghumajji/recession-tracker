import { describe, expect, it } from "vitest";
import type { OptionChainSnapshot, OptionRecord } from "../types";
import { analyzeChain, bsDelta, classifyActivity, classifyExpiries, expiryPositioningShift, inferStrikeStep, maxPain, pcrDivergence, premiumValue, type ExpirySummary } from "./options";

const rec = (strike: number, type: "CE" | "PE", o: Partial<OptionRecord> = {}): OptionRecord => ({
  underlying: "NIFTY",
  expiry: "2026-10-06",
  strike,
  type,
  ltp: 10,
  prevClose: 10,
  volume: 100,
  oi: 1000,
  changeInOi: 0,
  iv: 15,
  prevIv: 15,
  timestamp: "2026-09-30T15:30:00+05:30",
  lotSize: 75,
  ...o,
});

const chain = (records: OptionRecord[], spot = 25000): OptionChainSnapshot => ({ underlying: "NIFTY", spot, timestamp: "2026-09-30T15:30:00+05:30", volumeUnit: "contracts", records, source: "test", synthetic: false });
const opts = { expiry: "2026-10-06", window: 0, atmBandSteps: 0, riskFreeRate: 0.065 };

describe("premium", () => {
  it("is price × volume × lot size for contract volume, price × volume for share volume", () => {
    expect(premiumValue({ ltp: 120, volume: 1000, lotSize: 75 }, "contracts")).toBe(9_000_000);
    expect(premiumValue({ ltp: 120, volume: 75000, lotSize: 75 }, "shares")).toBe(9_000_000);
    expect(premiumValue({ ltp: null, volume: 1000, lotSize: 75 }, "contracts")).toBe(0);
  });

  it("splits call/put totals, premium PCR and OI PCR", () => {
    const a = analyzeChain(chain([rec(25000, "CE", { ltp: 100, volume: 10, oi: 2000 }), rec(25000, "PE", { ltp: 100, volume: 20, oi: 3000 })]), opts)!;
    expect(a.totals.callPremium).toBe(100 * 10 * 75);
    expect(a.totals.putPremium).toBe(100 * 20 * 75);
    expect(a.totals.premiumPcr).toBeCloseTo(2);
    expect(a.totals.callPutPremiumRatio).toBeCloseTo(0.5);
    expect(a.totals.netPutPremium).toBe(100 * 10 * 75);
    expect(a.totals.oiPcr).toBeCloseTo(1.5);
  });

  it("buckets premium by moneyness and respects the strike window", () => {
    const rs = [24800, 24900, 25000, 25100, 25200].flatMap((k) => [rec(k, "CE"), rec(k, "PE")]);
    const a = analyzeChain(chain(rs, 25010), { ...opts, atmBandSteps: 0 })!;
    expect(a.atmStrike).toBe(25000);
    const each = 10 * 100 * 75;
    expect(a.moneyness.call.ATM).toBe(each);
    expect(a.moneyness.call.ITM).toBe(2 * each); // 24800, 24900 calls
    expect(a.moneyness.put.ITM).toBe(2 * each); // 25100, 25200 puts
    expect(a.moneyness.put.OTM).toBe(2 * each);
    const w1 = analyzeChain(chain(rs, 25010), { ...opts, window: 1 })!;
    expect(w1.rows.map((r) => r.strike)).toEqual([24900, 25000, 25100]);
  });
});

describe("max pain", () => {
  it("finds the strike minimising option holders' intrinsic value", () => {
    const rs = [
      { strike: 24500, type: "PE" as const, oi: 5000 },
      { strike: 25000, type: "PE" as const, oi: 1000 },
      { strike: 25000, type: "CE" as const, oi: 1000 },
      { strike: 25500, type: "CE" as const, oi: 5000 },
    ];
    expect(maxPain(rs)).toBe(25000);
  });
});

describe("buying vs writing classification", () => {
  it("maps price/OI changes to probabilistic labels", () => {
    expect(classifyActivity(rec(1, "CE", { ltp: 12, prevClose: 10, changeInOi: 200 })).activity).toBe("fresh_buying");
    expect(classifyActivity(rec(1, "CE", { ltp: 8, prevClose: 10, changeInOi: 200 })).activity).toBe("writing");
    expect(classifyActivity(rec(1, "CE", { ltp: 12, prevClose: 10, changeInOi: -200 })).activity).toBe("short_covering");
    expect(classifyActivity(rec(1, "CE", { ltp: 8, prevClose: 10, changeInOi: -200 })).activity).toBe("long_unwinding");
    expect(classifyActivity(rec(1, "CE", { ltp: 10.01, prevClose: 10, changeInOi: 200 })).activity).toBe("indeterminate");
    expect(classifyActivity(rec(1, "CE", { prevClose: null })).activity).toBe("indeterminate");
  });

  it("never states intent with certainty", () => {
    const a = analyzeChain(chain([rec(25000, "CE", { ltp: 15, prevClose: 10, changeInOi: 500 })]), opts)!;
    expect(a.rows[0].call!.activityText).toMatch(/^(Evidence suggests|Likely|Possible) /);
  });

  it("call buying and put writing both add bullish pressure", () => {
    const a = analyzeChain(chain([rec(25000, "CE", { ltp: 15, prevClose: 10, changeInOi: 500 }), rec(25000, "PE", { ltp: 6, prevClose: 10, changeInOi: 500 })]), opts)!;
    expect(a.pressure.call).toBeGreaterThan(0);
    expect(a.pressure.put).toBeLessThan(0);
    expect(a.pressure.net).toBeGreaterThan(0);
    expect(a.writingBalance).toBe(1);
  });
});

describe("IV skew", () => {
  it("computes Black-Scholes deltas with the right sign", () => {
    expect(bsDelta("CE", 100, 100, 20, 0.1, 0)!).toBeGreaterThan(0.5);
    expect(bsDelta("PE", 100, 100, 20, 0.1, 0)!).toBeLessThan(0);
    expect(bsDelta("CE", 100, 100, 0, 0.1, 0)).toBeNull();
  });

  it("measures 25-delta put minus call IV", () => {
    const rs = Array.from({ length: 41 }, (_, i) => 24000 + i * 50).flatMap((k) => [rec(k, "CE", { iv: 12 }), rec(k, "PE", { iv: 16 })]);
    const a = analyzeChain(chain(rs), opts)!;
    expect(a.iv.skew25d).toBeCloseTo(4);
    expect(a.iv.atmIv).toBeCloseTo(14);
  });
});

describe("expiries and positioning", () => {
  it("labels current, next, monthly and far expiries", () => {
    const e = classifyExpiries(["2026-10-06", "2026-10-13", "2026-10-27", "2026-11-24", "2026-12-29", "2026-09-29"], "2026-09-30");
    const kinds = Object.fromEntries(e.map((x) => [x.expiry, x.kinds]));
    expect(kinds["2026-10-06"]).toEqual(["current"]);
    expect(kinds["2026-10-13"]).toEqual(["next"]);
    expect(kinds["2026-10-27"]).toEqual(["monthly"]);
    expect(kinds["2026-12-29"]).toEqual(["far"]);
    expect(kinds["2026-09-29"]).toBeUndefined(); // expired
  });

  it("infers strike step from the most common gap", () => {
    expect(inferStrikeStep([100, 150, 200, 250, 300, 400])).toBe(50);
  });

  const exp = (kinds: ExpirySummary["kinds"], positioning: number): ExpirySummary => ({ expiry: "x", kinds, daysToExpiry: 1, oi: 100, oiChange: 0, premium: 0, premiumPcr: 1, oiPcr: 1, atmIv: 12, skew25d: 1, maxPain: 1, resistance: null, support: null, pressure: 0, positioning });
  it("tells whether positioning persists into later expiries", () => {
    expect(expiryPositioningShift([exp(["current"], 70), exp(["next"], 65)]).verdict).toBe("persists");
    expect(expiryPositioningShift([exp(["current"], 70), exp(["next"], 50)]).verdict).toBe("concentrated_near");
    expect(expiryPositioningShift([exp(["current"], 70), exp(["next"], 30)]).verdict).toBe("disagree");
    expect(expiryPositioningShift([exp(["current"], 70)]).verdict).toBe("unavailable");
  });

  it("flags OI PCR vs premium PCR positioning divergence", () => {
    const t = { oiPcrBullish: 1.1, oiPcrBearish: 0.8, premiumPcrBearish: 1.15, premiumPcrBullish: 0.85 };
    expect(pcrDivergence(1.3, 1.4, t).divergent).toBe(true);
    expect(pcrDivergence(0.7, 0.7, t).divergent).toBe(true);
    expect(pcrDivergence(1.3, 0.7, t).divergent).toBe(false);
    expect(pcrDivergence(null, 1, t).oiRead).toBe("unavailable");
  });
});
