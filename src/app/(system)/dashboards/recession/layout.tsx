import type { Metadata } from "next";
import { getDashboard } from "@/dashboards/registry";
import { DashboardFrame } from "@/platform/ui/shell/dashboard-frame";

const dashboard = getDashboard("recession");

export const metadata: Metadata = { title: dashboard.name, description: dashboard.description };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardFrame dashboard={dashboard}>{children}</DashboardFrame>;
}
