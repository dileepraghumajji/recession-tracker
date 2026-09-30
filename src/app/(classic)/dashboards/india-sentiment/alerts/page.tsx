import { ALERT_METRICS, ALERT_PRESETS } from "@/dashboards/india-sentiment/lib/alerts";
import { AlertsClient } from "@/dashboards/india-sentiment/components/AlertsClient";
import { PageHeader } from "@/dashboards/india-sentiment/components/ui";

export const dynamic = "force-dynamic";

export default function Alerts() {
  const metrics = Object.entries(ALERT_METRICS).map(([id, m]) => ({ id, label: m.label, unit: m.unit, changeUnit: m.changeUnit }));
  return (
    <div className="space-y-5">
      <PageHeader title="Alerts" subtitle="User-configured alerts on sentiment, volatility, flows, breadth, option positioning, INR, G-Secs and crude. No alerts are created automatically." />
      <AlertsClient presets={ALERT_PRESETS} metrics={metrics} />
    </div>
  );
}
