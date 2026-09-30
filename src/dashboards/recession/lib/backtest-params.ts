import type { BacktestParams } from "./engine/historical";
import { DEFAULT_BACKTEST } from "./engine/historical";

function num(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : dflt;
}

export function parseBacktestParams(q: Record<string, unknown>): BacktestParams {
  const score = String(q.score ?? "");
  return {
    threshold: num(q.threshold, 20, 95, DEFAULT_BACKTEST.threshold),
    sustainMonths: Math.round(num(q.sustain, 1, 12, DEFAULT_BACKTEST.sustainMonths)),
    horizonMonths: Math.round(num(q.horizon, 3, 36, DEFAULT_BACKTEST.horizonMonths)),
    minCoverage: num(q.coverage, 0.2, 1, DEFAULT_BACKTEST.minCoverage),
    score: score === "financial" || score === "inflation" ? score : "recession",
  };
}
