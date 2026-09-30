"use client";
import { useMemo, useState } from "react";
import type { ChainAnalysis, SideRow, StrikeRow } from "../lib/engine/options";
import { buttonVariants } from "@/platform/ui/primitives/button";
import { tableClass } from "@/platform/ui/patterns/content";

type Heat = "none" | "oi" | "premium" | "iv" | "volume";
type SortKey = "strike" | "cOi" | "cDoi" | "cPrem" | "cIv" | "pIv" | "pPrem" | "pDoi" | "pOi";

const nf = (x: number | null | undefined, dp = 0) => (x === null || x === undefined ? "—" : x.toLocaleString("en-IN", { maximumFractionDigits: dp, minimumFractionDigits: dp }));
const cr = (x: number) => nf(x / 1e7, 2);

function heatValue(s: SideRow | null, h: Heat): number {
  if (!s) return 0;
  return h === "oi" ? s.oi : h === "premium" ? s.premium : h === "iv" ? (s.iv ?? 0) : h === "volume" ? s.volume : 0;
}

export function ChainTable({ analysis }: { analysis: ChainAnalysis }) {
  const [heat, setHeat] = useState<Heat>("oi");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "strike", desc: false });
  const { rows, highlights: hl, atmStrike, spot } = analysis;

  const max = useMemo(() => {
    const m = { call: 0, put: 0 };
    for (const r of rows) {
      m.call = Math.max(m.call, heatValue(r.call, heat));
      m.put = Math.max(m.put, heatValue(r.put, heat));
    }
    return m;
  }, [rows, heat]);

  const sorted = useMemo(() => {
    const v = (r: StrikeRow): number => {
      switch (sort.key) {
        case "strike": return r.strike;
        case "cOi": return r.call?.oi ?? -Infinity;
        case "cDoi": return r.call?.changeInOi ?? -Infinity;
        case "cPrem": return r.call?.premium ?? -Infinity;
        case "cIv": return r.call?.iv ?? -Infinity;
        case "pIv": return r.put?.iv ?? -Infinity;
        case "pPrem": return r.put?.premium ?? -Infinity;
        case "pDoi": return r.put?.changeInOi ?? -Infinity;
        case "pOi": return r.put?.oi ?? -Infinity;
      }
    };
    return [...rows].sort((a, b) => (sort.desc ? v(b) - v(a) : v(a) - v(b)));
  }, [rows, sort]);

  const th = (key: SortKey, label: string, cls = "r") => (
    <th className={`${cls} cursor-pointer select-none`} onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "strike" }))} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
      {label}
      {sort.key === key ? (sort.desc ? " ↓" : " ↑") : ""}
    </th>
  );
  const bg = (s: SideRow | null, side: "call" | "put") => {
    if (heat === "none" || !s) return undefined;
    const m = side === "call" ? max.call : max.put;
    const a = m > 0 ? heatValue(s, heat) / m : 0;
    return { background: `color-mix(in srgb, ${side === "call" ? "var(--series-2)" : "var(--accent)"} ${Math.round(a * 45)}%, transparent)` };
  };
  const mark = (on: boolean) => (on ? "font-semibold underline decoration-dotted underline-offset-2" : "");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Heatmap:</span>
        {(["none", "oi", "premium", "iv", "volume"] as const).map((h) => (
          <button key={h} className={buttonVariants({ size: "sm" })} aria-pressed={heat === h} onClick={() => setHeat(h)}>
            {h === "none" ? "Off" : h === "oi" ? "OI" : h === "iv" ? "IV" : h[0].toUpperCase() + h.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-muted">Click a header to sort · underlined = largest in chain · hover a cell for the likely activity</span>
      </div>
      <div className="max-h-[640px] overflow-auto">
        <table className={tableClass}>
          <thead className="sticky top-0 bg-surface">
            <tr>
              {th("strike", "Strike", "")}
              {th("cOi", "Call OI")}
              {th("cDoi", "Call ΔOI")}
              {th("cPrem", "Call prem ₹Cr")}
              {th("cIv", "Call IV")}
              <th className="r">Spot</th>
              {th("pIv", "Put IV")}
              {th("pPrem", "Put prem ₹Cr")}
              {th("pDoi", "Put ΔOI")}
              {th("pOi", "Put OI")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const c = r.call;
              const p = r.put;
              const atm = r.strike === atmStrike;
              return (
                <tr key={r.strike} style={atm ? { outline: "1px solid var(--accent)" } : undefined}>
                  <td className={`tabular-nums ${atm ? "font-semibold" : ""}`}>{r.strike}</td>
                  <td className={`r ${mark(hl.maxCallOi === r.strike)}`} style={bg(c, "call")} title={c?.activityText}>{nf(c?.oi)}</td>
                  <td className={`r ${mark(hl.maxOiAdd?.strike === r.strike && hl.maxOiAdd.type === "CE")}`} style={bg(c, "call")} title={c?.activityText}>{c ? (c.changeInOi >= 0 ? "+" : "") + nf(c.changeInOi) : "—"}</td>
                  <td className={`r ${mark(hl.maxPremium?.strike === r.strike && hl.maxPremium.type === "CE")}`} style={bg(c, "call")} title={c ? `volume ${nf(c.volume)} · ${c.activityText}` : undefined}>{c ? cr(c.premium) : "—"}</td>
                  <td className={`r ${mark(hl.maxVolume?.strike === r.strike && hl.maxVolume.type === "CE")}`} style={bg(c, "call")} title={c ? `volume ${nf(c.volume)}` : undefined}>{nf(c?.iv, 1)}</td>
                  <td className="r text-xs text-muted">{atm ? `◆ ${nf(spot, 1)}` : ""}</td>
                  <td className={`r ${mark(hl.maxVolume?.strike === r.strike && hl.maxVolume.type === "PE")}`} style={bg(p, "put")} title={p ? `volume ${nf(p.volume)}` : undefined}>{nf(p?.iv, 1)}</td>
                  <td className={`r ${mark(hl.maxPremium?.strike === r.strike && hl.maxPremium.type === "PE")}`} style={bg(p, "put")} title={p ? `volume ${nf(p.volume)} · ${p.activityText}` : undefined}>{p ? cr(p.premium) : "—"}</td>
                  <td className={`r ${mark(hl.maxOiAdd?.strike === r.strike && hl.maxOiAdd.type === "PE")}`} style={bg(p, "put")} title={p?.activityText}>{p ? (p.changeInOi >= 0 ? "+" : "") + nf(p.changeInOi) : "—"}</td>
                  <td className={`r ${mark(hl.maxPutOi === r.strike)}`} style={bg(p, "put")} title={p?.activityText}>{nf(p?.oi)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted">
        <span>
          <span className="inline-block h-2 w-3 align-middle" style={{ background: "color-mix(in srgb, var(--series-2) 45%, transparent)" }} /> calls
        </span>
        <span>
          <span className="inline-block h-2 w-3 align-middle" style={{ background: "color-mix(in srgb, var(--accent) 45%, transparent)" }} /> puts
        </span>
        <span>Darker = larger {heat === "none" ? "value" : heat === "oi" ? "open interest" : heat} on that side. ATM row outlined.</span>
      </div>
    </div>
  );
}
