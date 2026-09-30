/**
 * THE place to register a dashboard. Order here is the order in the product
 * navigation and on the home page. See CONTRIBUTING.md → "How to add a new dashboard".
 */
import type { DashboardManifest } from "@/platform/dashboards";
import india from "./india-sentiment/manifest";
import recession from "./recession/manifest";

export const DASHBOARDS: DashboardManifest[] = [recession, india];

export function getDashboard(id: string): DashboardManifest {
  const d = DASHBOARDS.find((x) => x.id === id);
  if (!d) throw new Error(`dashboard "${id}" is not registered`);
  return d;
}
