import { getSnapshot } from "@/dashboards/india-sentiment/lib/data/service";
import { fmtCr, fmtNum, fmtSigned } from "@/dashboards/india-sentiment/lib/format";
import { configOverridesFromCookie } from "@/dashboards/india-sentiment/lib/server-config";
import { PageHeader, Panel } from "@/dashboards/india-sentiment/components/ui";

export const dynamic = "force-dynamic";

function Ret({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted">—</span>;
  return <span className={v > 0 ? "trend-good" : v < 0 ? "trend-bad" : "trend-flat"}>{fmtSigned(v, 1)}</span>;
}

export default async function Markets() {
  const s = await getSnapshot(await configOverridesFromCookie());
  const byId = Object.fromEntries(s.readings.map((r) => [r.id, r]));
  const breadthIds = ["ad_ratio_10d", "ad_vol_ratio_10d", "pct_above_20", "pct_above_50", "pct_above_100", "pct_above_200", "hl_ratio_10d", "up_down_value_10d", "ad_line_1m", "rs_breadth", "breadth_thrust"];
  const rel = (v: number | null) => {
    if (v === null) return { style: undefined, text: "—" };
    const a = Math.min(1, Math.abs(v) / 6);
    return { style: { background: `color-mix(in srgb, ${v >= 0 ? "var(--good)" : "var(--serious)"} ${Math.round(a * 40)}%, transparent)` }, text: fmtSigned(v, 1) };
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Markets & flows" subtitle="Equity momentum across NSE/BSE indices, sector rotation, breadth and market internals, institutional flows and the cross-asset context." />

      <Panel title={`Equity momentum · Market Momentum Score ${s.subScores.momentum?.toFixed(0) ?? "n/a"}`}>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Index</th>
                <th className="r">Last</th>
                <th className="r">1D %</th>
                <th className="r">1W %</th>
                <th className="r">1M %</th>
                <th className="r">3M %</th>
                <th className="r">6M %</th>
                <th className="r">12M %</th>
                <th className="r">vs 52W high</th>
                <th className="r">vs 52W low</th>
                <th className="r">20/50/100/200 DMA</th>
                <th className="r">50DMA slope</th>
                <th className="r">Trend strength</th>
              </tr>
            </thead>
            <tbody>
              {s.momentumTable.map((m) => (
                <tr key={m.sym}>
                  <td className="whitespace-nowrap">{m.name}</td>
                  <td className="r">{fmtNum(m.last, 0)}</td>
                  <td className="r"><Ret v={m.r1d} /></td>
                  <td className="r"><Ret v={m.r1w} /></td>
                  <td className="r"><Ret v={m.r1m} /></td>
                  <td className="r"><Ret v={m.r3m} /></td>
                  <td className="r"><Ret v={m.r6m} /></td>
                  <td className="r"><Ret v={m.r12m} /></td>
                  <td className="r">{fmtSigned(m.fromHigh, 1)}%</td>
                  <td className="r">{fmtSigned(m.fromLow, 1)}%</td>
                  <td className="r font-mono text-xs" title={([20, 50, 100, 200] as const).map((n) => `${n}DMA ${fmtNum(m.dma[n], 0)}`).join(" · ")}>
                    {([20, 50, 100, 200] as const).map((n) => (m.aboveDma[n] === null ? "·" : m.aboveDma[n] ? "▲" : "▼")).join(" ")}
                  </td>
                  <td className="r">{m.slope50 === null ? "—" : `${fmtSigned(m.slope50, 2)}%`}</td>
                  <td className="r">{fmtNum(m.trendStrength, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted">▲/▼ = price above/below the 20, 50, 100 and 200-day moving averages. Trend strength = signed efficiency ratio over 50 sessions (−1…+1).</p>
      </Panel>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title={`Sector rotation · Sector Risk Appetite ${s.subScores.sectorRiskAppetite?.toFixed(0) ?? "n/a"}`}>
          <p className="mb-2 text-sm">{s.rotation.text}</p>
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Sector</th>
                  <th>Group</th>
                  <th className="r">1D vs NIFTY</th>
                  <th className="r">1W</th>
                  <th className="r">1M</th>
                  <th className="r">3M</th>
                </tr>
              </thead>
              <tbody>
                {s.rotation.rows.map((r) => (
                  <tr key={r.sym}>
                    <td className="whitespace-nowrap">{r.name}</td>
                    <td className="text-ink-2">{r.group}</td>
                    {(["d1", "w1", "m1", "m3"] as const).map((k) => {
                      const c = rel(r.rel[k]);
                      return (
                        <td key={k} className="r" style={c.style} title={`absolute ${fmtSigned(r.ret[k], 1)}%`}>
                          {c.text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted">Relative return vs NIFTY 50 in percentage points; hover for absolute return.</p>
        </Panel>
        <Panel title="Rotation by style group (vs NIFTY, pp)">
          <table className="data">
            <thead>
              <tr>
                <th>Group</th>
                <th className="r">1M</th>
                <th className="r">3M</th>
              </tr>
            </thead>
            <tbody>
              {s.rotation.groups.map((g) => (
                <tr key={g.group}>
                  <td>{g.group}</td>
                  <td className="r"><Ret v={g.rel1m} /></td>
                  <td className="r"><Ret v={g.rel3m} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Breadth & internals · Breadth ${s.subScores.breadth?.toFixed(0) ?? "n/a"} · Internal strength ${s.subScores.internalStrength?.toFixed(0) ?? "n/a"}`}>
          <table className="data">
            <tbody>
              {breadthIds.map((id) => {
                const r = byId[id];
                if (!r) return null;
                return (
                  <tr key={id}>
                    <td>{r.name}</td>
                    <td className="r">{r.available ? fmtNum(r.value, id.startsWith("pct") || id === "rs_breadth" ? 0 : 2) : "—"}</td>
                    <td className="r text-xs text-muted">{r.score === null ? "n/a" : `score ${r.score.toFixed(0)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 space-y-1 text-sm">
            <p>
              <span className="font-semibold">Breadth thrust:</span> {s.breadth.thrust.text}
            </p>
            <p>
              <span className="font-semibold">{s.breadth.divergence.label}:</span> {s.breadth.divergence.text}
            </p>
          </div>
        </Panel>
        <Panel title={`FII / DII flows · Institutional Flow Score ${s.subScores.institutionalFlow?.toFixed(0) ?? "n/a"} (${s.flows.label})`}>
          <table className="data">
            <thead>
              <tr>
                <th />
                <th className="r">Daily</th>
                <th className="r">5-day</th>
                <th className="r">1-month</th>
                <th className="r">3-month</th>
                <th className="r">6-month</th>
              </tr>
            </thead>
            <tbody>
              {(["fii", "dii"] as const).map((k) => (
                <tr key={k}>
                  <td>{k === "fii" ? "FII / FPI cash" : "DII cash"}</td>
                  <td className="r">{fmtCr(s.flows[k].d1)}</td>
                  <td className="r">{fmtCr(s.flows[k].d5)}</td>
                  <td className="r">{fmtCr(s.flows[k].m1)}</td>
                  <td className="r">{fmtCr(s.flows[k].m3)}</td>
                  <td className="r">{fmtCr(s.flows[k].m6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-ink-2">FII index futures long ratio</dt>
            <dd className="num text-right">{s.flows.futLongRatio === null ? "—" : `${s.flows.futLongRatio.toFixed(1)}%`}</dd>
            <dt className="text-ink-2">FII index options net OI</dt>
            <dd className="num text-right">{byId.fii_opt_net?.available ? fmtNum(byId.fii_opt_net.value, 0) : "—"}</dd>
            <dt className="text-ink-2">FPI debt flow (1M)</dt>
            <dd className="num text-right">{fmtCr(s.flows.debt1m)}</dd>
          </dl>
          <ul className="mt-3 space-y-1 text-sm text-ink-2">
            {s.flows.detections.length ? s.flows.detections.map((d) => <li key={d}>· {d}</li>) : <li className="text-muted">No FII/DII vs NIFTY divergences detected.</li>}
          </ul>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Volatility in context">
          <p className="text-sm">{s.volatility.text}</p>
        </Panel>
        <Panel title="INR in context">
          <p className="text-sm">{s.currency.text}</p>
        </Panel>
        <Panel title="Bonds in context">
          <p className="text-sm">{s.bonds.text}</p>
        </Panel>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["India Liquidity Score", s.subScores.liquidity, "Higher = easier liquidity."],
            ["Credit Stress Score", s.subScores.creditStress, "Higher = more credit stress (100 − credit factor)."],
            ["Global Risk Appetite Score", s.subScores.globalRisk, "Higher = more supportive global risk appetite."],
            ["Retail Speculation Score", s.subScores.retailSpeculation, "Higher = more retail/IPO speculative activity."],
          ] as const
        ).map(([t, v, note]) => (
          <div key={t} className="panel p-4">
            <div className="panel-title">{t}</div>
            <div className="num mt-1 text-3xl font-semibold">{v === null ? "—" : v.toFixed(0)}</div>
            <div className="text-[11px] text-muted">{note}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
