"use client";
import { AreaSeries, BaselineSeries, ColorType, createChart, CrosshairMode, HistogramSeries, LineSeries, LineStyle, type IChartApi, type IPriceLine, type ISeriesApi, type SeriesType, type Time, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import type { ChartPane, ChartPoint, ChartSeriesSpec } from "./chart-types";

/** Resolve a design token (e.g. "up", "series-1") to a concrete colour on the chart container. */
function token(el: HTMLElement, name: string, fallback = "#888"): string {
  const v = getComputedStyle(el).getPropertyValue(`--${name}`).trim();
  return v || fallback;
}

function toTime(t: string | number, offsetSec: number): Time {
  if (typeof t === "number") return (t + offsetSec) as UTCTimestamp;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t as Time;
  return (Math.floor(Date.parse(t) / 1000) + offsetSec) as UTCTimestamp;
}

/** Canvas can't parse color-mix(); build an rgba() from a hex or rgb(a) token. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = color.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const [r, g, b] = rgb[1].split(",").map((x) => x.trim());
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

/** Input must be ascending by time; drops nulls and duplicate timestamps (the library requires unique, ascending times). */
function clean(points: ChartPoint[], offset: number) {
  const out: { time: Time; value: number }[] = [];
  for (const p of points) {
    if (p.value === null || !Number.isFinite(p.value)) continue;
    const time = toTime(p.time, offset);
    if (out.length && out[out.length - 1].time === time) out[out.length - 1] = { time, value: p.value };
    else out.push({ time, value: p.value });
  }
  return out;
}

export interface LwChartProps {
  panes: ChartPane[];
  height: number;
  /** Seconds added to intraday timestamps (IST = 19800) so axis labels read in local market time. */
  timeOffsetSec?: number;
  onHover?: (values: Record<string, number | null> | null, time: string | null) => void;
}

/**
 * Themed Lightweight Charts renderer. Each pane shares the time axis and
 * crosshair (stacked panes instead of dual y-axes). Colours come from design
 * tokens and update when the theme / market scheme changes.
 */
export default function LwChart({ panes, height, timeOffsetSec = 0, onHover }: LwChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<{ spec: ChartSeriesSpec; api: ISeriesApi<SeriesType>; line?: IPriceLine }[]>([]);
  const [themeTick, setThemeTick] = useState(0);

  // Re-theme when <html data-theme / data-market / data-density> changes.
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeTick((t) => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-market", "data-density"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const c = createChart(node, {
      autoSize: true,
      crosshair: { mode: CrosshairMode.Magnet },
      localization: { priceFormatter: (p: number) => (Math.abs(p) >= 1000 ? p.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : p.toLocaleString("en-IN", { maximumFractionDigits: 2 })) },
      timeScale: { timeVisible: panes.some((p) => p.series.some((s) => s.data.some((d) => typeof d.time === "number" || String(d.time).length > 10))), secondsVisible: false },
      handleScale: { axisPressedMouseMove: true },
    });
    chart.current = c;
    // The library lays out panes with a <table>; mark it presentational for assistive tech.
    node.querySelectorAll("table").forEach((t) => t.setAttribute("role", "presentation"));
    series.current = [];
    panes.forEach((pane, pi) => {
      for (const spec of pane.series) {
        const def = spec.type === "area" ? AreaSeries : spec.type === "histogram" ? HistogramSeries : spec.type === "baseline" ? BaselineSeries : LineSeries;
        const api = c.addSeries(def as typeof LineSeries, { lastValueVisible: true, priceLineVisible: false, title: "" }, pi) as ISeriesApi<SeriesType>;
        const data = clean(spec.data, timeOffsetSec);
        if (spec.type === "histogram") (api as ISeriesApi<"Histogram">).setData(data.map((d) => ({ ...d })));
        else api.setData(data);
        series.current.push({ spec, api });
      }
    });
    const heights = panes.map((p) => p.weight ?? 1);
    const total = heights.reduce((a, b) => a + b, 0);
    c.panes().forEach((p, i) => p.setHeight(Math.round((height * heights[i]) / total)));
    c.timeScale().fitContent();
    c.subscribeCrosshairMove((param) => {
      if (!onHover) return;
      if (!param.time) return onHover(null, null);
      const vals: Record<string, number | null> = {};
      for (const { spec, api } of series.current) {
        const d = param.seriesData.get(api) as { value?: number } | undefined;
        vals[spec.id] = d?.value ?? null;
      }
      const t = typeof param.time === "number" ? new Date((param.time - timeOffsetSec) * 1000).toISOString() : String(param.time);
      onHover(vals, t);
    });
    return () => {
      c.remove();
      chart.current = null;
    };
    // Data identity drives a rebuild; theme changes are applied below without rebuilding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panes, height, timeOffsetSec]);

  useEffect(() => {
    const c = chart.current;
    const node = el.current;
    if (!c || !node) return;
    const font = getComputedStyle(node).fontFamily;
    c.applyOptions({
      layout: { background: { type: ColorType.Solid, color: withAlpha(token(node, "surface"), 0) }, textColor: token(node, "muted"), fontFamily: font, fontSize: 11, attributionLogo: false, panes: { separatorColor: token(node, "border"), separatorHoverColor: withAlpha(token(node, "accent"), 0.2) } },
      grid: { vertLines: { visible: false }, horzLines: { color: token(node, "grid") } },
      rightPriceScale: { borderColor: token(node, "border") },
      timeScale: { borderColor: token(node, "border") },
      crosshair: { vertLine: { color: token(node, "axis"), labelBackgroundColor: token(node, "surface-3") }, horzLine: { color: token(node, "axis"), labelBackgroundColor: token(node, "surface-3") } },
    });
    for (const entry of series.current) {
      const { spec, api } = entry;
      const color = token(node, spec.color ?? "accent");
      if (spec.type === "area") api.applyOptions({ lineColor: color, topColor: withAlpha(color, 0.28), bottomColor: withAlpha(color, 0), lineWidth: 2 } as never);
      else if (spec.type === "histogram") {
        const up = token(node, "up");
        const down = token(node, "down");
        (api as ISeriesApi<"Histogram">).setData(clean(spec.data, timeOffsetSec).map((d) => ({ ...d, color: d.value >= 0 ? up : down })));
      } else if (spec.type === "baseline")
        api.applyOptions({ baseValue: { type: "price", price: spec.baseline ?? 0 }, topLineColor: token(node, "up"), bottomLineColor: token(node, "down"), topFillColor1: withAlpha(token(node, "up"), 0.22), topFillColor2: withAlpha(token(node, "up"), 0), bottomFillColor1: withAlpha(token(node, "down"), 0), bottomFillColor2: withAlpha(token(node, "down"), 0.22), lineWidth: 2 } as never);
      else api.applyOptions({ color, lineWidth: 2 } as never);
      if (entry.line) api.removePriceLine(entry.line);
      if (spec.referenceLine !== undefined) entry.line = api.createPriceLine({ price: spec.referenceLine, color: token(node, "muted"), lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "" });
    }
  }, [themeTick, panes, height, timeOffsetSec]);

  return <div ref={el} style={{ height, width: "100%" }} className="font-sans" />;
}
