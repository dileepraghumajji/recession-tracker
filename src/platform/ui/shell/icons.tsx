import { Activity, CandlestickChart, Gauge, Globe, Landmark, Layers, LineChart, type LucideIcon } from "lucide-react";
import type { NavDashboard } from "./nav-data";

export const DASHBOARD_ICONS: Record<NavDashboard["icon"], LucideIcon> = {
  activity: Activity,
  gauge: Gauge,
  candlestick: CandlestickChart,
  globe: Globe,
  landmark: Landmark,
  "line-chart": LineChart,
  layers: Layers,
};
