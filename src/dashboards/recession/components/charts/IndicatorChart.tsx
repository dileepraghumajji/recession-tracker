"use client";
import { useEffect, useState } from "react";
import { PeriodSelector, TimeSeriesChart, type RefLine } from "./TimeSeriesChart";
import { API } from "@/dashboards/recession/routes";

const PERIODS = ["1M", "3M", "1Y", "5Y", "MAX"] as const;
type Period = (typeof PERIODS)[number];

interface Payload {
  display: { date: string; value: number }[];
  stress: { date: string; value: number }[];
  stressLabel: string;
  units: string;
  name: string;
}

export function IndicatorChart({ id, refLines = [], decimals = 2 }: { id: string; refLines?: RefLine[]; decimals?: number }) {
  const [period, setPeriod] = useState<Period>("5Y");
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setErr(null);
    fetch(`${API}/indicators/${encodeURIComponent(id)}/series?period=${period}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => alive && setData(j))
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, [id, period]);
  const long = period === "5Y" || period === "MAX";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">{data ? `${data.name} (${data.units})` : "Loading…"}</span>
        <PeriodSelector value={period} options={PERIODS} onChange={setPeriod} />
      </div>
      {err && <p className="text-sm text-muted">Chart unavailable: {err}</p>}
      {data && (
        <>
          <TimeSeriesChart
            rows={data.display.map((o) => ({ date: o.date, value: o.value }))}
            series={[{ key: "value", label: data.name, color: "var(--s-recession)" }]}
            refLines={refLines}
            decimals={decimals}
            recessions={long}
          />
          {data.stress.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-muted">Stress score (0–100) from: {data.stressLabel}. Bands: 50 Watch · 75 Elevated · 90 Severe.</p>
              <TimeSeriesChart
                rows={data.stress.map((o) => ({ date: o.date, stress: o.value }))}
                series={[{ key: "stress", label: "Stress", color: "var(--s-inflation)" }]}
                yDomain={[0, 100]}
                refLines={[
                  { y: 50, label: "50" },
                  { y: 75, label: "75" },
                  { y: 90, label: "90" },
                ]}
                decimals={0}
                height={160}
                recessions={long}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
