/**
 * Twelve Data provider for global series (shared client: @/platform/data/twelvedata,
 * TWELVE_DATA_API_KEY). Only symbols the free Basic plan covers are mapped,
 * checked 2026-09-30 with the reference endpoints' `show_plan=true`:
 *
 * - No index is on the Basic plan (Hang Seng, SSE Composite, STOXX 600: Pro), and
 *   Russell 2000, MSCI EM and MSCI World are not in Twelve Data's index catalogue.
 *   Russell 2000, MSCI EM and MSCI World are filled from the US-listed ETF that
 *   tracks that exact index in its own currency (USD); series notes say so.
 * - Gold is the spot rate XAU/USD, served on a Basic key when tested on 2026-09-30
 *   (Twelve Data's pricing page lists commodities under Grow; if access is
 *   withdrawn the fetch fails visibly). Silver spot (XAG/USD) is refused on Basic
 *   ("available starting with the Grow plan"), so silver comes from the physically
 *   backed trust SLV, which tracks the LBMA Silver Price in USD.
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

/** Series key → Twelve Data symbol. XAU/USD trades around the clock, so today's UTC bar is never kept (no closeTime). */
export const TWELVE_DATA_SERIES: Record<string, TwelveDataQuery> = {
  "gl:RUT": arca("IWM"), // iShares Russell 2000 ETF
  "gl:MSCIEM": arca("EEM"), // iShares MSCI Emerging Markets ETF
  "gl:MSCIWORLD": arca("URTH"), // iShares MSCI World ETF
  "cmd:GOLD": { symbol: "XAU/USD" }, // gold spot, USD per troy ounce
  "cmd:SILVER": arca("SLV"), // iShares Silver Trust (LBMA Silver Price)
};

export const twelveDataProvider: MarketDataProvider = {
  name: "twelvedata",
  configured: twelveDataConfigured,
  supports: (def: SeriesDef) => Object.hasOwn(TWELVE_DATA_SERIES, def.key),
  fetchSeries: (def: SeriesDef): Promise<Obs[]> => fetchTwelveDataDaily(TWELVE_DATA_SERIES[def.key]),
};
