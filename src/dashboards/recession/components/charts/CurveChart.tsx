"use client";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { InView } from "@/platform/ui/patterns/in-view";
import { ChartSkeleton } from "@/platform/ui/patterns/skeletons";
import type View from "./CurveChart.view";

// Recharts loads only when the chart approaches the viewport.
const Impl = dynamic(() => import("./CurveChart.view"), { ssr: false, loading: () => <ChartSkeleton height={260} /> });

export function CurveChart(props: ComponentProps<typeof View>) {
  return (
    <InView fallback={<ChartSkeleton height={260} />}>
      <Impl {...props} />
    </InView>
  );
}
