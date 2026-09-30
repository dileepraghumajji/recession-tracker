import { getSnapshot } from "@/dashboards/recession/lib/data/service";
import { modelOverridesFromCookie } from "@/dashboards/recession/lib/server-config";
import { fmtNum, fmtSigned } from "@/dashboards/recession/lib/format";
import { IndicatorLink, PageHeader, Panel } from "@/dashboards/recession/components/ui";
import { CurveChart } from "@/dashboards/recession/components/charts/CurveChart";
import { IndicatorChart } from "@/dashboards/recession/components/charts/IndicatorChart";

export const dynamic = "force-dynamic";

export default async function RatesPage() {
  const snap = await getSnapshot(await modelOverridesFromCookie());
  const { rates } = snap;
  const by = Object.fromEntries(snap.indicators.map((r) => [r.id, r]));
  const L = rates.levels;
  const tenors = [
    ["3M", "ust3m"],
    ["2Y", "ust2y"],
    ["5Y", "ust5y"],
    ["10Y", "ust10y"],
    ["30Y", "ust30y"],
  ] as const;
  const curveRows = tenors.map(([tenor, id]) => {
    const r = by[id];
    const now = r?.available ? (r.latest?.value ?? null) : null;
    return {
      tenor,
      now,
      m3: now !== null && r.changes.m3 !== null ? now - r.changes.m3 : null,
      m12: now !== null && r.changes.m12 !== null ? now - r.changes.m12 : null,
    };
  });
  const card: [string, string, number | null, string?][] = [
    ["30Y yield", "ust30y", L.y30],
    ["10Y yield", "ust10y", L.y10],
    ["2Y yield", "ust2y", L.y2],
    ["10Y–2Y", "spread_10y2y", L.s10y2y, "signed"],
    ["10Y–3M", "spread_10y3m", L.s10y3m, "signed"],
    ["10Y real yield (TIPS)", "real10y", L.real10],
    ["10Y inflation expectations (breakeven)", "be10y", L.be10],
    ["10Y term premium (Kim-Wright)", "termpremium", L.tp10],
  ];
  const bps = (x: number | null) => (x === null ? "n/a" : `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(x).toFixed(0)} bps`);
  const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(0)}%`);
  return (
    <div className="space-y-5">
      <PageHeader
        title="30Y Treasury Stress"
        subtitle="High long-term yields are not inherently recessionary. This module determines whether the move is being driven primarily by growth expectations, inflation expectations, fiscal risk or term premium."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Levels">
          {card.map(([label, id, v, mode]) => (
            <div key={id} className="flex justify-between border-b border-line py-1.5 text-sm last:border-0">
              <IndicatorLink id={id}>{label}</IndicatorLink>
              <span className="num font-mono">{v === null ? "n/a" : mode === "signed" ? `${fmtSigned(v, 2)}%` : `${fmtNum(v, 2)}%`}</span>
            </div>
          ))}
          <div className="flex justify-between py-1.5 text-sm">
            <span>30Y historical percentile</span>
            <span className="num font-mono">{fmtNum(rates.percentile30y, 0)}</span>
          </div>
        </Panel>
        <Panel title="What is driving the long end? (3-month decomposition)" className="lg:col-span-2">
          <div className="font-mono text-lg font-semibold">{rates.driverLabel.toUpperCase()}</div>
          <div className="mt-1 text-sm text-ink-2">Curve move: {rates.curveMove}{rates.easingPriced ? " · markets pricing easing (2Y < 3M)" : ""}</div>
          <table className="data mt-3">
            <thead>
              <tr>
                <th>Component (3M change)</th>
                <th className="r">Change</th>
                <th className="r">Share of 10Y move</th>
                <th>Reading</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>10Y nominal yield</td>
                <td className="r">{bps(rates.changesBps.y10)}</td>
                <td className="r">100%</td>
                <td className="text-xs text-ink-2">= real yield + breakeven inflation</td>
              </tr>
              <tr>
                <td>· 10Y real yield (TIPS)</td>
                <td className="r">{bps(rates.changesBps.real10)}</td>
                <td className="r">{pct(rates.shares.real)}</td>
                <td className="text-xs text-ink-2">Growth expectations, policy path, term premium</td>
              </tr>
              <tr>
                <td>· 10Y breakeven inflation</td>
                <td className="r">{bps(rates.changesBps.be10)}</td>
                <td className="r">{pct(rates.shares.breakeven)}</td>
                <td className="text-xs text-ink-2">Inflation expectations (+ inflation risk premium)</td>
              </tr>
              <tr>
                <td>10Y term premium (model)</td>
                <td className="r">{bps(rates.changesBps.tp10)}</td>
                <td className="r">{pct(rates.shares.termPremium)}</td>
                <td className="text-xs text-ink-2">Fiscal / supply / uncertainty compensation</td>
              </tr>
              <tr>
                <td>Expected short-rate path (10Y − TP)</td>
                <td className="r">{bps(rates.changesBps.expectedPath10)}</td>
                <td className="r">—</td>
                <td className="text-xs text-ink-2">Market-implied average policy rate</td>
              </tr>
              <tr>
                <td>2Y yield</td>
                <td className="r">{bps(rates.changesBps.y2)}</td>
                <td className="r">—</td>
                <td className="text-xs text-ink-2">Near-term policy expectations</td>
              </tr>
              <tr>
                <td>3M bill</td>
                <td className="r">{bps(rates.changesBps.y3m)}</td>
                <td className="r">—</td>
                <td className="text-xs text-ink-2">Current policy</td>
              </tr>
              <tr>
                <td>30Y yield</td>
                <td className="r">{bps(rates.changesBps.y30)}</td>
                <td className="r">—</td>
                <td />
              </tr>
            </tbody>
          </table>
          <div className="mt-3 space-y-1 text-sm">
            {rates.interpretation.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted">{rates.caveat}</p>
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Yield curve: today vs 3 and 12 months ago">
          <CurveChart rows={curveRows} />
        </Panel>
        <Panel title="How to read long-end moves">
          <ul className="prose-sm text-sm text-ink-2">
            <li>
              <strong className="text-ink">Long yields ↑ via breakevens</strong> — rising inflation expectations. Feeds Inflation Stress, not Recession Stress.
            </li>
            <li>
              <strong className="text-ink">Long yields ↑ via term premium</strong> (real yields up, expected path flat) — fiscal/supply or uncertainty compensation. Tightens
              conditions; not by itself a recession signal.
            </li>
            <li>
              <strong className="text-ink">Long yields ↑ with 2Y ↑</strong> — stronger growth / tighter expected policy (real yields).
            </li>
            <li>
              <strong className="text-ink">Long yields ↓ led by the short end</strong> (bull steepening, 2Y below 3M) — markets expect easing, often because of growth
              fears. Check credit spreads and labour data for confirmation.
            </li>
            <li>
              <strong className="text-ink">Long yields ↓ via breakevens</strong> — falling inflation expectations (disinflation or demand shock).
            </li>
          </ul>
        </Panel>
      </div>
      <Panel title="30Y Treasury yield">
        <IndicatorChart id="ust30y" decimals={2} />
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="10Y–3M spread">
          <IndicatorChart id="spread_10y3m" refLines={[{ y: 0, label: "Inversion" }]} />
        </Panel>
        <Panel title="10Y term premium (Kim-Wright)">
          <IndicatorChart id="termpremium" />
        </Panel>
      </div>
    </div>
  );
}
