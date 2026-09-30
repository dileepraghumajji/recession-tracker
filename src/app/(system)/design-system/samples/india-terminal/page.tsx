import type { Metadata } from "next";
import { getHistory, getSeriesMap, getSnapshot } from "@/dashboards/india-sentiment/lib/data/service";
import { configOverridesFromCookie } from "@/dashboards/india-sentiment/lib/server-config";
import { SentimentChart } from "@/dashboards/india-sentiment/components/ds/SentimentChart";
import {
  ConfidenceWidget,
  DivergencesWidget,
  DriversWidget,
  FactorsWidget,
  FlowsWidget,
  HeroWidget,
  MonitorWidget,
  OptionsSnapshotWidget,
  QuestionsWidget,
  RegimeWidget,
  SubScoresWidget,
  SummaryWidget,
} from "@/dashboards/india-sentiment/components/ds/terminal-widgets";
import { Badge } from "@/platform/ui/primitives/badge";
import { WidgetShell } from "@/platform/ui/patterns/widget-shell";
import { DashboardGrid } from "@/platform/ui/shell/dashboard-grid";
import { PageHeader } from "@/platform/ui/shell/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sample · India Sentiment Terminal" };

export default async function IndiaTerminalSample() {
  const overrides = await configOverridesFromCookie();
  const [s, { history }, series] = await Promise.all([getSnapshot(overrides), getHistory(overrides), getSeriesMap()]);
  const sentiment = history.filter((h) => h.score !== null).map((h) => ({ time: h.date, value: h.score as number }));
  const nifty = (series["idx:NIFTY50"]?.obs ?? []).map((o) => ({ time: o.date, value: o.value }));
  const spark = sentiment.slice(-60).map((p) => p.value);

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        eyebrow="India Market Sentiment Terminal · sample on the design system"
        title="Market sentiment"
        description="Sentiment and positioning measurement across 16 factor groups — describes conditions, not a forecast."
        meta={
          <>
            <Badge tone="accent">beta</Badge>
            <span className="tabular-nums">As of {s.asOf}</span>
            <span>·</span>
            <span>Confidence {s.confidence.score}/100</span>
            {s.dataMode === "demo" && <Badge tone="warning">SYNTHETIC</Badge>}
          </>
        }
      />
      <DashboardGrid
        gridId="india-terminal"
        widgets={[
          { id: "hero", node: <HeroWidget s={s} spark={spark} />, lg: { x: 0, y: 0, w: 5, h: 12 }, minW: 4, minH: 10 },
          { id: "confidence", node: <ConfidenceWidget s={s} />, lg: { x: 5, y: 0, w: 3, h: 12 } },
          { id: "regime", node: <RegimeWidget s={s} />, lg: { x: 8, y: 0, w: 4, h: 12 } },
          { id: "summary", node: <SummaryWidget s={s} />, lg: { x: 0, y: 12, w: 12, h: 6 } },
          { id: "factors", node: <FactorsWidget s={s} />, lg: { x: 0, y: 18, w: 6, h: 18 } },
          { id: "drivers", node: <DriversWidget s={s} />, lg: { x: 6, y: 18, w: 3, h: 18 } },
          { id: "subscores", node: <SubScoresWidget s={s} />, lg: { x: 9, y: 18, w: 3, h: 18 } },
          {
            id: "chart",
            node: (
              <WidgetShell title="NIFTY vs sentiment" subtitle="Point-in-time sentiment history · shared time axis">
                <SentimentChart nifty={nifty} sentiment={sentiment} height={290} />
              </WidgetShell>
            ),
            lg: { x: 0, y: 36, w: 8, h: 18 },
            minW: 5,
          },
          { id: "options", node: <OptionsSnapshotWidget s={s} />, lg: { x: 8, y: 36, w: 4, h: 18 } },
          { id: "questions", node: <QuestionsWidget s={s} />, lg: { x: 0, y: 54, w: 12, h: 25 } },
          { id: "flows", node: <FlowsWidget s={s} />, lg: { x: 0, y: 79, w: 4, h: 12 } },
          { id: "divergences", node: <DivergencesWidget s={s} />, lg: { x: 4, y: 79, w: 4, h: 12 } },
          { id: "monitor", node: <MonitorWidget s={s} />, lg: { x: 8, y: 79, w: 4, h: 12 } },
        ]}
      />
    </div>
  );
}
