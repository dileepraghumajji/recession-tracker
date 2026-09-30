import type { ModelConfig } from "../model-config";
import type { Obs } from "../types";
import { stressAt, type PreparedIndicator } from "./analyze";

/** Point-in-time stress history, sampled to at most `maxPoints` (each point uses only data up to that date). */
export function stressSeries(p: PreparedIndicator, cfg: ModelConfig, from: string, maxPoints: number): Obs[] {
  if (!p.def.stress || !p.stressMetric.length) return [];
  const idx: number[] = [];
  for (let i = 0; i < p.stressMetric.length; i++) if (p.stressMetric[i].date >= from) idx.push(i);
  const step = Math.max(1, Math.ceil(idx.length / maxPoints));
  const out: Obs[] = [];
  for (let k = 0; k < idx.length; k += step) {
    const i = idx[k];
    const s = stressAt(p, p.stressMetric.slice(0, i + 1), cfg);
    if (s !== null) out.push({ date: p.stressMetric[i].date, value: s });
  }
  const lastI = idx[idx.length - 1];
  if (lastI !== undefined && out[out.length - 1]?.date !== p.stressMetric[lastI].date) {
    const s = stressAt(p, p.stressMetric.slice(0, lastI + 1), cfg);
    if (s !== null) out.push({ date: p.stressMetric[lastI].date, value: s });
  }
  return out;
}
