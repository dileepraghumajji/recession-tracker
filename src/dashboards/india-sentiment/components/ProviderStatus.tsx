import { AlertTriangle, Clock } from "lucide-react";
import { dataContext, fallbackReason, istLabel as IST, providerStatuses } from "../lib/data/service";
import type { ProviderStatus } from "../lib/data/provider";
import { fmtDate } from "@/platform/lib/format";
import { tableClass } from "@/platform/ui/patterns/content";

/**
 * Shown on every India Sentiment page when live market data is unavailable and
 * the dashboard has fallen back to synthetic demo data, or when the provider
 * token is about to expire.
 */
export function ProviderBanner() {
  const ctx = dataContext();
  if (ctx.fallback) {
    const f = ctx.fallback;
    const how =
      f.state === "expired" || f.state === "invalid"
        ? "Generate a new access token in Dhan (tokens are valid for 24 hours), set DHAN_ACCESS_TOKEN on the server and restart or redeploy."
        : f.state === "not_subscribed"
          ? "Activate the Data API subscription for this Dhan account."
          : "Live data resumes automatically when api.dhan.co responds again (checked every 5 minutes).";
    return (
      <div role="alert" className="mb-4 flex gap-3 rounded-[10px] border border-warning bg-[color-mix(in_srgb,var(--warning)_12%,var(--surface))] p-3 text-[13px] text-ink">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div>
          <p className="font-semibold">
            Showing SYNTHETIC demo data — {fallbackReason(f)}.
          </p>
          <p className="mt-0.5 text-ink-2">Nothing on these pages reflects real market data until live data resumes. {how}</p>
        </div>
      </div>
    );
  }
  if (ctx.mode !== "live") return null;
  const soon = providerStatuses().find((p) => p.status.configured && p.status.expiresAt && Date.parse(p.status.expiresAt) - Date.now() < 2 * 3600_000);
  if (soon?.status.expiresAt)
    return (
      <div role="status" className="mb-4 flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-xs text-ink-2">
        <Clock className="size-3.5 text-warning" aria-hidden />
        {soon.name === "dhan" ? "Dhan" : soon.name} access token expires {IST(soon.status.expiresAt)}; after that this dashboard shows synthetic demo data until the token is renewed.
      </div>
    );
  return null;
}

const STATE_LABEL: Record<ProviderStatus["state"], { text: string; cls: string }> = {
  not_configured: { text: "Not configured", cls: "text-muted" },
  unknown: { text: "Configured · not used yet", cls: "text-ink-2" },
  ok: { text: "Connected", cls: "text-good-ink" },
  expired: { text: "Token expired", cls: "text-serious" },
  invalid: { text: "Token or client id rejected", cls: "text-serious" },
  not_subscribed: { text: "Data API not subscribed", cls: "text-serious" },
  unreachable: { text: "Unreachable", cls: "text-serious" },
};

/** Provider health table for Settings & Sources (never shows credentials). */
export function ProviderStatusTable() {
  const rows = providerStatuses();
  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <thead>
          <tr>
            <th>Provider</th>
            <th>State</th>
            <th>Token expires</th>
            <th>Last success</th>
            <th>Last error</th>
            <th className="r">Requests today</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ name, status: s }) => (
            <tr key={name}>
              <td>{name === "dhan" ? "Dhan (DhanHQ v2, data APIs)" : name}</td>
              <td className={STATE_LABEL[s.state].cls}>{STATE_LABEL[s.state].text}</td>
              <td className="tabular-nums text-xs">{s.expiresAt ? IST(s.expiresAt) : "—"}</td>
              <td className="tabular-nums text-xs">{fmtDate(s.lastOkAt)}</td>
              <td className="max-w-72 text-xs text-ink-2">{s.lastError ? `${fmtDate(s.lastErrorAt)} · ${s.lastError}` : "—"}</td>
              <td className="r">{s.requestsToday}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
