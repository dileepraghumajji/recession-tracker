/**
 * The only DhanHQ v2 endpoints this app may call: read-only market DATA.
 * The access token has full trading scope, so order / portfolio / funds
 * endpoints must never be reachable from this code. dhan-client.ts builds URLs
 * exclusively from this table, and dhan.test.ts fails if any other Dhan path
 * (or any order-related path) appears in the source.
 *
 * Verified against https://dhanhq.co/docs/v2/ (option-chain, market-quote,
 * historical-data, instruments, annexure; checked 2026-09-30).
 */
export const DHAN_BASE_URL = "https://api.dhan.co/v2";

/** Rate buckets from the docs: option chain 1 unique request / 3 s; quote APIs 1 / s; data APIs 5 / s and 100,000 / day. */
export type DhanBucket = "optionchain" | "quote" | "data";

export interface DhanEndpoint {
  path: string;
  method: "POST" | "GET";
  bucket: DhanBucket;
  /** Server-side response cache lifetime. */
  cacheMs: number;
}

export const DHAN_ENDPOINTS = {
  /** POST {UnderlyingScrip, UnderlyingSeg, Expiry} → full chain for one expiry. */
  optionChain: { path: "/optionchain", method: "POST", bucket: "optionchain", cacheMs: 60_000 },
  /** POST {UnderlyingScrip, UnderlyingSeg} → active expiries (YYYY-MM-DD). */
  expiryList: { path: "/optionchain/expirylist", method: "POST", bucket: "optionchain", cacheMs: 6 * 3600_000 },
  /** POST {<segment>: [securityId…]} (≤ 1000 instruments) → LTP + day OHLC (close = previous close). */
  marketQuoteOhlc: { path: "/marketfeed/ohlc", method: "POST", bucket: "quote", cacheMs: 15_000 },
  /** POST {securityId, exchangeSegment, instrument, fromDate, toDate (exclusive)} → daily candles since inception. */
  historicalDaily: { path: "/charts/historical", method: "POST", bucket: "data", cacheMs: 15 * 60_000 },
  /** POST {securityId, exchangeSegment, instrument, interval 1|5|15|25|60, fromDate, toDate} → minute candles (≤ 90 days). */
  intradayCandles: { path: "/charts/intraday", method: "POST", bucket: "data", cacheMs: 60_000 },
  /** GET → instrument list CSV for one exchange segment (used only for option lot sizes). */
  instrumentsNseFno: { path: "/instrument/NSE_FNO", method: "GET", bucket: "data", cacheMs: 24 * 3600_000 },
} as const satisfies Record<string, DhanEndpoint>;

export type DhanEndpointName = keyof typeof DHAN_ENDPOINTS;

/** Minimum spacing between requests per bucket (with a safety margin over the documented limits). */
export const DHAN_MIN_INTERVAL_MS: Record<DhanBucket, number> = { optionchain: 3_100, quote: 1_050, data: 220 };
export const DHAN_DATA_DAILY_CAP = 100_000;

/** Path prefixes of Dhan trading/account endpoints. None may ever be called. */
export const DHAN_FORBIDDEN_PATH_PREFIXES = [
  "/orders",
  "/super/orders",
  "/forever",
  "/alerts/orders",
  "/trades",
  "/positions",
  "/holdings",
  "/killswitch",
  "/pnlExit",
  "/edis",
  "/fundlimit",
  "/margincalculator",
  "/ledger",
] as const;

export function isAllowedDhanPath(path: string): boolean {
  return Object.values(DHAN_ENDPOINTS).some((e) => e.path === path);
}
