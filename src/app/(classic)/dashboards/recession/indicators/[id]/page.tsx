import Link from "next/link";
import { notFound } from "next/navigation";
import { getSnapshot } from "@/dashboards/recession/lib/data/service";
import { modelOverridesFromCookie } from "@/dashboards/recession/lib/server-config";
import { INDICATOR_BY_ID } from "@/dashboards/recession/lib/indicators";
import { fmtChange, fmtDate, fmtNum, fmtValue } from "@/dashboards/recession/lib/format";
import { resolveConfig } from "@/dashboards/recession/lib/model-config";
import { PageHeader, Panel, SignalBadge, StatusTag, TrendArrow } from "@/dashboards/recession/components/ui";
import { IndicatorChart } from "@/dashboards/recession/components/charts/IndicatorChart";
import type { RefLine } from "@/dashboards/recession/components/charts/TimeSeriesChart";
import { groupLabel } from "@/dashboards/recession/lib/engine/analyze";
import { BASE } from "@/dashboards/recession/routes";

export const dynamic = "force-dynamic";

const REF_LINES: Record<string, RefLine[]> = {
  sahm: [{ y: 0.5, label: "Sahm threshold 0.50" }],
  spread_10y2y: [{ y: 0, label: "Inversion" }],
  spread_10y3m: [{ y: 0, label: "Inversion" }],
  curve_memory: [{ y: 0, label: "Inversion" }],
  spread_2y3m: [{ y: 0, label: "0" }],
  ism_mfg: [{ y: 50, label: "50" }],
  ism_mfg_no: [{ y: 50, label: "50" }],
  ism_mfg_emp: [{ y: 50, label: "50" }],
  ism_svc: [{ y: 50, label: "50" }],
  ism_svc_no: [{ y: 50, label: "50" }],
  philly: [{ y: 0, label: "0" }],
  empire: [{ y: 0, label: "0" }],
  cpi_yoy: [{ y: 2, label: "2%" }],
  core_cpi_yoy: [{ y: 2, label: "2%" }],
  pce_yoy: [{ y: 2, label: "2% target" }],
  core_pce_yoy: [{ y: 2, label: "2% target" }],
  nfci: [{ y: 0, label: "Average" }],
  anfci: [{ y: 0, label: "Average" }],
  sloos: [{ y: 0, label: "Neutral" }],
  gdp: [{ y: 0, label: "0" }],
  gdpnow: [{ y: 0, label: "0" }],
};

export default async function IndicatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const def = INDICATOR_BY_ID[id];
  if (!def) notFound();
  const overrides = await modelOverridesFromCookie();
  const snap = await getSnapshot(overrides);
  const cfg = resolveConfig(overrides);
  const r = snap.indicators.find((x) => x.id === id)!;
  const contribs = (["recession", "inflation", "financial"] as const)
    .map((s) => ({ s, c: snap.scores[s].contributions.find((c) => c.indicatorId === id) }))
    .filter((x) => x.c);
  const mapping = def.stress?.mapping;
  return (
    <div className="space-y-5">
      <div className="text-xs text-muted">
        <Link href={`${BASE}/indicators`} className="link">
          Indicators
        </Link>{" "}
        / {groupLabel(def.group)}
      </div>
      <PageHeader title={def.name} subtitle={def.description} />
      <div className="grid gap-4 md:grid-cols-4">
        <Panel title="Current">
          <div className="text-3xl font-semibold">{r.available ? fmtValue(r, r.latest?.value) : "Unavailable"}</div>
          <div className="mt-1 text-xs text-muted">Observation date {r.latest?.date ?? "—"}</div>
          <div className="mt-2 flex items-center gap-3">
            {r.scored ? <SignalBadge signal={r.signal} /> : <span className="text-xs text-muted">Context indicator (not scored)</span>}
            <StatusTag status={r.status} />
          </div>
        </Panel>
        <Panel title="Stress">
          <div className="text-3xl font-semibold">{fmtNum(r.stress, 0)}</div>
          <div className="mt-1 text-xs text-muted">{r.stressMetricLabel}</div>
          <div className="mt-1 text-xs text-ink-2">
            Metric: {fmtNum(r.stressMetric, 2)} · Trend <TrendArrow trend={r.trend} showLabel />
          </div>
        </Panel>
        <Panel title="History">
          <div className="space-y-1 text-sm">
            <div>
              Percentile <span className="num float-right">{fmtNum(r.percentile, 0)}</span>
            </div>
            {def.percentile12m && (
              <div>
                12M percentile <span className="num float-right">{fmtNum(r.percentile12m, 0)}</span>
              </div>
            )}
            <div>
              Z-score <span className="num float-right">{fmtNum(r.zScore, 2)}</span>
            </div>
            <div>
              History since <span className="num float-right">{r.historyStart ?? "—"}</span>
            </div>
            {r.historyYears !== null && r.historyYears < 5 && <div className="text-[11px] text-serious">Short history ({r.historyYears.toFixed(1)}y): percentiles are less reliable.</div>}
          </div>
        </Panel>
        <Panel title="Changes">
          <div className="space-y-1 text-sm">
            {(
              [
                ["1W", "w1"],
                ["1M", "m1"],
                ["3M", "m3"],
                ["6M", "m6"],
                ["12M", "m12"],
              ] as const
            ).map(([l, k]) => (
              <div key={k}>
                {l} <span className="num float-right">{fmtChange(id, r.changes[k])}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {!r.available && (
        <Panel title="Why this is unavailable">
          <p className="text-sm text-ink-2">{r.unavailableReason}</p>
          <p className="mt-2 text-xs text-muted">No value is estimated or substituted. Its weight is redistributed within its cluster/category and the score&apos;s coverage is reduced accordingly.</p>
        </Panel>
      )}

      {def.inputs.length > 0 && (
        <Panel title="Chart">
          <IndicatorChart id={id} refLines={REF_LINES[id]} decimals={def.decimals ?? 2} />
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Interpretation & scoring">
          <div className="prose-sm text-sm">
            <p>
              <strong>Direction:</strong> {def.polarityNote}
            </p>
            {def.stress ? (
              <>
                <p>
                  <strong>Stress metric:</strong> {def.stress.label} ({def.stress.polarity === "higher_worse" ? "higher = more stress" : "lower = more stress"}).
                </p>
                {mapping?.kind === "percentile" ? (
                  <p>
                    <strong>Mapping:</strong> point-in-time historical percentile of the metric (polarity-adjusted). Signal bands: &lt;{cfg.bands.watch} Normal ·{" "}
                    {cfg.bands.watch}–{cfg.bands.elevated} Watch · {cfg.bands.elevated}–{cfg.bands.severe} Elevated · ≥{cfg.bands.severe} Severe.
                  </p>
                ) : mapping?.kind === "absolute" ? (
                  <>
                    <p>
                      <strong>Mapping:</strong> indicator-specific thresholds (piecewise linear). Metric values {mapping.anchors.map((a) => fmtNum(a, 2)).join(" → ")} map to
                      stress 0 → 50 (Watch) → 75 (Elevated) → 90 (Severe) → 100.
                    </p>
                    <p className="text-ink-2">{mapping.rationale}</p>
                  </>
                ) : null}
              </>
            ) : (
              <p>Not scored: displayed for context only.</p>
            )}
            {r.extra && (
              <ul>
                {Object.entries(r.extra).map(([k, v]) => (
                  <li key={k}>
                    {k.replace(/([A-Z])/g, " $1").toLowerCase()}: <span className="num">{typeof v === "number" ? fmtNum(v, 2) : String(v)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
        <Panel title="Contribution to scores">
          {contribs.length === 0 ? (
            <p className="text-sm text-muted">This indicator does not enter any composite score.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Category / cluster</th>
                  <th className="r">Weight</th>
                  <th className="r">Points</th>
                </tr>
              </thead>
              <tbody>
                {contribs.map(({ s, c }) => (
                  <tr key={s}>
                    <td>{snap.scores[s].label}</td>
                    <td className="text-ink-2">
                      {c!.category} / {c!.cluster}
                    </td>
                    <td className="r">{(c!.effectiveWeight * 100).toFixed(1)}%</td>
                    <td className="r">{c!.points.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel title="Sources & timestamps">
        {r.sources.length === 0 ? (
          <p className="text-sm text-muted">No source configured.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Series</th>
                  <th>Source</th>
                  <th>ID</th>
                  <th>Frequency</th>
                  <th>Last observation</th>
                  <th>Source last updated</th>
                  <th>Retrieved</th>
                </tr>
              </thead>
              <tbody>
                {r.sources.map((s) => (
                  <tr key={s.key}>
                    <td>{s.title}</td>
                    <td className="text-ink-2">
                      {s.synthetic ? <span className="font-semibold" style={{ color: "var(--demo)" }}>SYNTHETIC (demo mode)</span> : s.source}
                    </td>
                    <td className="font-mono text-xs">
                      {s.url ? (
                        <a className="link" href={s.url} target="_blank" rel="noreferrer noopener">
                          {s.sourceId}
                        </a>
                      ) : (
                        s.sourceId
                      )}
                    </td>
                    <td>{{ D: "Daily", W: "Weekly", M: "Monthly", Q: "Quarterly" }[s.frequency]}</td>
                    <td className="num">{s.lastObservation ?? "—"}</td>
                    <td className="num text-xs">{s.sourceLastUpdated ? fmtDate(s.sourceLastUpdated) : "not provided"}</td>
                    <td className="num text-xs">{fmtDate(s.fetchedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
