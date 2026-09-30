"use client";
import { useEffect, useState } from "react";
import { CHART_METRICS, CHART_PERIODS, type ChartPayload, type ChartPeriod } from "../lib/chart-metrics";
import { API } from "../routes";
import { PAIR_CHART_HEIGHT, PairChart } from "./PairChart";
import { ChartSkeleton } from "@/platform/ui/patterns/skeletons";
import { fieldClass } from "@/platform/ui/primitives/misc";
import { buttonVariants } from "@/platform/ui/primitives/button";

const REF: Record<string, number> = { sentiment: 50, oi_pcr: 1, premium_pcr: 1, pressure: 0, credit_stress: 50, fii: 0, earnings: 0 };

/** Interactive "NIFTY vs X" charts. `initialMetric` lets pages embed a specific pair. */
export function ChartsExplorer({ initialMetric = "sentiment", initialPeriod = "1Y", lockMetric = false }: { initialMetric?: string; initialPeriod?: ChartPeriod; lockMetric?: boolean }) {
  const [metric, setMetric] = useState(initialMetric);
  const [period, setPeriod] = useState<ChartPeriod>(initialPeriod);
  const [data, setData] = useState<ChartPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    fetch(`${API}/chart?metric=${encodeURIComponent(metric)}&period=${period}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => alive && setData(j))
      .catch((e) => alive && setErr(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [metric, period]);
  const m = CHART_METRICS.find((x) => x.id === metric)!;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!lockMetric && (
          <select className={fieldClass} value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Comparison series">
            {CHART_METRICS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.top === "sentiment" ? "Sentiment" : "NIFTY"} vs {c.label}
              </option>
            ))}
          </select>
        )}
        <div className="flex flex-wrap gap-1" role="group" aria-label="Timeframe">
          {CHART_PERIODS.map((p) => (
            <button key={p} className={buttonVariants({ size: "sm" })} aria-pressed={p === period} onClick={() => setPeriod(p)}>
              {p}
            </button>
          ))}
        </div>
        {loading && <span className="text-xs text-muted">Loading…</span>}
      </div>
      {err && <p className="text-sm text-muted">Chart unavailable: {err}</p>}
      {data?.note && <p className="text-xs text-muted">{data.note}</p>}
      {!data && !err && <ChartSkeleton height={PAIR_CHART_HEIGHT} />}
      {data && (
        <PairChart
          top={data.top.points}
          bottom={data.bottom.points}
          topLabel={data.top.label}
          bottomLabel={`${data.bottom.label} (${data.bottom.units})`}
          bars={data.intraday}
          intraday={data.intraday}
          bottomRef={REF[m.id]}
          bottomDomain={m.units === "0–100" ? [0, 100] : undefined}
        />
      )}
    </div>
  );
}
