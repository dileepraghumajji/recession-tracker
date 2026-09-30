import { getSnapshot } from "@/dashboards/recession/lib/data/service";
import { modelOverridesFromCookie } from "@/dashboards/recession/lib/server-config";
import { GROUPS } from "@/dashboards/recession/lib/indicators";
import { fmtChange, fmtNum, fmtValue } from "@/dashboards/recession/lib/format";
import { IndicatorLink, PageHeader, Panel, SignalBadge, StatusTag, TrendArrow } from "@/dashboards/recession/components/ui";

export const dynamic = "force-dynamic";

export default async function IndicatorsPage() {
  const snap = await getSnapshot(await modelOverridesFromCookie());
  return (
    <div>
      <PageHeader
        title="All indicators"
        subtitle={
          <>
            Current value, changes, point-in-time historical percentile, z-score, stress (0–100), signal and trend for every tracked series. Trend arrows
            describe <em>stress</em>: ↑ deteriorating · → stable · ↓ improving (change in stress over ~3 months, ±5 pts). “·” = context-dependent indicator
            that is not scored. Status is judged against each series&apos; release frequency.
          </>
        }
      />
      <div className="space-y-5">
        {GROUPS.map((g) => {
          const rows = snap.indicators.filter((i) => i.group === g.id);
          if (!rows.length) return null;
          return (
            <Panel key={g.id} title={g.label}>
              <div className="overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Indicator</th>
                      <th>Signal</th>
                      <th className="r">Current</th>
                      <th className="r">1W</th>
                      <th className="r">1M</th>
                      <th className="r">3M</th>
                      <th className="r">6M</th>
                      <th className="r">12M</th>
                      <th className="r" title="Historical percentile of the current value (full available history)">Pctl</th>
                      <th className="r">Z</th>
                      <th className="r" title="Stress 0-100 (polarity-adjusted)">Stress</th>
                      <th>Trend</th>
                      <th>Status</th>
                      <th>As of</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="min-w-[200px]">
                          <IndicatorLink id={r.id}>{r.name}</IndicatorLink>
                          {!r.available && <div className="max-w-md text-[11px] leading-snug text-muted">{r.unavailableReason}</div>}
                        </td>
                        <td>{r.scored ? <SignalBadge signal={r.signal} /> : <span className="text-xs text-muted">context</span>}</td>
                        <td className="r">{r.available ? fmtValue(r, r.latest?.value) : <span className="text-muted">n/a</span>}</td>
                        {(["w1", "m1", "m3", "m6", "m12"] as const).map((k) => (
                          <td key={k} className="r text-ink-2">
                            {r.available ? fmtChange(r.id, r.changes[k]) : "—"}
                          </td>
                        ))}
                        <td className="r">{r.available ? fmtNum(r.percentile, 0) : "—"}</td>
                        <td className="r">{r.available ? fmtNum(r.zScore, 1) : "—"}</td>
                        <td className="r">{fmtNum(r.stress, 0)}</td>
                        <td className="text-center">
                          <TrendArrow trend={r.trend} />
                        </td>
                        <td>
                          <StatusTag status={r.status} />
                        </td>
                        <td className="whitespace-nowrap text-xs text-muted">{r.latest?.date ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
