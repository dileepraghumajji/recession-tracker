import { SignalBadge } from "./ui";
import type { CompositeScore } from "@/lib/types";

export function ScoreTile({
  score,
  change,
  color,
  note,
}: {
  score: CompositeScore;
  change: { w1: number | null; m1: number | null; m3: number | null };
  color: string;
  note: string;
}) {
  const v = score.score;
  const d = change.m1;
  const arrow = d === null ? "" : d > 2 ? "↑" : d < -2 ? "↓" : "→";
  const dirWord = d === null ? "no comparison" : d > 2 ? "rising" : d < -2 ? "easing" : "stable";
  return (
    <div className="panel flex flex-col gap-2 p-4" style={{ borderTop: `2px solid ${color}` }}>
      <div className="flex items-center justify-between">
        <span className="panel-title">{score.label}</span>
        <SignalBadge signal={score.signal} />
      </div>
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-semibold tracking-tight">{v === null ? "—" : v.toFixed(0)}</span>
        <span className="text-sm text-muted">/ 100</span>
      </div>
      <div className="num text-xs text-ink-2">
        <span className={d !== null && d > 2 ? "trend-bad" : d !== null && d < -2 ? "trend-good" : "trend-flat"}>
          {arrow} {dirWord}
        </span>
        <span className="text-muted">
          {" "}
          · 1W {fmt(change.w1)} · 1M {fmt(change.m1)} · 3M {fmt(change.m3)}
        </span>
      </div>
      <div className="text-[11px] text-muted">
        Coverage {(score.coverage * 100).toFixed(0)}% · Freshness {(score.freshness * 100).toFixed(0)}%
      </div>
      <p className="text-[11px] leading-snug text-muted">{note}</p>
    </div>
  );
}

function fmt(x: number | null) {
  if (x === null) return "n/a";
  return `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(x).toFixed(0)}`;
}
