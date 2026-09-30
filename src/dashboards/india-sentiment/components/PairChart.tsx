"use client";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { InView } from "@/platform/ui/patterns/in-view";
import { ChartSkeleton } from "@/platform/ui/patterns/skeletons";
import type View from "./PairChart.view";
export type { PairPoint } from "./PairChart.view";

/** Rendered height of both panels with their labels (reserved while loading, so nothing shifts). */
export const PAIR_CHART_HEIGHT = 442;
const HEIGHT = PAIR_CHART_HEIGHT;

// Recharts loads only when the chart approaches the viewport.
const Impl = dynamic(() => import("./PairChart.view"), { ssr: false, loading: () => <ChartSkeleton height={HEIGHT} /> });

export function PairChart(props: ComponentProps<typeof View>) {
  return (
    <InView style={{ minHeight: HEIGHT }} fallback={<ChartSkeleton height={HEIGHT} />}>
      <Impl {...props} />
    </InView>
  );
}
