/** Formatting helpers for the India dashboard (₹ crore, signed values, units). */
import { fmtNum, fmtSigned } from "@/platform/lib/format";
import type { Band, IndicatorReading } from "./types";

export { fmtNum, fmtSigned };

export const fmtCr = (x: number | null | undefined, dp = 0) =>
  x === null || x === undefined || !Number.isFinite(x) ? "—" : `${x < 0 ? "−" : ""}₹${Math.abs(x).toLocaleString("en-IN", { maximumFractionDigits: dp, minimumFractionDigits: dp })} Cr`;
/** Rupees → "₹1,234 Cr". */
export const fmtRupeesCr = (x: number | null | undefined) => (x === null || x === undefined ? "—" : fmtCr(x / 1e7));

export function fmtReading(r: Pick<IndicatorReading, "units" | "id">, v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  switch (r.units) {
    case "%":
    case "% YoY":
      return `${fmtNum(v, dp)}%`;
    case "pp":
      return `${fmtSigned(v, dp)} pp`;
    case "bps":
      return `${fmtNum(v, 0)} bps`;
    case "₹ Cr":
      return fmtCr(v);
    case "x":
      return `${fmtNum(v, dp)}x`;
    default:
      return fmtNum(v, dp);
  }
}

export function fmtChange(r: Pick<IndicatorReading, "units">, v: number | null | undefined, pct: boolean): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (pct) return fmtSigned(v, 1, "%");
  if (r.units === "bps") return fmtSigned(v, 0, " bps");
  if (r.units === "₹ Cr") return `${v >= 0 ? "+" : ""}${fmtCr(v)}`;
  if (r.units === "%" || r.units === "% YoY" || r.units === "pp") return fmtSigned(v, 2, " pp");
  return fmtSigned(v, 2);
}

/** Band tone → CSS color token. Status colors are reserved for fear/greed tone and always shown with a label. */
export const TONE_COLOR: Record<Band["tone"], string> = {
  "fear-strong": "var(--critical)",
  fear: "var(--serious)",
  neutral: "var(--warning)",
  greed: "var(--good)",
  "greed-strong": "var(--good-ink)",
};

export function scoreTone(score: number | null): string {
  if (score === null) return "var(--muted)";
  return score >= 65 ? "var(--good)" : score >= 55 ? "var(--good-ink)" : score > 45 ? "var(--ink-2)" : score > 35 ? "var(--serious)" : "var(--critical)";
}
