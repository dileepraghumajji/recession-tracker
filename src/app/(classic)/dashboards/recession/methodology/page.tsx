import { getPrepared, getSnapshot } from "@/dashboards/recession/lib/data/service";
import { modelOverridesFromCookie } from "@/dashboards/recession/lib/server-config";
import { resolveConfig } from "@/dashboards/recession/lib/model-config";
import { fmtNum, fmtValue } from "@/dashboards/recession/lib/format";
import { IndicatorLink, PageHeader, Panel, SignalBadge, StatusTag, TrendArrow } from "@/dashboards/recession/components/ui";
import { correlationCheck } from "@/dashboards/recession/lib/engine/correlation";
import type { CompositeScore, IndicatorReading } from "@/dashboards/recession/lib/types";

export const dynamic = "force-dynamic";

function ScoreBreakdown({ score, readings, description }: { score: CompositeScore; readings: Record<string, IndicatorReading>; description: string }) {
  return (
    <Panel
      title={`${score.label}: ${score.score === null ? "n/a" : score.score.toFixed(1)}`}
      right={<span className="text-xs text-muted">Coverage {(score.coverage * 100).toFixed(0)}% · Freshness {(score.freshness * 100).toFixed(0)}%</span>}
    >
      <p className="mb-3 text-sm text-ink-2">{description}</p>
      <div className="overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>Category</th>
              <th className="r">Nominal weight</th>
              <th className="r">Effective weight</th>
              <th className="r">Category score</th>
              <th className="r">Points</th>
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {score.categories.map((c) => (
              <tr key={c.id}>
                <td>{c.label}</td>
                <td className="r">{(c.nominalWeight * 100).toFixed(0)}%</td>
                <td className="r">{(c.effectiveWeight * 100).toFixed(1)}%</td>
                <td className="r">{fmtNum(c.score, 1)}</td>
                <td className="r font-semibold">{c.score === null ? "—" : (c.effectiveWeight * c.score).toFixed(1)}</td>
                <td>
                  <SignalBadge signal={c.signal} />
                </td>
              </tr>
            ))}
            <tr>
              <td className="font-semibold">Total</td>
              <td className="r">100%</td>
              <td className="r">100%</td>
              <td />
              <td className="r font-semibold">{fmtNum(score.score, 1)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-4 space-y-2">
        {score.categories.map((c) => (
          <details key={c.id} className="rounded border border-line">
            <summary className="cursor-pointer px-3 py-2 text-sm">
              <span className="font-medium">{c.label}</span>
              <span className="ml-2 text-muted">
                score {fmtNum(c.score, 1)} · {c.clusters.length} clusters · coverage {(c.coverage * 100).toFixed(0)}%
              </span>
            </summary>
            <div className="overflow-x-auto px-3 pb-3">
              <table className="data">
                <thead>
                  <tr>
                    <th>Cluster (weight)</th>
                    <th>Indicator</th>
                    <th className="r">Weight in score</th>
                    <th className="r">Current reading</th>
                    <th className="r">Hist. pctl</th>
                    <th className="r">Stress</th>
                    <th className="r">Contribution</th>
                    <th>Direction</th>
                    <th>Status</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {c.clusters.flatMap((cl) =>
                    cl.members.map((id, i) => {
                      const r = readings[id];
                      const con = score.contributions.find((x) => x.indicatorId === id && x.cluster === cl.id);
                      return (
                        <tr key={`${cl.id}-${id}`}>
                          <td className="text-ink-2">
                            {i === 0 ? (
                              <>
                                {cl.label} <span className="text-muted">({cl.weight})</span>
                                <div className="text-[11px] text-muted">cluster score {fmtNum(cl.score, 0)}</div>
                              </>
                            ) : null}
                          </td>
                          <td>
                            <IndicatorLink id={id}>{r.name}</IndicatorLink>
                          </td>
                          <td className="r">{con && con.effectiveWeight > 0 ? `${(con.effectiveWeight * 100).toFixed(2)}%` : <span className="text-muted">0 (n/a)</span>}</td>
                          <td className="r">{r.available ? fmtValue(r, r.latest?.value) : "n/a"}</td>
                          <td className="r">{fmtNum(r.percentile, 0)}</td>
                          <td className="r">{fmtNum(r.stress, 0)}</td>
                          <td className="r font-semibold">{con ? con.points.toFixed(2) : "—"}</td>
                          <td>
                            <TrendArrow trend={r.trend} showLabel />
                          </td>
                          <td>
                            <StatusTag status={r.status} />
                          </td>
                          <td className="max-w-[220px] text-[11px] text-muted">{r.sources.map((s) => `${s.synthetic ? "SYNTHETIC" : s.source} [${s.sourceId}]`).join("; ")}</td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </Panel>
  );
}

export default async function Methodology() {
  const overrides = await modelOverridesFromCookie();
  const snap = await getSnapshot(overrides);
  const cfg = resolveConfig(overrides);
  const readings = Object.fromEntries(snap.indicators.map((r) => [r.id, r]));
  const { prepared } = await getPrepared();
  const corr = correlationCheck(prepared, "recession", snap.asOf);
  const crossHigh = corr.pairs.filter((p) => !p.sameCluster && Math.abs(p.rho) >= 0.8).slice(0, 10);
  const within = corr.pairs.filter((p) => p.sameCluster).slice(0, 10);

  return (
    <div className="space-y-5">
      <PageHeader
        title="How the Score Works"
        subtitle="Every number on the dashboard can be traced to the table rows below: indicator → stress (0–100) → cluster → category → composite. Points sum exactly to each score."
      />

      <Panel title="Method in brief">
        <div className="prose-sm grid gap-6 text-sm lg:grid-cols-2">
          <div>
            <h3>1. Indicator stress (0–100)</h3>
            <p>
              Each scored indicator has a <em>stress metric</em> (e.g. the Sahm value, a spread level, a YoY change) and a direction (whether higher is worse). By
              default the metric is converted to its <strong>point-in-time historical percentile</strong> using only data available up to that date, flipped when
              lower is worse. Where an economically meaningful level exists (curve inversion at 0, Sahm 0.50, the 2% inflation target, −10%/−20% drawdowns, GDP
              around 0) indicator-specific anchors are used instead; each anchor set and its rationale are shown on the indicator page.
            </p>
            <h3>2. Signals</h3>
            <p>
              🟢 Normal &lt; {cfg.bands.watch} · 🟡 Watch {cfg.bands.watch}–{cfg.bands.elevated} · 🟠 Elevated {cfg.bands.elevated}–{cfg.bands.severe} · 🔴 Severe ≥{" "}
              {cfg.bands.severe}. For percentile-mapped indicators these are literally the 50th / 75th / 90th historical percentiles.
            </p>
            <h3>3. Trend</h3>
            <p>
              Change in stress over ~3 months: ↑ deteriorating (&gt; +{cfg.trendThreshold}), ↓ improving (&lt; −{cfg.trendThreshold}), → stable. Because stress is already
              polarity-adjusted, “↑” always means worse — e.g. unemployment ↑ or GDP ↓ both show ↑. Context indicators (Treasury yield levels, oil prices, gold) show “·”.
            </p>
          </div>
          <div>
            <h3>4. Avoiding double counting</h3>
            <p>
              Indicators that measure the same underlying factor are placed in one <strong>factor cluster</strong> and averaged, so the cluster gets one weight
              regardless of how many correlated series it contains. Examples: CPI and PCE (headline) share one cluster, core CPI and core PCE another; HY, CCC and HY
              widening share “high yield”; the 2Y, 3M and Fed funds rate are not scored as levels at all — only the 2Y–3M spread (expected easing) enters. Within a
              score an indicator can belong to only one cluster (enforced by automated tests). The correlation check below audits this against the data.
            </p>
            <h3>5. Aggregation</h3>
            <p>
              score = Σ<sub>category</sub> W × Σ<sub>cluster</sub> w × mean(stress). Missing clusters/categories are removed and the remaining weights renormalised —
              never filled with estimates. The lost weight is reported as <em>coverage</em>; data age is reported as <em>freshness</em> (LIVE 100%, RECENT 85%, STALE
              40%, UNAVAILABLE 0%, weighted by importance). Confidence = coverage × freshness.
            </p>
            <h3>6. Four scores, not one</h3>
            <p>
              Recession, Inflation and Financial Market Stress are computed separately. Overall Macro Stress = {cfg.overall.recession}% Recession +{" "}
              {cfg.overall.inflation}% Inflation + {cfg.overall.financial}% Financial. It measures breadth of macro stress and is <strong>not</strong> a recession
              probability. All weights are configurable in Settings.
            </p>
          </div>
        </div>
      </Panel>

      <ScoreBreakdown score={snap.scores.recession} readings={readings} description={cfg.scores.recession.description} />
      <ScoreBreakdown score={snap.scores.inflation} readings={readings} description={cfg.scores.inflation.description} />
      <ScoreBreakdown score={snap.scores.financial} readings={readings} description={cfg.scores.financial.description} />

      <Panel title="Regime classification rules">
        <p className="mb-3 text-sm text-ink-2">
          All rules are evaluated every time; the highest-priority matching rule sets the regime (priority: recession stress → stagflationary → deflationary → financial
          → inflationary overheating → growth slowdown → late-cycle → expansion). Qualifiers are appended when Inflation ≥ 50, Financial ≥ 50 or long-end pressure ≥ 70.
          Current: <strong>{snap.regime.display}</strong>.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Regime</th>
              <th>Condition</th>
              <th>Matched</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {snap.regime.rules.map((r) => (
              <tr key={r.id}>
                <td className={r.id === snap.regime.primary ? "font-semibold" : ""}>{r.label}</td>
                <td className="text-xs text-ink-2">{r.condition}</td>
                <td>{r.matched ? "Yes" : "No"}</td>
                <td className="text-xs text-muted">{r.evidence.join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Correlation check (recession-score indicators, monthly stress metrics, last 15 years)">
        <p className="mb-3 text-sm text-ink-2">
          Average correlation within clusters: <strong>{fmtNum(corr.withinAvg, 2)}</strong> · across clusters: <strong>{fmtNum(corr.acrossAvg, 2)}</strong>. Highly
          correlated pairs in <em>different</em> clusters are listed so the clustering can be reviewed; they are candidates for merging if the relationship is
          structural.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase text-muted">Across clusters, |ρ| ≥ 0.8</h3>
            <PairTable pairs={crossHigh} empty="None — clusters look adequately separated." />
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase text-muted">Strongest within-cluster pairs (pooled)</h3>
            <PairTable pairs={within} empty="No within-cluster pairs with enough overlap." />
          </div>
        </div>
      </Panel>

      <Panel title="Limitations">
        <ul className="prose-sm text-sm text-ink-2">
          <li>Scores describe resemblance to historical stress conditions. They are not probabilities and have no guaranteed predictive power.</li>
          <li>Weights are judgement-based and were not fitted to past recessions (to avoid overfitting a sample of ~8 events).</li>
          <li>Percentiles depend on the available history, which differs by series (FRED carries only ~3 years of ICE credit spreads and ~10 years of the S&P 500).</li>
          <li>Several important series are proprietary (ISM, Conference Board, Goldman Sachs FCI, forward P/E) and are shown as unavailable unless licensed data are loaded.</li>
          <li>Data are revised after release; historical scores use today&apos;s vintages.</li>
        </ul>
      </Panel>
    </div>
  );
}

function PairTable({ pairs, empty }: { pairs: { a: string; b: string; aName: string; bName: string; rho: number; n: number }[]; empty: string }) {
  if (!pairs.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Pair</th>
          <th className="r">ρ</th>
          <th className="r">Months</th>
        </tr>
      </thead>
      <tbody>
        {pairs.map((p) => (
          <tr key={`${p.a}-${p.b}`}>
            <td>
              {p.aName} × {p.bName}
            </td>
            <td className="r">{p.rho.toFixed(2)}</td>
            <td className="r">{p.n}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
