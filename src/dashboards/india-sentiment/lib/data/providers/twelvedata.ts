/**
 * Twelve Data provider for global series (shared client: @/platform/data/twelvedata,
 * TWELVE_DATA_API_KEY). Only symbols the free Basic plan covers are mapped,
 * checked 2026-09-30 with the reference endpoints' `show_plan=true`:
 *
 * - No index is on the Basic plan (Hang Seng, SSE Composite, STOXX 600: Pro), and
 *   Russell 2000, MSCI EM and MSCI World are not in Twelve Data's index catalogue.
 *   Russell 2000, MSCI EM and MSCI World are filled from the US-listed ETF that
 *   tracks that exact index in its own currency (USD); series notes say so.
 * - Gold and silver spot (XAU/USD, XAG/USD) need the Grow plan (commodities), so
 *   they come from the physically backed trusts GLD and SLV, which track the LBMA
 *   prices in USD.
 * - Hang Seng, SSE Composite and STOXX Europe 600 stay unfilled: no US-listed ETF
 *   tracks them, their home-market trackers (2800 on HKEX, EXSA on XETRA) need
 *   Grow/Pro, and ETFs on other indices (EWH, ASHR, VGK, …) are not substitutes.
 *
 * Each series is one /time_series request (1 credit) per refresh.
 */
import type { Obs, SeriesDef } from "../../types";
import { fetchTwelveDataDaily, twelveDataConfigured, type TwelveDataQuery } from "@/platform/data/twelvedata";
import type { MarketDataProvider } from "../provider";

/** NYSE Arca (MIC ARCX) listings, USD; regular session closes 16:00 New York time. */
const arca = (symbol: string): TwelveDataQuery => ({ symbol, micCode: "ARCX", currency: "USD", closeTime: "16:00" });

/** Series key → Twelve Data symbol. */
export const TWELVE_DATA_SERIES: Record<string, TwelveDataQuery> = {
  "gl:RUT": arca("IWM"), // iShares Russell 2000 ETF
  "gl:MSCIEM": arca("EEM"), // iShares MSCI Emerging Markets ETF
  "gl:MSCIWORLD": arca("URTH"), // iShares MSCI World ETF
  "cmd:GOLD": arca("GLD"), // SPDR Gold Shares (LBMA Gold Price PM)
  "cmd:SILVER": arca("SLV"), // iShares Silver Trust (LBMA Silver Price)
};

export const twelveDataProvider: MarketDataProvider = {
  name: "twelvedata",
  configured: twelveDataConfigured,
  supports: (def: SeriesDef) => Object.hasOwn(TWELVE_DATA_SERIES, def.key),
  fetchSeries: (def: SeriesDef): Promise<Obs[]> => fetchTwelveDataDaily(TWELVE_DATA_SERIES[def.key]),
};
