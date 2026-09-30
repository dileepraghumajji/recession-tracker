import { getHistorical } from "@/dashboards/recession/lib/data/service";
import { comparePeriods, KEY_INDICATORS } from "@/dashboards/recession/lib/engine/historical";
import { modelOverridesFromCookie } from "@/dashboards/recession/lib/server-config";
import { INDICATOR_BY_ID } from "@/dashboards/recession/lib/indicators";
import { fmtNum, fmtValue } from "@/dashboards/recession/lib/format";
import { PageHeader, Panel } from "@/dashboards/recession/components/ui";
import { DemoNotice } from "@/dashboards/recession/components/DemoNotice";
import { tableClass, proseClass } from "@/platform/ui/patterns/content";
import { cn } from "@/platform/ui/cn";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const { records } = await getHistorical(await modelOverridesFromCookie());
  const cmp = comparePeriods(records);
  const cols = [cmp.current, ...cmp.periods];
  const scoreRows: [string, (p: (typeof cols)[number]) => number | null][] = [
    ["Recession Stress", (p) => p.scores.recession],
    ["Inflation Stress", (p) => p.scores.inflation],
    ["Financial Market Stress", (p) => p.scores.financial],
    ["Overall Macro Stress", (p) => p.scores.overall],
  ];
  return (
    <div className="space-y-5">
      <PageHeader
        title="Historical comparison"
        description="Today's conditions (average of the last 3 months) versus five fixed reference periods, using the same point-in-time methodology. All periods are always shown; the goal is to see similarities and differences, not to declare that today 'is' any past episode."
      />
      <DemoNotice what="comparison" />
      <Panel title="Stress profile by period (period averages)">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Dimension</th>
                {cols.map((c) => (
                  <th key={c.id} className="r" title={c.label}>
                    {c.label.split(" (")[0]}
                    <div className="font-normal normal-case text-muted">
                      {c.start.slice(0, 7)} → {c.end.slice(0, 7)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scoreRows.map(([label, get]) => (
                <tr key={label}>
                  <td className="whitespace-nowrap font-medium">{label}</td>
                  {cols.map((c) => (
                    <td key={c.id} className="r">
                      {fmtNum(get(c), 0)}
                    </td>
                  ))}
                </tr>
              ))}
              {cmp.dimensions
                .filter((d) => !["inflation", "financial"].includes(d.id))
                .map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap text-ink-2">{d.label}</td>
                    {cols.map((c) => (
                      <td key={c.id} className="r text-ink-2">
                        {fmtNum(c.groups[d.id], 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              <tr>
                <td className="text-muted">Model coverage</td>
                {cols.map((c) => (
                  <td key={c.id} className="r text-muted">
                    {c.coverage === null ? "—" : `${(c.coverage * 100).toFixed(0)}%`}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="text-muted">Distance from today</td>
                <td className="r text-muted">—</td>
                {cmp.periods.map((p) => (
                  <td key={p.id} className="r text-muted">
                    {fmtNum(p.distance, 0)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted">{cmp.note}</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {cmp.periods.map((p) => (
          <Panel key={p.id} title={p.label} right={<span className="text-xs text-muted">distance {fmtNum(p.distance, 0)}</span>}>
            <h3 className="text-xs font-semibold uppercase text-muted">Similar (within 10 pts)</h3>
            <ul className={cn(proseClass, "text-sm")}>{p.similarities.length ? p.similarities.map((s) => <li key={s}>{s}</li>) : <li className="text-muted">None</li>}</ul>
            <h3 className="mt-2 text-xs font-semibold uppercase text-muted">Different</h3>
            <ul className={cn(proseClass, "text-sm text-ink-2")}>{p.differences.length ? p.differences.map((s) => <li key={s}>{s}</li>) : <li className="text-muted">None</li>}</ul>
          </Panel>
        ))}
      </div>

      <Panel title="Key indicators (period averages)">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Indicator</th>
                {cols.map((c) => (
                  <th key={c.id} className="r">
                    {c.label.split(" (")[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {KEY_INDICATORS.map((k) => {
                const def = INDICATOR_BY_ID[k];
                return (
                  <tr key={k}>
                    <td>{def.name}</td>
                    {cols.map((c) => (
                      <td key={c.id} className="r">
                        {fmtValue({ id: k, units: def.units }, c.indicators[k])}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          “—” means the series did not exist yet or was unavailable in that period (e.g. FRED&apos;s ICE credit spreads cover only recent years; the Baa spread is the
          long-history credit proxy).
        </p>
      </Panel>
    </div>
  );
}
