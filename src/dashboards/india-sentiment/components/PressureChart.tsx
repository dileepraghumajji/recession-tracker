"use client";
import { useEffect, useState } from "react";
import { API } from "../routes";
import { PairChart, type PairPoint } from "./PairChart";
import { buttonVariants } from "@/platform/ui/primitives/button";

const FRAMES = [
  ["5m", 5],
  ["15m", 15],
  ["30m", 30],
  ["1h", 60],
  ["Daily", 0],
] as const;

/** Net option premium pressure against the underlying, intraday buckets or daily history. */
export function PressureChart({ underlying }: { underlying: string }) {
  const [frame, setFrame] = useState<number>(15);
  const [data, setData] = useState<{ top: PairPoint[]; bottom: PairPoint[]; intraday: boolean; label: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setErr(null);
    const url = frame ? `${API}/intraday?u=${encodeURIComponent(underlying)}&m=${frame}` : `${API}/chart?metric=pressure&period=3M`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (!alive) return;
        if (frame)
          setData({
            top: j.points.map((p: { ts: string; spot: number }) => ({ date: p.ts, value: p.spot })),
            bottom: j.points.map((p: { ts: string; pressure: number }) => ({ date: p.ts, value: p.pressure / 1e7 })),
            intraday: true,
            label: `Net premium pressure per ${frame >= 60 ? "hour" : `${frame} min`} (₹ Cr, bullish +)`,
          });
        else setData({ top: j.top.points, bottom: j.bottom.points, intraday: false, label: "Daily net premium pressure, NIFTY current expiry (-1..1, bullish +)" });
      })
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, [frame, underlying]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Timeframe">
        {FRAMES.map(([l, m]) => (
          <button key={l} className={buttonVariants({ size: "sm" })} aria-pressed={frame === m} onClick={() => setFrame(m)}>
            {l}
          </button>
        ))}
        {!frame && underlying !== "NIFTY" && <span className="ml-2 text-xs text-muted">Daily history shown for NIFTY.</span>}
      </div>
      {err && <p className="text-sm text-muted">Unavailable: {err}</p>}
      {data && (data.top.length || data.bottom.length ? <PairChart top={data.top} bottom={data.bottom} topLabel={data.intraday ? `${underlying} spot` : "NIFTY 50"} bottomLabel={data.label} bars intraday={data.intraday} /> : <p className="text-sm text-muted">No intraday snapshots stored for the latest session.</p>)}
    </div>
  );
}
