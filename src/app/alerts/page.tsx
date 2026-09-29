import { PageHeader } from "@/components/ui";
import { AlertsClient } from "./AlertsClient";
import { ALERT_PRESETS } from "@/lib/alerts";
import { INDICATORS } from "@/lib/indicators";

export const dynamic = "force-dynamic";

export default function AlertsPage() {
  const indicators = INDICATORS.filter((i) => i.inputs.length > 0).map((i) => ({ id: i.id, name: i.name, units: i.units, changeUnits: i.changeUnits }));
  return (
    <div>
      <PageHeader
        title="Alerts"
        subtitle="Alerts are never created automatically. Configure the conditions you care about; an alert fires when its condition changes from false to true at a data refresh or page load, and is logged below (and POSTed to ALERT_WEBHOOK_URL if configured)."
      />
      <AlertsClient presets={ALERT_PRESETS} indicators={indicators} />
    </div>
  );
}
