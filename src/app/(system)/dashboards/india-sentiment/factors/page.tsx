import { getSnapshot } from "@/dashboards/india-sentiment/lib/data/service";
import { fmtChange, fmtReading } from "@/dashboards/india-sentiment/lib/format";
import { configOverridesFromCookie } from "@/dashboards/india-sentiment/lib/server-config";
import { PageHeader, Panel, StatusTag } from "@/dashboards/india-sentiment/components/ui";
import { tableClass } from "@/platform/ui/patterns/content";

export const dynamic = "force-dynamic";

const FREQ = { D: "Daily", W: "Weekly", M: "Monthly", Q: "Quarterly" } as const;
const pct = (v: number | null) => (v === null ? "—" : v.toFixed(0));

export default async function Factors() {
  const s = await getSnapshot(await configOverridesFromCookie());
  const c = s.confidence;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Factors & data quality"
        description="Every indicator with its value, timestamp, frequency, source and data status. Scores are 0–100 (higher = greed / risk-on). Percentile columns show where the raw value sits in its own 5/10/15-year history. Unavailable values are never estimated."
      />
      <Panel title={`Model confidence ${c.score}/100`}>
        <div className="grid gap-2 text-sm sm:grid-cols-4">
          <div>Factor coverage <span className="tabular-nums font-semibold">{(c.coverage * 100).toFixed(0)}%</span></div>
          <div>Freshness <span className="tabular-nums font-semibold">{(c.freshness * 100).toFixed(0)}%</span></div>
          <div>Core segments <span className="tabular-nums font-semibold">{(c.criticalCoverage * 100).toFixed(0)}%</span></div>
          <div>Source agreement <span className="tabular-nums font-semibold">{(c.agreement * 100).toFixed(0)}%</span></div>
        </div>
        <ul className="mt-2 space-y-0.5 text-xs text-ink-2">
          {c.reasons.map((r) => (
            <li key={r}>· {r}</li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted">Confidence = 35% factor coverage + 25% freshness + 25% coverage of core Indian segments (momentum, breadth, derivatives, volatility, flows) + 15% agreement between independent sources (USD/INR, 10Y G-Sec).</p>
      </Panel>

      {s.factors.map((f) => {
        const rows = s.readings.filter((r) => r.factor === f.id);
        return (
          <Panel
            key={f.id}
            title={`${f.label} · ${f.score === null ? "unavailable" : f.score.toFixed(0)}`}
            right={
              <span className="tabular-nums text-xs text-muted">
                weight {f.nominalWeight} → {(f.effectiveWeight * 100).toFixed(1)}% · coverage {(f.coverage * 100).toFixed(0)}% · {f.points >= 0 ? "+" : ""}
                {f.points.toFixed(1)} pts
              </span>
            }
          >
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
              {f.clusters.map((cl) => (
                <span key={cl.id}>
                  {cl.label} ({cl.weight}): <span className="tabular-nums">{cl.score === null ? "n/a" : cl.score.toFixed(0)}</span>
                </span>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th>Indicator</th>
                    <th className="r">Value</th>
                    <th className="r">Score</th>
                    <th className="r">1D</th>
                    <th className="r">1W</th>
                    <th className="r">1M</th>
                    <th className="r">3M</th>
                    <th className="r">Pct 5Y/10Y/15Y</th>
                    <th>Timestamp</th>
                    <th>Freq.</th>
                    <th>Source</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isPct = r.changeMode === "pct";
                    return (
                      <tr key={r.id} className={r.scored ? "" : "text-ink-2"}>
                        <td title={`${r.description} ${r.polarityNote}`.trim()}>
                          {r.name}
                          {!r.scored && <span className="ml-1 text-[10px] text-muted">context</span>}
                          {!r.available && r.unavailableReason && <div className="text-[11px] text-muted">{r.unavailableReason}</div>}
                        </td>
                        <td className="r">{fmtReading(r, r.value)}</td>
                        <td className="r">{r.score === null ? "—" : r.score.toFixed(0)}</td>
                        <td className="r">{fmtChange(r, r.changes.d1, isPct)}</td>
                        <td className="r">{fmtChange(r, r.changes.w1, isPct)}</td>
                        <td className="r">{fmtChange(r, r.changes.m1, isPct)}</td>
                        <td className="r">{fmtChange(r, r.changes.m3, isPct)}</td>
                        <td className="r">
                          {pct(r.pct5y)} / {pct(r.pct10y)} / {pct(r.pct15y)}
                        </td>
                        <td className="tabular-nums whitespace-nowrap text-xs">{r.date ?? "—"}</td>
                        <td className="text-xs">{FREQ[r.frequency]}</td>
                        <td className="text-xs" title={r.sourceIds.join(", ")}>
                          {r.source}
                          {r.synthetic && <span style={{ color: "var(--demo)" }}> · SYNTHETIC</span>}
                        </td>
                        <td>
                          <StatusTag status={r.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
