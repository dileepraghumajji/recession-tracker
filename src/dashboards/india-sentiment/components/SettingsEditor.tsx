"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const COOKIE = "ims_model";

export interface EditableConfig {
  factorWeights: Record<string, number>;
  thresholds: number[];
  maxFactorShare: number;
  strikeWindow: number;
  oiPcrBullish: number;
  oiPcrBearish: number;
  premiumPcrBearish: number;
  premiumPcrBullish: number;
  changeExplainThreshold: number;
  divergenceMovePct: number;
}

const BAND_NAMES = ["Extreme Fear | Fear", "Fear | Mild Fear", "Mild Fear | Neutral", "Neutral | Mild Greed", "Mild Greed | Greed", "Greed | Extreme Greed"];

export function SettingsEditor({ current, defaults, labels }: { current: EditableConfig; defaults: EditableConfig; labels: Record<string, string> }) {
  const router = useRouter();
  const [c, setC] = useState<EditableConfig>(current);
  const [msg, setMsg] = useState<string | null>(null);
  const total = Object.values(c.factorWeights).reduce((a, b) => a + b, 0);
  const num = (k: keyof EditableConfig, label: string, step = 0.05, hint?: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <input className="input w-28" type="number" step={step} value={c[k] as number} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} />
      {hint && <span className="text-[10px] text-muted">{hint}</span>}
    </label>
  );
  const save = (reset = false) => {
    if (reset) {
      document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`;
      setC(defaults);
      setMsg("Reset to defaults.");
    } else {
      const sorted = [...c.thresholds].sort((a, b) => a - b);
      const payload = encodeURIComponent(JSON.stringify({ ...c, thresholds: sorted }));
      document.cookie = `${COOKIE}=${payload}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      setMsg("Saved. Every page of this dashboard now uses these settings in this browser.");
    }
    router.refresh();
  };
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Factor weights</h3>
          <span className="num text-xs text-muted">total {total} — used as relative weights (renormalised), each factor capped at {(c.maxFactorShare * 100).toFixed(0)}% of the score</span>
        </div>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(c.factorWeights).map(([id, w]) => (
            <label key={id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink-2">{labels[id]}</span>
              <input className="input w-20" type="number" min={0} max={100} step={1} value={w} onChange={(e) => setC({ ...c, factorWeights: { ...c.factorWeights, [id]: Math.max(0, Number(e.target.value)) } })} />
            </label>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Band thresholds (0–100)</h3>
        <div className="flex flex-wrap gap-3">
          {c.thresholds.map((t, i) => (
            <label key={i} className="flex flex-col gap-1">
              <span className="text-[10px] text-muted">{BAND_NAMES[i]}</span>
              <input
                className="input w-20"
                type="number"
                min={0}
                max={100}
                value={t}
                onChange={(e) => {
                  const next = [...c.thresholds];
                  next[i] = Number(e.target.value);
                  setC({ ...c, thresholds: next });
                }}
              />
            </label>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Model & option analysis</h3>
        <div className="flex flex-wrap gap-4">
          {num("maxFactorShare", "Max single-factor share", 0.01, "0.05–1")}
          {num("strikeWindow", "Strike window (±strikes, 0 = all)", 1)}
          {num("oiPcrBullish", "OI PCR bullish ≥", 0.05)}
          {num("oiPcrBearish", "OI PCR bearish ≤", 0.05)}
          {num("premiumPcrBearish", "Premium PCR bearish ≥", 0.05)}
          {num("premiumPcrBullish", "Premium PCR bullish ≤", 0.05)}
          {num("changeExplainThreshold", "Explain changes ≥ (pts)", 1)}
          {num("divergenceMovePct", "Divergence move ≥ (%)", 0.5)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn" onClick={() => save(false)}>
          Save settings
        </button>
        <button className="btn" onClick={() => save(true)}>
          Reset to defaults
        </button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
    </div>
  );
}
