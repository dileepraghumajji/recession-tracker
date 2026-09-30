import { getHistorical } from "@/dashboards/recession/lib/data/service";
import { runBacktest } from "@/dashboards/recession/lib/engine/historical";
import { modelOverridesFromCookie } from "@/dashboards/recession/lib/server-config";
import { parseBacktestParams } from "@/dashboards/recession/lib/backtest-params";
import { fmtNum } from "@/dashboards/recession/lib/format";
import { PageHeader, Panel } from "@/dashboards/recession/components/ui";
import { DemoNotice } from "@/dashboards/recession/components/DemoNotice";
import { EventStudyChart } from "@/dashboards/recession/components/charts/EventStudyChart";
import { TimeSeriesChart } from "@/dashboards/recession/components/charts/TimeSeriesChart";
import { fieldClass } from "@/platform/ui/primitives/misc";
import { cn } from "@/platform/ui/cn";
import { buttonVariants } from "@/platform/ui/primitives/button";
import { tableClass, proseClass } from "@/platform/ui/patterns/content";

export const dynamic = "force-dynamic";

export default async function BacktestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseBacktestParams(await searchParams);
  const { records } = await getHistorical(await modelOverridesFromCookie());
  const bt = runBacktest(records, params);
  const s = bt.summary;
  const tiles: [string, string][] = [
    ["Recessions evaluable", String(s.evaluable)],
    ["Detected", String(s.detected)],
    ["False negatives (missed)", String(s.falseNegatives)],
    ["False positives", String(s.falsePositives)],
    ["Average lead (months)", fmtNum(s.avgLeadMonths, 1)],
    ["Median lead (months)", fmtNum(s.medianLeadMonths, 0)],
    ["Expansion months ≥ threshold", s.shareOfExpansionMonthsSignalling === null ? "—" : `${(s.shareOfExpansionMonthsSignalling * 100).toFixed(0)}%`],
    ["Unresolved recent signals", String(s.unresolved)],
  ];
  return (
    <div className="space-y-5">
      <PageHeader
        title="Backtest"
        description="The same methodology run month by month from 1970 using only data dated before each month, evaluated against NBER business-cycle dates. Parameters were chosen in advance; the sensitivity table shows results across thresholds instead of selecting the best one."
      />
      <DemoNotice what="backtest" />
      <Panel title="Parameters">
        <form className="flex flex-wrap items-end gap-4 text-sm" method="get">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Score</span>
            <select name="score" defaultValue={params.score} className={fieldClass}>
              <option value="recession">Recession Stress</option>
              <option value="financial">Financial Market Stress</option>
              <option value="inflation">Inflation Stress</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Signal threshold</span>
            <input className={cn(fieldClass, "w-24")} type="number" name="threshold" min={20} max={95} defaultValue={params.threshold} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Consecutive months</span>
            <input className={cn(fieldClass, "w-24")} type="number" name="sustain" min={1} max={12} defaultValue={params.sustainMonths} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Horizon before peak (months)</span>
            <input className={cn(fieldClass, "w-24")} type="number" name="horizon" min={3} max={36} defaultValue={params.horizonMonths} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Min. coverage</span>
            <input className={cn(fieldClass, "w-24")} type="number" step="0.05" name="coverage" min={0.2} max={1} defaultValue={params.minCoverage} />
          </label>
          <button className={buttonVariants({ size: "sm" })} type="submit">
            Run
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">
          Evaluated {bt.start} → {bt.end}. A detection = signal confirmed between {params.horizonMonths} months before an NBER peak and the trough. A false positive = a
          confirmed signal with no recession in that window. Lead = months from first confirmed signal to the peak (negative = after the peak).
        </p>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-[10px] border border-line bg-surface p-3">
            <div className="text-2xl font-semibold">{v}</div>
            <div className="text-xs text-muted">{k}</div>
          </div>
        ))}
      </div>

      <Panel title="Score history vs NBER recessions (shaded)">
        <TimeSeriesChart
          rows={bt.series.map((x) => ({ date: x.date, score: x.score }))}
          series={[{ key: "score", label: "Score", color: "var(--series-1)" }]}
          yDomain={[0, 100]}
          refLines={[{ y: params.threshold, label: `Threshold ${params.threshold}` }]}
          decimals={0}
          recessions
          height={300}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Per-recession results">
          <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Recession</th>
                <th>Evaluable</th>
                <th>Detected</th>
                <th>First signal</th>
                <th className="r">Lead (m)</th>
                <th className="r">Max 12m before</th>
                <th className="r">At peak</th>
                <th className="r">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {bt.recessions.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{r.evaluable ? "Yes" : <span className="text-muted">No (history)</span>}</td>
                  <td>{r.evaluable ? (r.detected ? "Yes" : "Missed") : "—"}</td>
                  <td className="tabular-nums">{r.evaluable ? (r.firstSignal?.slice(0, 7) ?? "—") : "—"}</td>
                  <td className="r">{r.evaluable ? fmtNum(r.leadMonths, 0) : "—"}</td>
                  <td className="r">{fmtNum(r.maxScore12mBefore, 0)}</td>
                  <td className="r">{fmtNum(r.scoreAtPeak, 0)}</td>
                  <td className="r">{r.coverageAtPeak === null ? "—" : `${(r.coverageAtPeak * 100).toFixed(0)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Panel>
        <Panel title="Signal episodes">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Confirmed</th>
                <th>Ended</th>
                <th className="r">Peak score</th>
                <th>Classification</th>
              </tr>
            </thead>
            <tbody>
              {bt.episodes.map((e) => (
                <tr key={e.confirmed}>
                  <td className="tabular-nums">{e.confirmed.slice(0, 7)}</td>
                  <td className="tabular-nums">{e.end.slice(0, 7)}</td>
                  <td className="r">{e.maxScore.toFixed(0)}</td>
                  <td>
                    {e.classification === "true_signal" ? `Preceded/coincided with ${e.recession ?? "recession"}` : e.classification === "unresolved" ? "Unresolved (too recent)" : "False positive"}
                  </td>
                </tr>
              ))}
              {bt.episodes.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted">
                    No signal episodes at this threshold.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Score around NBER peaks (event study)">
          <EventStudyChart rows={bt.eventStudy} threshold={params.threshold} />
        </Panel>
        <Panel title="Score behaviour before / during / after">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Phase</th>
                <th className="r">Average score</th>
                <th className="r">Months</th>
              </tr>
            </thead>
            <tbody>
              {bt.phases.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td className="r">{fmtNum(p.mean, 0)}</td>
                  <td className="r">{p.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="mb-1 mt-5 text-xs font-semibold uppercase text-muted">Threshold sensitivity (not an optimisation)</h3>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className="r">Threshold</th>
                <th className="r">Detected</th>
                <th className="r">Missed</th>
                <th className="r">False pos.</th>
                <th className="r">Avg lead</th>
              </tr>
            </thead>
            <tbody>
              {bt.sensitivity.map((x) => (
                <tr key={x.threshold} className={x.threshold === params.threshold ? "font-semibold" : ""}>
                  <td className="r">{x.threshold}</td>
                  <td className="r">{x.detected}</td>
                  <td className="r">{x.falseNegatives}</td>
                  <td className="r">{x.falsePositives}</td>
                  <td className="r">{fmtNum(x.avgLeadMonths, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Caveats — read before drawing conclusions">
        <ul className={cn(proseClass, "text-sm text-ink-2")}>
          {bt.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
