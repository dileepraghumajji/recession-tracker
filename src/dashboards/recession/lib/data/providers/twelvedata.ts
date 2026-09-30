/** Twelve Data provider (optional; only used when TWELVE_DATA_API_KEY is set). */
import { z } from "zod";
import type { SeriesDef } from "../../types";
import { sortAndClean } from "../../timeseries";
import { fetchWithRetry, redact } from "../http";
import type { FetchResult } from "./fred";

const Schema = z.object({
  status: z.literal("ok"),
  values: z.array(z.object({ datetime: z.string(), close: z.string() })).max(100_000),
});

export function twelveDataConfigured(): boolean {
  return !!process.env.TWELVE_DATA_API_KEY;
}

export async function fetchTwelveData(def: SeriesDef): Promise<FetchResult> {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("TWELVE_DATA_API_KEY not configured");
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(def.sourceId)}&interval=1day&outputsize=5000&apikey=${encodeURIComponent(key)}`;
    const res = await fetchWithRetry(url);
    const json = (await res.json()) as unknown;
    const parsed = Schema.safeParse(json);
    if (!parsed.success) {
      const msg = (json as { message?: string })?.message ?? "invalid response";
      throw new Error(msg);
    }
    const obs = parsed.data.values.map((v) => ({ date: v.datetime.slice(0, 10), value: Number(v.close) }));
    return { obs: sortAndClean(obs), sourceLastUpdated: null };
  } catch (e) {
    throw new Error(redact(`Twelve Data ${def.sourceId}: ${e instanceof Error ? e.message : String(e)}`));
  }
}
