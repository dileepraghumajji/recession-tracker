/** Data contract for ChartPanel (kept separate so server code can build it without loading the chart library). */
export interface ChartPoint {
  /** "YYYY-MM-DD" for daily data, ISO timestamp or epoch seconds for intraday. */
  time: string | number;
  value: number | null;
}

export interface ChartSeriesSpec {
  id: string;
  label: string;
  type: "line" | "area" | "histogram" | "baseline";
  data: ChartPoint[];
  /** Design token name for the series colour (series-1, accent, up, down, muted). Histograms colour by sign. */
  color?: string;
  /** Baseline value for "baseline" series (fills above/below in up/down colours). */
  baseline?: number;
  /** Dashed reference line (e.g. 50 = neutral, 1.0 PCR). */
  referenceLine?: number;
  /** Formats values in the legend. */
  format?: "number" | "percent" | "crore" | "ratio";
}

export interface ChartPane {
  id: string;
  label?: string;
  series: ChartSeriesSpec[];
  /** Relative height (default 1). */
  weight?: number;
}
