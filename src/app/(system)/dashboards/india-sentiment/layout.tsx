import type { Metadata } from "next";
import { getDashboard } from "@/dashboards/registry";
import { ProviderBanner } from "@/dashboards/india-sentiment/components/ProviderStatus";
import { DashboardFrame } from "@/platform/ui/shell/dashboard-frame";

const dashboard = getDashboard("india-sentiment");

export const metadata: Metadata = { title: dashboard.name, description: dashboard.description };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardFrame dashboard={dashboard} toolbar={<ProviderBanner />}>
      {children}
    </DashboardFrame>
  );
}
