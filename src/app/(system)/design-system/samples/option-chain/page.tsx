import type { Metadata } from "next";
import { resolveConfig } from "@/dashboards/india-sentiment/lib/config";
import { getChainView, getIntraday, getSnapshot } from "@/dashboards/india-sentiment/lib/data/service";
import { configOverridesFromCookie } from "@/dashboards/india-sentiment/lib/server-config";
import { OptionChainScreen } from "@/dashboards/india-sentiment/components/ds/OptionChainScreen";
import { Badge } from "@/platform/ui/primitives/badge";
import { PageHeader } from "@/platform/ui/shell/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sample · Option chain" };

export default async function OptionChainSample() {
  const overrides = await configOverridesFromCookie();
  const cfg = resolveConfig(overrides);
  const [view, snap, intraday] = await Promise.all([getChainView("NIFTY", null, cfg.strikeWindow, cfg), getSnapshot(overrides), getIntraday("NIFTY", 15)]);
  const ov = snap.options.find((o) => o.underlying === view.underlying);
  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        eyebrow="India Market Sentiment Terminal · sample on the design system"
        title="Option chain"
        description="Open interest, premium traded, IV and likely positioning by strike. Labels are probabilistic; OI zones are potential support/resistance; Max Pain is theoretical."
        meta={<Badge tone="accent">beta</Badge>}
      />
      <OptionChainScreen initial={view} expiriesSummary={ov?.expiries ?? []} shift={ov?.shift ?? null} initialIntraday={intraday} />
    </div>
  );
}
