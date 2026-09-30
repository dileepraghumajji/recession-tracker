/** Twelve Data provider (optional; only used when TWELVE_DATA_API_KEY is set). Shared client: @/platform/data/twelvedata. */
import type { SeriesDef } from "../../types";
import { fetchTwelveDataDaily } from "@/platform/data/twelvedata";
import type { FetchResult } from "./fred";

export { twelveDataConfigured } from "@/platform/data/twelvedata";

export async function fetchTwelveData(def: SeriesDef): Promise<FetchResult> {
  // Pairs such as XAU/USD trade around the clock (today's bar is never final); US-listed ETFs close at 16:00 New York time.
  const closeTime = def.sourceId.includes("/") ? undefined : "16:00";
  return { obs: await fetchTwelveDataDaily({ symbol: def.sourceId, closeTime }), sourceLastUpdated: null };
}
