"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type W = Record<string, Record<string, number>>;
const COOKIE = "mrsm_model";

export function WeightsEditor({
  current,
  defaults,
  labels,
  overall,
  overallDefaults,
}: {
  current: W;
  defaults: W;
  labels: Record<string, { label: string; cats: { id: string; label: string }[] }>;
  overall: Record<string, number>;
  overallDefaults: Record<string, number>;
}) {
  const router = useRouter();
  const [w, setW] = useState<W>(current);
  const [o, setO] = useState<Record<string, number>>(overall);
  const [saved, setSaved] = useState<string | null>(null);

  const apply = (reset = false) => {
    if (reset) {
      document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`;
      setW(defaults);
      setO(overallDefaults);
    } else {
      const payload = encodeURIComponent(JSON.stringify({ categoryWeights: w, overall: o }));
      document.cookie = `${COOKIE}=${payload}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    }
    setSaved(reset ? "Reset to defaults." : "Saved. All pages now use these weights.");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        Category weights are relative (they are normalised to 100%). Changes apply to every page in this browser via a cookie; defaults are the initial,
        judgement-based weights (Recession: 30/25/15/10/10/5/5).
      </p>
      <div className="grid gap-4 lg:grid-cols-4">
        {Object.entries(labels).map(([sid, meta]) => {
          const total = Object.values(w[sid]).reduce((a, b) => a + b, 0) || 1;
          return (
            <div key={sid} className="rounded border border-line p-3">
              <h3 className="mb-2 text-sm font-semibold">{meta.label}</h3>
              {meta.cats.map((c) => (
                <label key={c.id} className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink-2">{c.label}</span>
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="input w-16 text-right"
                      value={w[sid][c.id]}
                      onChange={(e) => setW({ ...w, [sid]: { ...w[sid], [c.id]: Math.max(0, Number(e.target.value) || 0) } })}
                    />
                    <span className="num w-10 text-right text-xs text-muted">{((w[sid][c.id] / total) * 100).toFixed(0)}%</span>
                  </span>
                </label>
              ))}
            </div>
          );
        })}
        <div className="rounded border border-line p-3">
          <h3 className="mb-2 text-sm font-semibold">Overall Macro Stress mix</h3>
          {Object.keys(o).map((k) => (
            <label key={k} className="mb-1.5 flex items-center justify-between gap-2 text-sm">
              <span className="capitalize text-ink-2">{k}</span>
              <input type="number" min={0} max={100} className="input w-16 text-right" value={o[k]} onChange={(e) => setO({ ...o, [k]: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn" onClick={() => apply(false)}>
          Apply weights
        </button>
        <button className="btn" onClick={() => apply(true)}>
          Reset to defaults
        </button>
        {saved && <span className="text-xs text-muted">{saved}</span>}
      </div>
    </div>
  );
}
