/** Chart metric catalogue for "NIFTY vs X" charts (client-safe: no server imports). */
import type { Obs } from "./types";

export const CHART_PERIODS = ["1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "10Y", "MAX"] as const;
export type ChartPeriod = (typeof CHART_PERIODS)[number];
export const PERIOD_DAYS: Record<ChartPeriod, number> = { "1D": 1, "1W": 7, "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "3Y": 1096, "5Y": 1827, "10Y": 3653, MAX: 100000 };

type Source = { kind: "indicator"; id: string } | { kind: "sentiment" } | { kind: "factor"; id: string; invert?: boolean };

export const CHART_METRICS: { id: string; label: string; units: string; top: "nifty" | "sentiment"; source: Source; note?: string }[] = [
  { id: "sentiment", label: "Sentiment score", units: "0–100", top: "nifty", source: { kind: "sentiment" } },
  { id: "breadth", label: "% of stocks above 50DMA", units: "%", top: "nifty", source: { kind: "indicator", id: "pct_above_50" } },
  { id: "fii", label: "FII cash flow (1M cumulative)", units: "₹ Cr", top: "nifty", source: { kind: "indicator", id: "fii_cash_1m" } },
  { id: "vix", label: "India VIX", units: "index", top: "nifty", source: { kind: "indicator", id: "india_vix" } },
  { id: "pressure", label: "Net option premium pressure", units: "-1..1 (daily) · ₹ Cr (intraday)", top: "nifty", source: { kind: "indicator", id: "nifty_pressure" } },
  { id: "oi_pcr", label: "NIFTY OI PCR", units: "ratio", top: "nifty", source: { kind: "indicator", id: "nifty_oi_pcr" } },
  { id: "premium_pcr", label: "NIFTY premium PCR", units: "ratio", top: "nifty", source: { kind: "indicator", id: "nifty_premium_pcr" } },
  { id: "iv_skew", label: "NIFTY 25Δ IV skew", units: "vol pts", top: "nifty", source: { kind: "indicator", id: "nifty_skew" } },
  { id: "usdinr", label: "USD/INR", units: "INR", top: "nifty", source: { kind: "indicator", id: "usdinr" } },
  { id: "gsec10y", label: "India 10Y G-Sec", units: "%", top: "nifty", source: { kind: "indicator", id: "gsec10y" } },
  { id: "brent", label: "Brent crude", units: "USD/bbl", top: "nifty", source: { kind: "indicator", id: "brent_level" } },
  { id: "credit_stress", label: "Credit Stress Score", units: "0–100", top: "nifty", source: { kind: "factor", id: "credit", invert: true } },
  { id: "earnings", label: "Forward EPS 3M change (earnings revisions)", units: "%", top: "sentiment", source: { kind: "indicator", id: "fwd_eps_3m" } },
];

export interface ChartPayload {
  metric: string;
  period: ChartPeriod;
  top: { label: string; points: Obs[] };
  bottom: { label: string; units: string; points: Obs[] };
  intraday: boolean;
  note: string | null;
}

