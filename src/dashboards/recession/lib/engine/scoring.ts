/**
 * Composite scoring with factor-cluster pooling.
 *
 * score = sum_k W_k * S_k / sum_k W_k                (categories with data)
 * S_k   = sum_c w_c * C_c / sum_c w_c                (clusters with data)
 * C_c   = mean(stress_i for available i in cluster)  (pooled -> one slot per factor)
 *
 * Correlated indicators (e.g. CPI/core CPI/PCE/core PCE, or HY/CCC OAS) live in
 * the same cluster, so adding more of them does not increase their joint
 * weight. Missing clusters/categories are renormalised away and reported via
 * `coverage`; stale inputs reduce `freshness`. Neither is hidden.
 */
import type { ModelConfig } from "../model-config";
import type { CategoryResult, ClusterResult, CompositeScore, Contribution, IndicatorReading, ScoreId } from "../types";
import { signalFor, STATUS_FACTOR } from "./analyze";

export function computeComposite(scoreId: ScoreId, readings: IndicatorReading[], cfg: ModelConfig): CompositeScore {
  const scfg = cfg.scores[scoreId];
  const members = new Map<string, IndicatorReading[]>(); // key: category/cluster
  for (const r of readings) {
    for (const mm of r.memberships) {
      if (mm.score !== scoreId) continue;
      const key = `${mm.category}/${mm.cluster}`;
      if (!members.has(key)) members.set(key, []);
      members.get(key)!.push(r);
    }
  }

  const totalCatWeight = scfg.categories.reduce((a, c) => a + c.weight, 0) || 1;
  const categories: CategoryResult[] = [];
  // nominal weight per indicator if all data were available
  const nominal = new Map<string, number>();
  for (const cat of scfg.categories) {
    const totalClusterW = cat.clusters.reduce((a, c) => a + c.weight, 0) || 1;
    for (const cl of cat.clusters) {
      const ms = members.get(`${cat.id}/${cl.id}`) ?? [];
      for (const r of ms) nominal.set(r.id, (cat.weight / totalCatWeight) * (cl.weight / totalClusterW) * (1 / ms.length));
    }
  }

  for (const cat of scfg.categories) {
    const clusters: ClusterResult[] = cat.clusters.map((cl) => {
      const ms = members.get(`${cat.id}/${cl.id}`) ?? [];
      const avail = ms.filter((r) => r.available && r.stress !== null);
      const score = avail.length ? avail.reduce((a, r) => a + (r.stress as number), 0) / avail.length : null;
      return { id: cl.id, label: cl.label, weight: cl.weight, score, members: ms.map((r) => r.id), available: avail.map((r) => r.id) };
    });
    const withData = clusters.filter((c) => c.score !== null);
    const wsum = withData.reduce((a, c) => a + c.weight, 0);
    const totalW = clusters.reduce((a, c) => a + c.weight, 0) || 1;
    const score = wsum > 0 ? withData.reduce((a, c) => a + c.weight * (c.score as number), 0) / wsum : null;
    categories.push({
      id: cat.id,
      label: cat.label,
      nominalWeight: cat.weight / totalCatWeight,
      effectiveWeight: 0,
      score,
      signal: signalFor(score, cfg),
      clusters,
      coverage: wsum / totalW,
    });
  }

  const catWithData = categories.filter((c) => c.score !== null);
  const catWSum = catWithData.reduce((a, c) => a + c.nominalWeight, 0);
  for (const c of categories) c.effectiveWeight = c.score !== null && catWSum > 0 ? c.nominalWeight / catWSum : 0;
  const score = catWSum > 0 ? catWithData.reduce((a, c) => a + c.effectiveWeight * (c.score as number), 0) : null;

  const contributions: Contribution[] = [];
  for (const cat of categories) {
    const cfgCat = scfg.categories.find((x) => x.id === cat.id)!;
    const wsum = cat.clusters.filter((c) => c.score !== null).reduce((a, c) => a + c.weight, 0);
    for (const cl of cat.clusters) {
      const ms = members.get(`${cat.id}/${cl.id}`) ?? [];
      for (const r of ms) {
        const isAvail = cl.available.includes(r.id);
        const eff = isAvail && wsum > 0 ? cat.effectiveWeight * (cl.weight / wsum) * (1 / cl.available.length) : 0;
        contributions.push({
          indicatorId: r.id,
          name: r.name,
          category: cfgCat.id,
          cluster: cl.id,
          effectiveWeight: eff,
          nominalWeight: nominal.get(r.id) ?? 0,
          stress: r.stress,
          points: eff * (r.stress ?? 0),
          signal: r.signal,
          status: r.status,
        });
      }
    }
  }

  // Coverage: share of nominal weight with usable data. Freshness: nominal
  // weight x status factor, over indicators whose source is configured.
  let covered = 0;
  let totalNominal = 0;
  let freshNum = 0;
  let freshDen = 0;
  for (const c of contributions) {
    totalNominal += c.nominalWeight;
    if (c.effectiveWeight > 0) covered += c.nominalWeight;
    const r = readings.find((x) => x.id === c.indicatorId)!;
    const configured = !(r.unavailableReason ?? "").match(/proprietary|not configured|not loaded/i);
    if (configured) {
      freshDen += c.nominalWeight;
      freshNum += c.nominalWeight * STATUS_FACTOR[c.status];
    }
  }
  const coverage = totalNominal > 0 ? covered / totalNominal : 0;
  const freshness = freshDen > 0 ? freshNum / freshDen : 0;
  contributions.sort((a, b) => b.points - a.points);
  return {
    id: scoreId,
    label: scfg.label,
    score,
    signal: signalFor(score, cfg),
    categories,
    contributions,
    coverage,
    freshness,
    confidence: coverage * freshness,
  };
}

export function computeOverall(scores: Record<ScoreId, CompositeScore>, cfg: ModelConfig): CompositeScore {
  const parts = (Object.keys(cfg.overall) as ScoreId[]).map((id) => ({ id, w: cfg.overall[id], s: scores[id] }));
  const avail = parts.filter((p) => p.s.score !== null && p.w > 0);
  const wsum = avail.reduce((a, p) => a + p.w, 0);
  const total = parts.reduce((a, p) => a + p.w, 0) || 1;
  const score = wsum > 0 ? avail.reduce((a, p) => a + p.w * (p.s.score as number), 0) / wsum : null;
  const categories: CategoryResult[] = parts.map((p) => ({
    id: p.id,
    label: p.s.label,
    nominalWeight: p.w / total,
    effectiveWeight: p.s.score !== null && wsum > 0 ? p.w / wsum : 0,
    score: p.s.score,
    signal: p.s.signal,
    clusters: [],
    coverage: p.s.coverage,
  }));
  const coverage = parts.reduce((a, p) => a + (p.w / total) * p.s.coverage, 0);
  const freshness = parts.reduce((a, p) => a + (p.w / total) * p.s.freshness, 0);
  return {
    id: "overall",
    label: "Overall Macro Stress",
    score,
    signal: signalFor(score, cfg),
    categories,
    contributions: [],
    coverage,
    freshness,
    confidence: coverage * freshness,
  };
}
