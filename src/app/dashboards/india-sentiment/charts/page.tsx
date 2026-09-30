import { ChartsExplorer } from "@/dashboards/india-sentiment/components/ChartsExplorer";
import { PageHeader, Panel } from "@/dashboards/india-sentiment/components/ui";

export default function Charts() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Charts"
        subtitle="NIFTY against sentiment, breadth, flows, volatility, option positioning, currency, rates, crude and credit stress. Each pair is drawn as two panels on a shared time axis (hover either panel) rather than a misleading dual-axis chart."
      />
      <Panel>
        <ChartsExplorer />
      </Panel>
      <p className="text-xs text-muted">
        Sentiment and credit-stress history are reconstructed point-in-time (each date uses only data published by then). 1D uses intraday option-chain snapshots and is available for premium pressure; other series are daily or lower frequency.
      </p>
    </div>
  );
}
