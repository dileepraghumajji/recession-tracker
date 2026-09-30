/**
 * Twelve Data daily prices (shared by every dashboard so all calls go through
 * one process-wide throttle). Optional: only used when TWELVE_DATA_API_KEY is set.
 *
 * - Free (Basic) plan: 8 API credits per minute and 800 per day; /time_series
 *   costs 1 credit per symbol. It covers US-listed stocks/ETFs, forex and crypto;
 *   indices need Grow/Pro and most commodities need Grow (XAG/USD is refused on
 *   Basic, but XAU/USD was served on a Basic key when tested on 2026-09-30). The
 *   plan a symbol needs is listed by the reference endpoints with `show_plan=true`.
 * - Calls are spaced 8 s apart (<= 7.5 per minute) in this process; a 429 from
 *   another process sharing the key is retried after 20 s and 40 s, i.e. once
 *   the minute's credits have reset.
 * - A bar dated today (exchange time) is dropped until the session has closed,
 *   so an intraday price is never stored as a daily close. Missing or invalid
 *   closes are dropped, never filled.
 */
import { z } from "zod";
import type { Obs } from "@/platform/lib/types";
import { sortAndClean } from "@/platform/lib/timeseries";
import { fetchWithRetry, redact } from "@/platform/data/http";

export interface TwelveDataQuery {
  /** Twelve Data symbol, e.g. "IWM" or "XAU/USD". */
  symbol: string;
  /** Exchange MIC to pin one listing (e.g. "ARCX" for NYSE Arca); checked against the response. */
  micCode?: string;
  /** Expected trading currency; checked against the response when set. */
  currency?: string;
  /** Session close, "HH:MM" exchange time: today's bar is kept only after it. Omit to always drop today's bar (24h markets). */
  closeTime?: string;
}

const SeriesBody = z.object({
  meta: z
    .object({
      symbol: z.string().optional(),
      currency: z.string().optional(),
      exchange_timezone: z.string().optional(),
      mic_code: z.string().optional(),
    })
    .optional(),
  status: z.literal("ok"),
  values: z.array(z.object({ datetime: z.string(), close: z.string() })).max(100_000),
});
const ErrorBody = z.object({ status: z.literal("error"), code: z.number().optional(), message: z.string().optional() });

export function twelveDataConfigured(): boolean {
  return !!process.env.TWELVE_DATA_API_KEY;
}

// ------------------------------------------------------------------ rate limit

/** Free plan: 8 credits per minute. One /time_series call per symbol costs 1 credit. */
export const TWELVE_DATA_MIN_INTERVAL_MS = 8_000;
const g = globalThis as unknown as { __twelveDataNextSlot?: number };

async function throttle(): Promise<void> {
  const now = Date.now();
  const next = g.__twelveDataNextSlot ?? 0;
  const wait = Math.max(0, next - now);
  g.__twelveDataNextSlot = Math.max(now, next) + TWELVE_DATA_MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

/** Tests only: forget the throttle's last slot. */
export function resetTwelveDataThrottle(): void {
  g.__twelveDataNextSlot = 0;
}

// ------------------------------------------------------------------ parsing

/** Exchange-local calendar date and "HH:MM" for an instant. */
function localDateTime(ms: number, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/**
 * Daily values → observations: valid positive closes only, and only completed
 * sessions (today's bar once `closeTime` has passed in the exchange's time zone).
 */
export function dailyObs(values: { datetime: string; close: string }[], opts: { timeZone: string; closeTime?: string; now: number }): Obs[] {
  const today = localDateTime(opts.now, opts.timeZone);
  const todayClosed = opts.closeTime !== undefined && today.time >= opts.closeTime;
  const out: Obs[] = [];
  for (const v of values) {
    const date = v.datetime.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (date > today.date || (date === today.date && !todayClosed)) continue;
    const value = Number(v.close);
    if (!Number.isFinite(value) || value <= 0) continue;
    out.push({ date, value });
  }
  return sortAndClean(out);
}

// ------------------------------------------------------------------ request

/** Full daily history (up to 5,000 sessions, split-adjusted) for one symbol. */
export async function fetchTwelveDataDaily(q: TwelveDataQuery, now = Date.now()): Promise<Obs[]> {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("TWELVE_DATA_API_KEY not configured");
  try {
    const params = new URLSearchParams({ symbol: q.symbol, interval: "1day", outputsize: "5000", adjust: "splits" });
    if (q.micCode) params.set("mic_code", q.micCode);
    params.set("apikey", key);
    await throttle();
    const res = await fetchWithRetry(`https://api.twelvedata.com/time_series?${params}`, { retries: 2, backoffBaseMs: 20_000, passClientErrors: true });
    const json = (await res.json()) as unknown;
    const err = ErrorBody.safeParse(json);
    if (err.success || !res.ok) {
      const code = err.success ? (err.data.code ?? res.status) : res.status;
      const msg = err.success ? (err.data.message ?? "error") : `HTTP ${res.status}`;
      throw new Error(`${code}: ${msg}${code === 403 ? " (symbol not included in this Twelve Data plan)" : ""}`);
    }
    const parsed = SeriesBody.safeParse(json);
    if (!parsed.success) throw new Error("invalid response");
    const meta = parsed.data.meta;
    if (q.micCode && meta?.mic_code !== q.micCode) throw new Error(`expected listing ${q.micCode}, got ${meta?.mic_code ?? "none"}`);
    if (q.currency && meta?.currency !== q.currency) throw new Error(`expected currency ${q.currency}, got ${meta?.currency ?? "none"}`);
    return dailyObs(parsed.data.values, { timeZone: meta?.exchange_timezone || "UTC", closeTime: q.closeTime, now });
  } catch (e) {
    throw new Error(redact(`Twelve Data ${q.symbol}: ${e instanceof Error ? e.message : String(e)}`));
  }
}
