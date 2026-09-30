import type { IndicatorReading, Signal, Trend } from "./types";
import { INDICATOR_BY_ID } from "./indicators";
import { fmtDate, fmtNum, fmtSigned } from "@/platform/lib/format";

export { fmtDate, fmtNum, fmtSigned };

export function unitSuffix(units: string): string {
  if (units === "%" || units === "pp") return "%";
  if (units === "bps") return " bps";
  return "";
}

/** Value formatted with the indicator's natural units. */
export function fmtValue(r: Pick<IndicatorReading, "id" | "units">, v: number | null | undefined): string {
  const def = INDICATOR_BY_ID[r.id];
  const dp = def?.decimals ?? 2;
  if (v === null || v === undefined) return "—";
  if (r.units === "%") return `${fmtNum(v, dp)}%`;
  if (r.units === "pp") return `${fmtSigned(v, dp)} pp`;
  if (r.units === "bps") return `${fmtNum(v, 0)} bps`;
  if (r.units === "claims") return fmtNum(v, 0);
  if (r.units === "k jobs") return `${fmtSigned(v, 0)}k`;
  return fmtNum(v, dp);
}

/** Change formatted in the indicator's change units (bps for rates/spreads). */
export function fmtChange(id: string, v: number | null | undefined): string {
  const def = INDICATOR_BY_ID[id];
  if (!def || v === null || v === undefined) return "—";
  switch (def.changeUnits) {
    case "bps":
      return def.units === "bps" ? fmtSigned(v, 0, " bps") : fmtSigned(v * 100, 0, " bps");
    case "pp":
      return fmtSigned(v, def.decimals ?? 2, " pp");
    case "%":
      return fmtSigned(v, 1, "%");
    case "k":
      return fmtSigned(v, 0, "k");
    default:
      return fmtSigned(v, def.decimals ?? 1);
  }
}

export const SIGNAL_META: Record<Signal, { label: string; dot: string; cls: string }> = {
  normal: { label: "Normal", dot: "🟢", cls: "sig-normal" },
  watch: { label: "Watch", dot: "🟡", cls: "sig-watch" },
  elevated: { label: "Elevated", dot: "🟠", cls: "sig-elevated" },
  severe: { label: "Severe", dot: "🔴", cls: "sig-severe" },
  unavailable: { label: "n/a", dot: "⚪", cls: "sig-na" },
};

export const TREND_META: Record<Trend, { arrow: string; label: string; cls: string }> = {
  deteriorating: { arrow: "↑", label: "Deteriorating", cls: "trend-bad" },
  stable: { arrow: "→", label: "Stable", cls: "trend-flat" },
  improving: { arrow: "↓", label: "Improving", cls: "trend-good" },
  context: { arrow: "·", label: "Context-dependent", cls: "trend-flat" },
  unknown: { arrow: "–", label: "Unknown", cls: "trend-flat" },
};

export function scoreWord(score: number | null): string {
  if (score === null) return "unavailable";
  if (score >= 90) return "severe";
  if (score >= 75) return "elevated";
  if (score >= 50) return "in the watch range";
  if (score >= 35) return "moderate";
  return "low";
}
