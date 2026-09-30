/**
 * Market-data provider interface. NSE/BSE data (indices, breadth, flows,
 * option chains) must come from a licensed market-data API — never scraping.
 *
 * Bundled: Dhan (providers/dhan.ts, DHAN_ACCESS_TOKEN + DHAN_CLIENT_ID; data
 * endpoints only) and Twelve Data for global ETF proxies and precious metals
 * (providers/twelvedata.ts, TWELVE_DATA_API_KEY). To connect another vendor
 * (e.g. Upstox, Kite Connect, Angel One SmartAPI, TrueData, Global Datafeeds):
 *   1. implement `MarketDataProvider` in providers/<vendor>.ts, reading its
 *      credentials from server-side environment variables only;
 *   2. add it to `PROVIDERS` below.
 * Anything a provider does not supply can be pushed with
 * POST /api/india-sentiment/ingest (ADMIN_TOKEN), e.g. from a scheduled script.
 */
import type { Obs, OptionChainSnapshot, SeriesDef } from "../types";
import { dhanProvider } from "./providers/dhan";
import { twelveDataProvider } from "./providers/twelvedata";

/** Health of a provider's credentials, for the UI and the demo-data fallback. */
export interface ProviderStatus {
  configured: boolean;
  state: "not_configured" | "unknown" | "ok" | "expired" | "invalid" | "not_subscribed" | "unreachable";
  expiresAt: string | null;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  requestsToday: number;
}

export interface MarketDataProvider {
  /** Short id recorded as the series origin, e.g. "upstox". */
  name: string;
  /** True when its credentials are present in the environment. */
  configured(): boolean;
  supports(def: SeriesDef): boolean;
  /** Full history (or as much as the vendor allows) for one series. */
  fetchSeries(def: SeriesDef): Promise<Obs[]>;
  /** Latest option chain for an underlying: all analysed expiries ("full") or the current expiry only ("near", for intraday refreshes). */
  fetchOptionChain?(underlying: string, scope?: "full" | "near"): Promise<OptionChainSnapshot | null>;
  /** Today's intraday prices of an option underlying (e.g. 5-minute closes). */
  fetchIntradayPrices?(underlying: string): Promise<{ ts: string; value: number }[]>;
  /** Latest price of every supported index for today's observation (empty when the market has not traded today). */
  fetchTodayValues?(): Promise<{ key: string; obs: Obs }[]>;
  status?(): ProviderStatus;
  /** One cheap uncached request to re-check credentials after a failure. */
  probe?(): Promise<void>;
}

/** Registered market-data providers, in priority order. */
export const PROVIDERS: MarketDataProvider[] = [dhanProvider, twelveDataProvider];

export function providerFor(def: SeriesDef): MarketDataProvider | null {
  return PROVIDERS.find((p) => p.configured() && p.supports(def)) ?? null;
}
