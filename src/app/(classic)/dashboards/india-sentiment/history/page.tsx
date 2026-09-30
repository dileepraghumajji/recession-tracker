import Link from "next/link";
import { getBacktest, getSnapshotWithAnalogues } from "@/dashboards/india-sentiment/lib/data/service";
import { HORIZONS } from "@/dashboards/india-sentiment/lib/engine/history";
import { fmtNum, fmtSigned } from "@/dashboards/india-sentiment/lib/format";
import { configOverridesFromCookie } from "@/dashboards/india-sentiment/lib/server-config";
import { DemoWarning, PageHeader, Panel } from "@/dashboards/india-sentiment/components/ui";
import { BASE } from "@/dashboards/india-sentiment/routes";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ period?: string; h?: string }> }) {
  const q = await searchParams;
  const overrides = await configOverridesFromCookie();
  const [snap, bt] = await Promise.all([getSnapshotWithAnalogues(overrides), getBacktest(overrides, 0.5)]);
  const ranked = [...snap.analogues].sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1));
  const sel = snap.analogues.find((a) => a.id === q.period) ?? ranked[0];
  const labels = Object.fromEntries(snap.factors.map((f) => [f.id, f.label]));
  const horizon = HORIZONS.find((h) => h.id === q.h) ?? HORIZONS[2];
  return (
    <div className="space-y-5">
      <PageHeader title="Historical analogues & backtest" subtitle="How today's factor profile compares with past Indian market episodes, and what followed each sentiment band historically." />
      <DemoWarning what="analogue and backtest results" />

      <section className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Panel title="Historical periods">
          <table className="data">
            <thead>
              <tr>
                <th>Period</th>
                <th className="r">Score then</th>
                <th className="r">Similarity</th>
              </tr>
            </thead>
            <tbody>
              {snap.analogues.map((a) => (
                <tr key={a.id} style={a.id === sel?.id ? { background: "var(--surface-2)" } : undefined}>
                  <td>
                    <Link className="hover:underline" href={`${BASE}/history?period=${a.id}&h=${horizon.id}`}>
                      {a.label}
                    </Link>
                    <div className="num text-[11px] text-muted">
                      {a.start} → {a.end}
                    </div>
                  </td>
                  <td className="r">{fmtNum(a.score, 0)}</td>
                  <td className="r">{a.similarity === null ? "n/a" : `${a.similarity.toFixed(0)}%`}</td>
                </tr>
              ))}
              <tr>
                <td className="font-semibold">Current</td>
                <td className="r font-semibold">{fmtNum(snap.score, 0)}</td>
                <td />
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">Similarity = 100 − mean absolute difference of factor scores over factors available in both periods. It describes resemblance, not a forecast.</p>
        </Panel>
        {sel && (
          <Panel title={`Current vs ${sel.label}`}>
            <p className="mb-3 text-sm">{sel.text}</p>
            <table className="data">
              <thead>
                <tr>
                  <th>Factor</th>
                  <th className="r">Current</th>
                  <th className="r">Then</th>
                  <th className="r">Difference</th>
                </tr>
              </thead>
              <tbody>
                {snap.factors.map((f) => {
                  const then = sel.profile[f.id];
                  const d = f.score !== null && then !== null ? f.score - then : null;
                  return (
                    <tr key={f.id}>
                      <td>{labels[f.id]}</td>
                      <td className="r">{fmtNum(f.score, 0)}</td>
                      <td className="r">{fmtNum(then, 0)}</td>
                      <td className={`r ${d === null ? "text-muted" : Math.abs(d) <= 10 ? "" : "font-semibold"}`}>{d === null ? "—" : fmtSigned(d, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted">Differences within ±10 points count as shared characteristics.</p>
          </Panel>
        )}
      </section>

      <Panel
        title="Backtest — HISTORICAL OBSERVATIONS, not forecasts"
        right={
          <div className="flex flex-wrap gap-1">
            {HORIZONS.map((h) => (
              <Link key={h.id} className="btn" aria-pressed={h.id === horizon.id} href={`${BASE}/history?${sel ? `period=${sel.id}&` : ""}h=${h.id}`}>
                {h.label}
              </Link>
            ))}
          </div>
        }
      >
        <p className="mb-2 text-sm text-ink-2">
          Forward NIFTY 50 returns after each sentiment band, {bt.start ?? "—"} → {bt.end ?? "—"} ({bt.samples} weekly observations with ≥ {Math.round(bt.minCoverage * 100)}% factor coverage). Horizon: {horizon.label}.
        </p>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Sentiment band</th>
                <th className="r">Observations</th>
                <th className="r">≈ Independent</th>
                <th className="r">Average return</th>
                <th className="r">Median return</th>
                <th className="r">Positive</th>
                <th className="r">Avg max drawdown</th>
                <th className="r">Worst max drawdown</th>
              </tr>
            </thead>
            <tbody>
              {bt.buckets
                .filter((b) => b.horizon === horizon.id)
                .map((b) => (
                  <tr key={b.band}>
                    <td>{b.band}</td>
                    <td className="r">{b.n}</td>
                    <td className="r">{b.independentN}</td>
                    <td className="r">{b.mean === null ? "—" : `${fmtSigned(b.mean, 2)}%`}</td>
                    <td className="r">{b.median === null ? "—" : `${fmtSigned(b.median, 2)}%`}</td>
                    <td className="r">{b.positive === null ? "—" : `${b.positive.toFixed(0)}%`}</td>
                    <td className="r">{b.avgMaxDrawdown === null ? "—" : `${fmtNum(b.avgMaxDrawdown, 1)}%`}</td>
                    <td className="r">{b.worstMaxDrawdown === null ? "—" : `${fmtNum(b.worstMaxDrawdown, 1)}%`}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 space-y-0.5 text-xs text-muted">
          {bt.notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
