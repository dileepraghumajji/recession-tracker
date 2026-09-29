"use client";
import { useEffect, useMemo, useState } from "react";
import { PeriodSelector, TimeSeriesChart } from "./TimeSeriesChart";

type Row = { date: string; recession: number | null; inflation: number | null; financial: number | null; overall: number | null };
const PERIODS = ["1M", "3M", "1Y", "5Y", "MAX"] as const;
type Period = (typeof PERIODS)[number];

const SERIES = [
  { key: "recession", label: "Recession", color: "var(--s-recession)" },
  { key: "inflation", label: "Inflation", color: "var(--s-inflation)" },
  { key: "financial", label: "Financial", color: "var(--s-financial)" },
  { key: "overall", label: "Overall", color: "var(--s-overall)", dash: "4 3" },
];

export function ScoreHistoryChart({ weekly }: { weekly: Row[] }) {
  const [period, setPeriod] = useState<Period>("1Y");
  const [monthly, setMonthly] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const long = period === "5Y" || period === "MAX";
  useEffect(() => {
    if (!long || monthly) return;
    fetch("/api/score-history")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => setMonthly(j.records))
      .catch((e) => setErr(String(e)));
  }, [long, monthly]);
  const rows = useMemo(() => {
    const end = weekly.length ? weekly[weekly.length - 1].date : new Date().toISOString().slice(0, 10);
    const back = (days: number) => new Date(Date.parse(end) - days * 86_400_000).toISOString().slice(0, 10);
    if (!long) {
      const cutoff = back(period === "1M" ? 31 : period === "3M" ? 92 : 366);
      return weekly.filter((r) => r.date >= cutoff);
    }
    if (!monthly) return [];
    if (period === "MAX") return monthly;
    return monthly.filter((r) => r.date >= back(5 * 366));
  }, [period, weekly, monthly, long]);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {long
            ? "Monthly, point-in-time with publication lags (same engine as the backtest). Shaded: NBER recessions."
            : "Weekly, recomputed with data dated up to each point."}
        </p>
        <PeriodSelector value={period} options={PERIODS} onChange={setPeriod} />
      </div>
      {long && !monthly && !err && <div className="flex h-60 items-center justify-center text-sm text-muted">Computing history…</div>}
      {err && <div className="text-sm text-muted">History unavailable: {err}</div>}
      {(!long || monthly) && (
        <TimeSeriesChart
          rows={rows}
          series={SERIES}
          yDomain={[0, 100]}
          decimals={0}
          refLines={[
            { y: 50, label: "Watch 50" },
            { y: 75, label: "Elevated 75" },
            { y: 90, label: "Severe 90" },
          ]}
          recessions={long}
          height={280}
        />
      )}
    </div>
  );
}
