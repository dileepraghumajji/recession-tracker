/**
 * FRED provider (shared by every dashboard so all FRED calls go through one
 * process-wide throttle). Uses the official API when FRED_API_KEY is set
 * (includes series metadata such as `last_updated`), otherwise the public
 * per-series CSV download endpoint offered on every FRED series page.
 */
import { z } from "zod";
import type { Obs } from "@/platform/lib/types";
import { sortAndClean } from "@/platform/lib/timeseries";
import { fetchWithRetry, redact } from "@/platform/data/http";

const ObsSchema = z.object({
  observations: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), value: z.string() })).max(200_000),
});
const MetaSchema = z.object({
  seriess: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        last_updated: z.string().optional(),
        frequency_short: z.string().optional(),
        units: z.string().optional(),
      }),
    )
    .min(1),
});

export interface FetchResult {
  obs: Obs[];
  sourceLastUpdated: string | null;
}

function parseValue(v: string): number | null {
  if (v === "." || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** FRED's last_updated looks like "2026-09-26 07:51:02-05". Normalise to ISO. */
export function normalizeFredTimestamp(s: string | undefined): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})([+-]\d{2})$/);
  const iso = m ? `${m[1]}T${m[2]}${m[3]}:00` : s;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function parseFredCsv(text: string): Obs[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("Empty CSV");
  const header = lines[0].toLowerCase();
  if (!header.includes("date")) throw new Error("Unexpected CSV header");
  const out: Obs[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, value] = lines[i].split(",");
    if (!date || value === undefined) continue;
    const v = parseValue(value);
    if (v !== null && /^\d{4}-\d{2}-\d{2}$/.test(date)) out.push({ date, value: v });
  }
  return out;
}

// FRED allows 120 requests/minute per API key. Space calls ~0.6s apart
// (<= 100/min) across all concurrent workers in this process.
const MIN_INTERVAL_MS = 600;
let nextSlot = 0;
async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function fredGet(url: string): Promise<Response> {
  await throttle();
  return fetchWithRetry(url, { retries: 4, backoffBaseMs: 5000 });
}

export function fredConfigured(): boolean {
  return !!process.env.FRED_API_KEY;
}

export async function fetchFred(def: { sourceId: string }): Promise<FetchResult> {
  const key = process.env.FRED_API_KEY;
  const id = encodeURIComponent(def.sourceId);
  try {
    if (key) {
      const base = "https://api.stlouisfed.org/fred";
      const obsRes = await fredGet(`${base}/series/observations?series_id=${id}&api_key=${encodeURIComponent(key)}&file_type=json`);
      const metaRes = await fredGet(`${base}/series?series_id=${id}&api_key=${encodeURIComponent(key)}&file_type=json`);
      const obsJson = ObsSchema.parse(await obsRes.json());
      const metaJson = MetaSchema.safeParse(await metaRes.json());
      const obs: Obs[] = [];
      for (const o of obsJson.observations) {
        const v = parseValue(o.value);
        if (v !== null) obs.push({ date: o.date, value: v });
      }
      return {
        obs: sortAndClean(obs),
        sourceLastUpdated: metaJson.success ? normalizeFredTimestamp(metaJson.data.seriess[0].last_updated) : null,
      };
    }
    const res = await fredGet(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`);
    const text = await res.text();
    if (text.length > 20_000_000) throw new Error("Response too large");
    return { obs: sortAndClean(parseFredCsv(text)), sourceLastUpdated: null };
  } catch (e) {
    throw new Error(redact(`FRED ${def.sourceId}: ${e instanceof Error ? e.message : String(e)}`));
  }
}
