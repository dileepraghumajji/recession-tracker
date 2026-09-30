import Link from "next/link";
import { resolveConfig } from "@/dashboards/india-sentiment/lib/config";
import { getChainView, getSnapshot } from "@/dashboards/india-sentiment/lib/data/service";
import { ACTIVITY_LABEL, pcrDivergence, type Activity } from "@/dashboards/india-sentiment/lib/engine/options";
import { zone } from "@/dashboards/india-sentiment/lib/engine/snapshot";
import { fmtNum, fmtRupeesCr, fmtSigned } from "@/dashboards/india-sentiment/lib/format";
import { configOverridesFromCookie } from "@/dashboards/india-sentiment/lib/server-config";
import { ChainTable } from "@/dashboards/india-sentiment/components/ChainTable";
import { PressureChart } from "@/dashboards/india-sentiment/components/PressureChart";
import { PageHeader, Panel } from "@/dashboards/india-sentiment/components/ui";
import { BASE } from "@/dashboards/india-sentiment/routes";

export const dynamic = "force-dynamic";

const WINDOWS = [5, 10, 15, 25, 0];

export default async function OptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const overrides = await configOverridesFromCookie();
  const cfg = resolveConfig(overrides);
  const w = WINDOWS.includes(Number(q.window)) ? Number(q.window) : cfg.strikeWindow;
  const u = (q.u ?? "NIFTY").toUpperCase().replace(/[^A-Z0-9&-]/g, "");
  const expiry = /^\d{4}-\d{2}-\d{2}$/.test(q.expiry ?? "") ? q.expiry! : null;
  const [view, snap] = await Promise.all([getChainView(u, expiry, w, cfg), getSnapshot(overrides)]);
  const a = view.analysis;
  const ov = snap.options.find((o) => o.underlying === view.underlying);
  const href = (p: Record<string, string | number>) => {
    const s = new URLSearchParams({ u: view.underlying, ...(a ? { expiry: a.expiry } : {}), window: String(w), ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) });
    return `${BASE}/options?${s}`;
  };
  const pcr = a ? pcrDivergence(a.totals.oiPcr, a.totals.premiumPcr, cfg) : null;
  const acts: Activity[] = ["fresh_buying", "writing", "short_covering", "long_unwinding", "indeterminate"];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Option chain analysis"
        subtitle="Open interest, premium traded, IV and likely positioning by strike. Buying/writing labels are probabilistic; OI concentrations are potential (not guaranteed) support/resistance; Max Pain is theoretical."
      />
      {!a ? (
        <Panel>
          <p className="text-sm text-muted">
            No option-chain data stored. Push full chains (every strike and expiry) via <code>POST /api/india-sentiment/ingest</code> or connect a licensed provider — see{" "}
            <Link className="link" href={`${BASE}/settings`}>
              Settings &amp; Sources
            </Link>
            .
          </p>
        </Panel>
      ) : (
        <>
          <section className="panel flex flex-wrap items-center gap-x-5 gap-y-2 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted">Underlying</span>
              {view.underlyings.map((x) => (
                <Link key={x} className="btn" aria-pressed={x === view.underlying} href={`${BASE}/options?u=${x}&window=${w}`}>
                  {x}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted">Expiry</span>
              {view.expiries.map((e) => (
                <Link key={e.expiry} className="btn" aria-pressed={e.expiry === a.expiry} href={href({ expiry: e.expiry })} title={e.kinds.join(", ")}>
                  {e.expiry.slice(5)}
                  {e.kinds.length ? <span className="ml-1 text-[10px] opacity-70">{e.kinds.join("/")}</span> : null}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted">Strikes around ATM</span>
              {WINDOWS.map((x) => (
                <Link key={x} className="btn" aria-pressed={x === w} href={href({ window: x })}>
                  {x ? `±${x}` : "All"}
                </Link>
              ))}
            </div>
            <span className="ml-auto text-xs text-muted">
              Source: {view.source}
              {view.synthetic && view.source !== "SYNTHETIC" ? " (SYNTHETIC)" : ""} · {a.timestamp.replace("T", " ").slice(0, 16)}
              {a.timestamp.includes("+05:30") ? " IST" : ""}
            </span>
          </section>

          <section className="grid gap-4 lg:grid-cols-4">
            <Panel title="Premium traded">
              <dl className="grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-ink-2">Total call premium</dt>
                <dd className="num text-right">{fmtRupeesCr(a.totals.callPremium)}</dd>
                <dt className="text-ink-2">Total put premium</dt>
                <dd className="num text-right">{fmtRupeesCr(a.totals.putPremium)}</dd>
                <dt className="text-ink-2">Put/Call premium ratio</dt>
                <dd className="num text-right">{fmtNum(a.totals.premiumPcr, 2)}</dd>
                <dt className="text-ink-2">Call/Put premium ratio</dt>
                <dd className="num text-right">{fmtNum(a.totals.callPutPremiumRatio, 2)}</dd>
                <dt className="text-ink-2">Net put premium</dt>
                <dd className="num text-right">{fmtRupeesCr(a.totals.netPutPremium)}</dd>
                <dt className="text-ink-2">Net call premium</dt>
                <dd className="num text-right">{fmtRupeesCr(a.totals.netCallPremium)}</dd>
              </dl>
              <p className="mt-2 text-[11px] text-muted">Premium = LTP × volume × lot size. More put premium is not automatically bullish or bearish — read with price, OI change and IV.</p>
            </Panel>
            <Panel title="Open interest & PCR">
              <dl className="grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-ink-2">Call OI / ΔOI</dt>
                <dd className="num text-right">
                  {fmtNum(a.totals.callOi, 0)} / {fmtSigned(a.totals.callOiChange, 0)}
                </dd>
                <dt className="text-ink-2">Put OI / ΔOI</dt>
                <dd className="num text-right">
                  {fmtNum(a.totals.putOi, 0)} / {fmtSigned(a.totals.putOiChange, 0)}
                </dd>
                <dt className="text-ink-2">OI PCR</dt>
                <dd className="num text-right">{fmtNum(a.totals.oiPcr, 2)}</dd>
                <dt className="text-ink-2">Premium PCR</dt>
                <dd className="num text-right">{fmtNum(a.totals.premiumPcr, 2)}</dd>
                <dt className="text-ink-2">Volume PCR</dt>
                <dd className="num text-right">{fmtNum(a.totals.volumePcr, 2)}</dd>
              </dl>
              {pcr && <p className={`mt-2 text-xs ${pcr.divergent ? "font-semibold" : "text-ink-2"}`}>{pcr.text}</p>}
            </Panel>
            <Panel title="Max Pain & concentration">
              <dl className="grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-ink-2">Spot</dt>
                <dd className="num text-right">{fmtNum(a.spot, 2)}</dd>
                <dt className="text-ink-2">ATM strike</dt>
                <dd className="num text-right">{a.atmStrike}</dd>
                <dt className="text-ink-2">Max Pain</dt>
                <dd className="num text-right">{a.maxPain?.strike ?? "—"}</dd>
                <dt className="text-ink-2">Spot vs Max Pain</dt>
                <dd className="num text-right">{a.maxPain ? `${fmtSigned(a.maxPain.distance, 0)} (${fmtSigned(a.maxPain.distancePct, 2)}%)` : "—"}</dd>
                <dt className="text-ink-2">Potential support (put OI)</dt>
                <dd className="num text-right">{zone(a.zones.support)}</dd>
                <dt className="text-ink-2">Potential resistance (call OI)</dt>
                <dd className="num text-right">{zone(a.zones.resistance)}</dd>
              </dl>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-ink-2">
                <div>
                  <div className="text-muted">Largest call OI</div>
                  {a.zones.callOiTop.map((x) => (
                    <div key={x.strike} className="num">
                      {x.strike}: {fmtNum(x.oi, 0)}
                    </div>
                  ))}
                  <div className="mt-1 text-muted">Largest call OI adds</div>
                  {a.zones.callOiAdds.map((x) => (
                    <div key={x.strike} className="num">
                      {x.strike}: +{fmtNum(x.change, 0)}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-muted">Largest put OI</div>
                  {a.zones.putOiTop.map((x) => (
                    <div key={x.strike} className="num">
                      {x.strike}: {fmtNum(x.oi, 0)}
                    </div>
                  ))}
                  <div className="mt-1 text-muted">Largest put OI adds</div>
                  {a.zones.putOiAdds.map((x) => (
                    <div key={x.strike} className="num">
                      {x.strike}: +{fmtNum(x.change, 0)}
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
            <Panel title="IV & skew">
              <dl className="grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-ink-2">ATM IV</dt>
                <dd className="num text-right">{fmtNum(a.iv.atmIv, 2)}</dd>
                <dt className="text-ink-2">ATM call / put IV</dt>
                <dd className="num text-right">
                  {fmtNum(a.iv.atmCallIv, 1)} / {fmtNum(a.iv.atmPutIv, 1)}
                </dd>
                <dt className="text-ink-2">25Δ call IV</dt>
                <dd className="num text-right">{fmtNum(a.iv.call25dIv, 2)}</dd>
                <dt className="text-ink-2">25Δ put IV</dt>
                <dd className="num text-right">{fmtNum(a.iv.put25dIv, 2)}</dd>
                <dt className="text-ink-2">Skew (put − call)</dt>
                <dd className="num text-right">{fmtNum(a.iv.skew25d, 2)}</dd>
                <dt className="text-ink-2">Days to expiry</dt>
                <dd className="num text-right">{a.daysToExpiry}</dd>
              </dl>
              <p className="mt-2 text-[11px] text-muted">Skew changes over 1D/1W/1M: see the “NIFTY 25Δ IV skew” indicator on Factors &amp; Data.</p>
            </Panel>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Panel title={`Premium by moneyness (±${w || "all"} strikes, ATM = nearest ${cfg.atmBandSteps ? `±${cfg.atmBandSteps} strike` : "strike"})`}>
              <table className="data">
                <thead>
                  <tr>
                    <th />
                    <th className="r">ITM</th>
                    <th className="r">ATM</th>
                    <th className="r">OTM</th>
                  </tr>
                </thead>
                <tbody>
                  {(["call", "put"] as const).map((side) => (
                    <tr key={side}>
                      <td>{side === "call" ? "Calls" : "Puts"}</td>
                      {(["ITM", "ATM", "OTM"] as const).map((m) => (
                        <td key={m} className="r">
                          {fmtRupeesCr(a.moneyness[side][m])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-muted">Limiting the window to strikes near ATM stops far out-of-the-money contracts from distorting the read.</p>
            </Panel>
            <Panel title="Likely buying vs writing (premium, ₹ Cr)">
              <table className="data">
                <thead>
                  <tr>
                    <th>Evidence suggests / likely</th>
                    <th className="r">Calls</th>
                    <th className="r">Puts</th>
                  </tr>
                </thead>
                <tbody>
                  {acts.map((k) => (
                    <tr key={k}>
                      <td className="capitalize">{ACTIVITY_LABEL[k]}</td>
                      <td className="r">{fmtRupeesCr(a.activity[k].call)}</td>
                      <td className="r">{fmtRupeesCr(a.activity[k].put)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ink-2">
                Premium pressure: calls {fmtRupeesCr(a.pressure.call)}, puts {fmtRupeesCr(a.pressure.put)} → net {fmtRupeesCr(a.pressure.net)} ({fmtSigned(a.pressure.normalized, 2)} of premium, bullish +).
              </p>
              <p className="mt-1 text-[11px] text-muted">
                Price ↑ + OI ↑ → possible fresh buying · price ↓ + OI ↑ → possible writing · price ↑ + OI ↓ → possible short covering · price ↓ + OI ↓ → possible long unwinding. Volume and IV change adjust the strength of evidence. Trader intent is never certain.
              </p>
            </Panel>
          </section>

          <Panel title={`Option chain · ${view.underlying} ${a.expiry}`}>
            <ChainTable analysis={a} />
          </Panel>

          <Panel title="Net premium pressure vs underlying">
            <PressureChart underlying={view.underlying} />
          </Panel>

          {ov && (
            <Panel title="Expiry structure & positioning shift">
              <div className="overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Expiry</th>
                      <th>Type</th>
                      <th className="r">Days</th>
                      <th className="r">OI</th>
                      <th className="r">ΔOI</th>
                      <th className="r">Premium</th>
                      <th className="r">Prem. PCR</th>
                      <th className="r">OI PCR</th>
                      <th className="r">ATM IV</th>
                      <th className="r">Skew</th>
                      <th className="r">Max Pain</th>
                      <th className="r">Support / resistance</th>
                      <th className="r">Positioning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ov.expiries.map((e) => (
                      <tr key={e.expiry}>
                        <td className="num">{e.expiry}</td>
                        <td>{e.kinds.join(", ")}</td>
                        <td className="r">{e.daysToExpiry}</td>
                        <td className="r">{fmtNum(e.oi, 0)}</td>
                        <td className="r">{fmtSigned(e.oiChange, 0)}</td>
                        <td className="r">{fmtRupeesCr(e.premium)}</td>
                        <td className="r">{fmtNum(e.premiumPcr, 2)}</td>
                        <td className="r">{fmtNum(e.oiPcr, 2)}</td>
                        <td className="r">{fmtNum(e.atmIv, 1)}</td>
                        <td className="r">{fmtNum(e.skew25d, 1)}</td>
                        <td className="r">{e.maxPain ?? "—"}</td>
                        <td className="r">
                          {zone(e.support)} / {zone(e.resistance)}
                        </td>
                        <td className="r">{fmtNum(e.positioning, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm">
                <span className="font-semibold">Expiry positioning shift:</span> {ov.shift.text}
              </p>
              <p className="mt-1 text-[11px] text-muted">Positioning (0–100) blends OI PCR (conventional reading) with net premium pressure for each expiry, using ±{cfg.strikeWindow} strikes.</p>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
