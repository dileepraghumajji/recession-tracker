/**
 * Market-data provider interface. NSE/BSE data (indices, breadth, flows,
 * option chains) must come from a licensed market-data API — never scraping.
 *
 * To connect a vendor (e.g. a broker API such as Upstox, Kite Connect, Angel One
 * SmartAPI, Dhan, or a data vendor such as TrueData / Global Datafeeds):
 *   1. implement `MarketDataProvider` in providers/<vendor>.ts, reading its
 *      credentials from server-side environment variables only;
 *   2. add it to `PROVIDERS` below.
 * Anything a provider does not supply can be pushed with
 * POST /api/india-sentiment/ingest (ADMIN_TOKEN), e.g. from a scheduled script.
 */
import type { Obs, OptionChainSnapshot, SeriesDef } from "../types";

export interface MarketDataProvider {
  /** Short id recorded as the series origin, e.g. "upstox". */
  name: string;
  /** True when its credentials are present in the environment. */
  configured(): boolean;
  supports(def: SeriesDef): boolean;
  /** Full history (or as much as the vendor allows) for one series. */
  fetchSeries(def: SeriesDef): Promise<Obs[]>;
  /** Latest full option chain (all expiries) for an underlying. */
  fetchOptionChain?(underlying: string): Promise<OptionChainSnapshot | null>;
}

/** Registered market-data providers, in priority order. None are bundled: see the header comment. */
export const PROVIDERS: MarketDataProvider[] = [];

export function providerFor(def: SeriesDef): MarketDataProvider | null {
  return PROVIDERS.find((p) => p.configured() && p.supports(def)) ?? null;
}
