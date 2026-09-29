/**
 * Signal confluence: how many independent recession-warning categories are
 * simultaneously showing stress. This is a breadth count, NOT a probability.
 */
import type { ModelConfig } from "../model-config";
import type { CompositeScore, Signal } from "../types";
import { signalFor } from "./analyze";

export interface ConfluenceGroupDef {
  id: string;
  label: string;
  category: string;
  clusters?: string[];
}

export const CONFLUENCE_GROUPS: ConfluenceGroupDef[] = [
  { id: "labor", label: "Labor", category: "growth_labor", clusters: ["unemployment", "claims", "payrolls", "labor_demand"] },
  { id: "manufacturing", label: "Manufacturing / Activity", category: "growth_labor", clusters: ["surveys", "activity"] },
  { id: "credit", label: "Credit", category: "credit_financial" },
  { id: "housing", label: "Housing", category: "housing" },
  { id: "curve", label: "Yield curve", category: "curve_rates" },
  { id: "consumer", label: "Consumer", category: "consumer" },
  { id: "equities", label: "Equities", category: "equity" },
];

export interface ConfluenceGroup {
  id: string;
  label: string;
  score: number | null;
  signal: Signal;
  /** Change in group score vs ~3 months earlier (null if unknown). */
  change3m: number | null;
  deteriorating: boolean;
}

export interface Confluence {
  groups: ConfluenceGroup[];
  total: number;
  withData: number;
  stressed: number; // watch or worse
  elevatedOrWorse: number;
  deteriorating: number;
}

export function groupScores(recession: CompositeScore): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const g of CONFLUENCE_GROUPS) {
    const cat = recession.categories.find((c) => c.id === g.category);
    if (!cat) {
      out[g.id] = null;
      continue;
    }
    const cls = cat.clusters.filter((c) => (!g.clusters || g.clusters.includes(c.id)) && c.score !== null);
    const w = cls.reduce((a, c) => a + c.weight, 0);
    out[g.id] = w > 0 ? cls.reduce((a, c) => a + c.weight * (c.score as number), 0) / w : null;
  }
  return out;
}

export function computeConfluence(
  recession: CompositeScore,
  past3m: Record<string, number | null> | null,
  cfg: ModelConfig,
): Confluence {
  const now = groupScores(recession);
  const groups: ConfluenceGroup[] = CONFLUENCE_GROUPS.map((g) => {
    const score = now[g.id];
    const prev = past3m?.[g.id] ?? null;
    const change3m = score !== null && prev !== null ? score - prev : null;
    return {
      id: g.id,
      label: g.label,
      score,
      signal: signalFor(score, cfg),
      change3m,
      deteriorating: change3m !== null && change3m > cfg.trendThreshold,
    };
  });
  return {
    groups,
    total: groups.length,
    withData: groups.filter((g) => g.score !== null).length,
    stressed: groups.filter((g) => g.signal === "watch" || g.signal === "elevated" || g.signal === "severe").length,
    elevatedOrWorse: groups.filter((g) => g.signal === "elevated" || g.signal === "severe").length,
    deteriorating: groups.filter((g) => g.deteriorating).length,
  };
}
