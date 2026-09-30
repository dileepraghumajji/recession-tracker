/**
 * DhanHQ v2 market-data provider (read-only data endpoints; see dhan-endpoints.ts).
 *
 * - Index history (16 NSE/BSE indices + India VIX): /charts/historical daily closes
 *   since inception, plus today's last price from /marketfeed/ohlc, added only
 *   when /charts/intraday shows the market traded today (no holiday "closes").
 * - Option chains: /optionchain/expirylist, then /optionchain per expiry (the
 *   current, next, monthly and far expiries the engine uses; current only for
 *   intraday refreshes). Dhan reports volume and OI as quantity, so chains use
 *   volumeUnit "shares"; lot sizes come from the NSE_FNO instrument list.
 * - Intraday underlying prices: /charts/intraday 5-minute candles.
 */
import type { Obs, OptionChainSnapshot, OptionRecord, SeriesDef } from "../../types";
import { classifyExpiries } from "../../engine/options";
import type { MarketDataProvider } from "../provider";
import { dhanCredentials, dhanRequest, dhanStatus } from "./dhan-client";

/** Dhan security ids (exchange segment IDX_I) from the official instrument master, checked 2026-09-30. */
export const DHAN_INDEX_IDS: Record<string, number> = {
  NIFTY50: 13,
  NIFTYNEXT50: 38,
  NIFTYMIDCAP100: 37,
  NIFTYSMALLCAP100: 5,
  SENSEX: 51,
  NIFTYBANK: 25,
  NIFTYIT: 29,
  NIFTYAUTO: 14,
  NIFTYMETAL: 31,
  NIFTYPHARMA: 32,
  NIFTYFMCG: 28,
  NIFTYREALTY: 34,
  NIFTYPSUBANK: 33,
  NIFTYPVTBANK: 15,
  NIFTYFINSERVICE: 27,
  NIFTYINFRA: 43,
  INDIAVIX: 21,
};

/** Option underlyings → index security id. */
export const DHAN_UNDERLYING_IDS: Record<string, number> = { NIFTY: 13, BANKNIFTY: 25, FINNIFTY: 27 };

// ------------------------------------------------------------------ time (IST)

const IST_OFFSET_MS = 5.5 * 3600_000;

/** Calendar date in India for an instant. */
export function istDate(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** ISO timestamp with the +05:30 offset (the app stores chain times in IST). */
export function istIso(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 19) + "+05:30";
}

/** NSE cash/F&O session (Mon–Fri 09:15–15:30 IST). Exchange holidays are not known here; callers treat this as "may be open". */
export function marketMaybeOpen(ms: number): boolean {
  const d = new Date(ms + IST_OFFSET_MS);
  const day = d.getUTCDay();
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return day >= 1 && day <= 5 && mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

// ------------------------------------------------------------------ payloads

interface Candles {
  open?: number[];
  high?: number[];
  low?: number[];
  close?: number[];
  volume?: number[];
  timestamp?: number[];
}

/** Daily candles → one observation per IST trading date (close). Invalid values are dropped, never filled. */
export function candlesToObs(c: Candles): Obs[] {
  const ts = c.timestamp ?? [];
  const close = c.close ?? [];
  const out: Obs[] = [];
  for (let i = 0; i < Math.min(ts.length, close.length); i++) {
    const v = close[i];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
    out.push({ date: istDate(ts[i] * 1000), value: v });
  }
  return out;
}

interface Leg {
  last_price?: number;
  previous_close_price?: number;
  oi?: number;
  previous_oi?: number;
  volume?: number;
  implied_volatility?: number;
  top_bid_price?: number;
  top_ask_price?: number;
}
interface ChainResponse {
  data?: { last_price?: number; oc?: Record<string, { ce?: Leg; pe?: Leg }> };
}

const pos = (v: number | undefined): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const nonneg = (v: number | undefined): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** One expiry of a Dhan option chain → stored records. Zero prices/IVs mean "no trade/quote" and become null. */
export function chainToRecords(underlying: string, expiry: string, res: ChainResponse, timestamp: string, lotSize: number): OptionRecord[] {
  const out: OptionRecord[] = [];
  for (const [k, row] of Object.entries(res.data?.oc ?? {})) {
    const strike = Number(k);
    if (!Number.isFinite(strike) || strike <= 0) continue;
    for (const [type, leg] of [
      ["CE", row.ce],
      ["PE", row.pe],
    ] as const) {
      if (!leg) continue;
      const oi = nonneg(leg.oi);
      out.push({
        underlying,
        expiry,
        strike,
        type,
        ltp: pos(leg.last_price),
        prevClose: pos(leg.previous_close_price),
        volume: nonneg(leg.volume),
        oi,
        changeInOi: typeof leg.previous_oi === "number" && Number.isFinite(leg.previous_oi) ? oi - leg.previous_oi : 0,
        iv: pos(leg.implied_volatility),
        prevIv: null,
        bid: pos(leg.top_bid_price),
        ask: pos(leg.top_ask_price),
        timestamp,
        lotSize,
      });
    }
  }
  return out;
}

/** Lot sizes of index options from the NSE_FNO instrument list (detailed CSV). */
export function parseLotSizes(csv: string, underlyings: string[]): Record<string, number> {
  const nl = csv.indexOf("\n");
  const header = csv.slice(0, nl).split(",").map((h) => h.trim());
  const iInst = header.indexOf("INSTRUMENT");
  const iSym = header.indexOf("UNDERLYING_SYMBOL");
  const iLot = header.indexOf("LOT_SIZE");
  const out: Record<string, number> = {};
  if (iInst < 0 || iSym < 0 || iLot < 0) return out;
  const want = new Set(underlyings);
  let start = nl + 1;
  while (start < csv.length && Object.keys(out).length < want.size) {
    let end = csv.indexOf("\n", start);
    if (end < 0) end = csv.length;
    const line = csv.slice(start, end);
    start = end + 1;
    if (!line.includes("OPTIDX")) continue;
    const f = line.split(",");
    const sym = f[iSym]?.trim();
    if (f[iInst] === "OPTIDX" && sym && want.has(sym) && !out[sym]) {
      const lot = Math.round(Number(f[iLot]));
      if (lot > 0) out[sym] = lot;
    }
  }
  return out;
}

// ------------------------------------------------------------------ requests

const g = globalThis as unknown as { __dhanLots?: { at: number; lots: Record<string, number> } };

async function lotSizes(): Promise<Record<string, number>> {
  const c = g.__dhanLots;
  if (c && Date.now() - c.at < 24 * 3600_000) return c.lots;
  try {
    const csv = await dhanRequest<string>("instrumentsNseFno", null, { text: true });
    const lots = parseLotSizes(csv, Object.keys(DHAN_UNDERLYING_IDS));
    g.__dhanLots = { at: Date.now(), lots };
    return lots;
  } catch {
    // Lot size only annotates records here (quantities are already in shares); retry in an hour.
    g.__dhanLots = { at: Date.now() - 23 * 3600_000, lots: c?.lots ?? {} };
    return c?.lots ?? {};
  }
}

async function historical(securityId: number, fromDate: string, toDate: string): Promise<Candles> {
  return dhanRequest<Candles>("historicalDaily", { securityId: String(securityId), exchangeSegment: "IDX_I", instrument: "INDEX", expiryCode: 0, oi: false, fromDate, toDate });
}

/** Today's 5-minute candles for an index (empty outside trading days). */
export async function intradayCandles(securityId: number, now = Date.now(), minutes = 5): Promise<{ ts: string; close: number }[]> {
  const day = istDate(now);
  const c = await dhanRequest<Candles>("intradayCandles", {
    securityId: String(securityId),
    exchangeSegment: "IDX_I",
    instrument: "INDEX",
    interval: String(minutes),
    oi: false,
    fromDate: `${day} 09:15:00`,
    toDate: `${day} 15:30:00`,
  });
  const ts = c.timestamp ?? [];
  const close = c.close ?? [];
  const out: { ts: string; close: number }[] = [];
  for (let i = 0; i < Math.min(ts.length, close.length); i++) if (istDate(ts[i] * 1000) === day && close[i] > 0) out.push({ ts: new Date(ts[i] * 1000).toISOString(), close: close[i] });
  return out;
}

interface Quote {
  last_price?: number;
}

/** Latest price of every index in one request (shared by all series in a refresh). */
async function indexQuotes(): Promise<Record<string, Quote>> {
  const ids = [...new Set(Object.values(DHAN_INDEX_IDS))].sort((a, b) => a - b);
  const r = await dhanRequest<{ data?: { IDX_I?: Record<string, Quote> } }>("marketQuoteOhlc", { IDX_I: ids });
  return r.data?.IDX_I ?? {};
}

/**
 * Today's latest value for an index, or null when there is none to add: the
 * market has not traded today (checked with NIFTY's intraday candles) or the
 * quote is missing.
 */
async function todayValue(securityId: number, now: number): Promise<Obs | null> {
  const nifty = await intradayCandles(DHAN_INDEX_IDS.NIFTY50, now).catch(() => []);
  if (!nifty.length) return null;
  const q = (await indexQuotes().catch(() => ({}) as Record<string, Quote>))[String(securityId)];
  const v = q?.last_price;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? { date: istDate(now), value: v } : null;
}

export async function fetchIndexSeries(sym: string, now = Date.now()): Promise<Obs[]> {
  const id = DHAN_INDEX_IDS[sym];
  if (id === undefined) throw new Error(`no Dhan security id for ${sym}`);
  const tomorrow = istDate(now + 86_400_000);
  const obs = candlesToObs(await historical(id, "2000-01-01", tomorrow));
  const today = await todayValue(id, now);
  if (today && (!obs.length || obs[obs.length - 1].date < today.date)) obs.push(today);
  return obs;
}

/** Latest index prices for intraday refreshes: [{sym, obs}] for today, empty when the market has not traded today. */
export async function fetchTodayIndexValues(now = Date.now()): Promise<{ sym: string; obs: Obs }[]> {
  const nifty = await intradayCandles(DHAN_INDEX_IDS.NIFTY50, now);
  if (!nifty.length) return [];
  const quotes = await indexQuotes();
  const out: { sym: string; obs: Obs }[] = [];
  for (const [sym, id] of Object.entries(DHAN_INDEX_IDS)) {
    const v = quotes[String(id)]?.last_price;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out.push({ sym, obs: { date: istDate(now), value: v } });
  }
  return out;
}

export async function fetchChain(underlying: string, scope: "full" | "near" = "full", now = Date.now()): Promise<OptionChainSnapshot | null> {
  const id = DHAN_UNDERLYING_IDS[underlying];
  if (id === undefined) return null;
  const list = await dhanRequest<{ data?: string[] }>("expiryList", { UnderlyingScrip: id, UnderlyingSeg: "IDX_I" });
  const all = (list.data ?? []).filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e));
  const labelled = classifyExpiries(all, istDate(now));
  const wanted = scope === "near" ? labelled.filter((e) => e.kinds.includes("current")) : labelled;
  if (!wanted.length) return null;
  const lot = (await lotSizes())[underlying] ?? 1;
  const timestamp = istIso(now);
  let spot: number | null = null;
  const records: OptionRecord[] = [];
  for (const { expiry } of wanted) {
    // Intraday snapshots must be fresh: a cached copy would produce a zero-activity interval.
    const res = await dhanRequest<ChainResponse>("optionChain", { UnderlyingScrip: id, UnderlyingSeg: "IDX_I", Expiry: expiry }, scope === "near" ? { maxAgeMs: 0 } : {});
    spot ??= pos(res.data?.last_price);
    records.push(...chainToRecords(underlying, expiry, res, timestamp, lot));
  }
  if (spot === null || !records.length) return null;
  return { underlying, spot, timestamp, volumeUnit: "shares", records, source: "dhan", synthetic: false };
}

export const dhanProvider: MarketDataProvider = {
  name: "dhan",
  configured: () => dhanCredentials() !== null,
  supports: (def: SeriesDef) => def.key.startsWith("idx:") && DHAN_INDEX_IDS[def.sourceId] !== undefined,
  fetchSeries: (def: SeriesDef) => fetchIndexSeries(def.sourceId),
  fetchOptionChain: (underlying: string, scope?: "full" | "near") => fetchChain(underlying, scope),
  async fetchIntradayPrices(underlying: string) {
    const id = DHAN_UNDERLYING_IDS[underlying];
    if (id === undefined) return [];
    return (await intradayCandles(id, Date.now(), 5)).map((c) => ({ ts: c.ts, value: c.close }));
  },
  async fetchTodayValues() {
    return (await fetchTodayIndexValues()).map(({ sym, obs }) => ({ key: `idx:${sym}`, obs }));
  },
  status: () => dhanStatus(),
  async probe() {
    await dhanRequest("marketQuoteOhlc", { IDX_I: [DHAN_INDEX_IDS.NIFTY50] }, { maxAgeMs: 0 });
  },
};
