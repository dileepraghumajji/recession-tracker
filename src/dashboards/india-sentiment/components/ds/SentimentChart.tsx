"use client";
import { useMemo, useState } from "react";
import { ChartPanel, type ChartPane } from "@/platform/ui/patterns/chart-panel";
import { TimeRangeSelector, type TimeRange } from "@/platform/ui/patterns/filter-bar";

const DAYS: Partial<Record<TimeRange, number>> = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "3Y": 1096, "5Y": 1827, "10Y": 3653 };

/** NIFTY and the sentiment score as two panes on one time axis, with a range selector. */
export function SentimentChart({ nifty, sentiment, height = 300 }: { nifty: { time: string; value: number }[]; sentiment: { time: string; value: number }[]; height?: number }) {
  const [range, setRange] = useState<TimeRange>("1Y");
  const panes = useMemo<ChartPane[]>(() => {
    const end = nifty.at(-1)?.time ?? sentiment.at(-1)?.time ?? "";
    const days = DAYS[range];
    const from = days ? new Date(Date.parse(end) - days * 86_400_000).toISOString().slice(0, 10) : "";
    const cut = <T extends { time: string }>(xs: T[]) => xs.filter((x) => x.time >= from);
    return [
      { id: "nifty", weight: 3, series: [{ id: "nifty", label: "NIFTY 50", type: "area", color: "series-1", data: cut(nifty) }] },
      { id: "sent", weight: 2, series: [{ id: "sent", label: "Sentiment", type: "baseline", baseline: 50, referenceLine: 50, data: cut(sentiment) }] },
    ];
  }, [nifty, sentiment, range]);
  return <ChartPanel panes={panes} height={height} header={<TimeRangeSelector value={range} onChange={setRange} ranges={["1M", "3M", "6M", "1Y", "3Y", "5Y", "MAX"] as TimeRange[]} />} />;
}
