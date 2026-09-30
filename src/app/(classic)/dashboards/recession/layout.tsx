import type { Metadata } from "next";
import { DashboardShell } from "@/platform/components/DashboardShell";
import { getDashboard } from "@/dashboards/registry";

const dashboard = getDashboard("recession");

export const metadata: Metadata = { title: dashboard.name, description: dashboard.description };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardShell dashboard={dashboard}>{children}</DashboardShell>;
}
