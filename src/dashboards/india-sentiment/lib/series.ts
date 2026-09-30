/**
 * Every upstream series used by the India Market Sentiment Terminal.
 *
 * - `fred`: fetched automatically from FRED (free, official sources).
 * - `market`: NSE/BSE market data (indices, breadth, flows, derivatives) from a
 *   licensed provider or pushed via POST /api/india-sentiment/ingest. NSE data
 *   is never scraped.
 * - `manual`: low-frequency official releases (RBI, AMFI, MOSPI, SEBI, NSDL/CDSL,
 *   Ministry of Finance, CCIL) pushed via the same ingestion endpoint.
 * - `derived`: computed by this app from ingested option chains.
 *
 * Unavailable series are shown as UNAVAILABLE and lower Model Confidence; they are never estimated.
 */
import type { Frequency, SeriesDef } from "./types";

const NSE = "NSE (licensed provider / ingestion)";
const BREADTH = "Computed from Dhan daily candles of NSE mainboard stocks (or ingestion)";
const BREADTH_NOTE =
  "Universe: NSE mainboard equity shares (series EQ, BE, BZ; no SME, ETFs or debt), from split/bonus-adjusted Dhan daily candles; only NSE sessions with complete data are published and published values are never revised. History before the first run is reconstructed from stocks listed today, so companies delisted since then are missing (survivorship bias grows with age).";

const idx = (sym: string, title: string, source = NSE): SeriesDef => ({ key: `idx:${sym}`, title, source, kind: "market", sourceId: sym, frequency: "D", units: "index" });
const fred = (id: string, title: string, source: string, frequency: Frequency, units: string, notes?: string): SeriesDef => ({
  key: `fred:${id}`,
  title,
  source: `${source} (via FRED)`,
  kind: "fred",
  sourceId: id,
  frequency,
  units,
  url: `https://fred.stlouisfed.org/series/${id}`,
  notes,
});
const market = (key: string, title: string, source: string, frequency: Frequency, units: string, notes?: string): SeriesDef => ({ key, title, source, kind: "market", sourceId: key, frequency, units, notes });
const manual = (key: string, title: string, source: string, frequency: Frequency, units: string, notes?: string): SeriesDef => ({ key, title, source, kind: "manual", sourceId: key, frequency, units, notes });
const derived = (key: string, title: string, units: string): SeriesDef => ({ key, title, source: "Computed from ingested option chains", kind: "derived", sourceId: key, frequency: "D", units });

export const INDICES = [
  ["NIFTY50", "NIFTY 50"],
  ["NIFTYNEXT50", "NIFTY NEXT 50"],
  ["NIFTYMIDCAP100", "NIFTY MIDCAP 100"],
  ["NIFTYSMALLCAP100", "NIFTY SMALLCAP 100"],
  ["SENSEX", "S&P BSE SENSEX"],
  ["NIFTYBANK", "NIFTY BANK"],
  ["NIFTYIT", "NIFTY IT"],
  ["NIFTYAUTO", "NIFTY AUTO"],
  ["NIFTYMETAL", "NIFTY METAL"],
  ["NIFTYPHARMA", "NIFTY PHARMA"],
  ["NIFTYFMCG", "NIFTY FMCG"],
  ["NIFTYREALTY", "NIFTY REALTY"],
  ["NIFTYPSUBANK", "NIFTY PSU BANK"],
  ["NIFTYPVTBANK", "NIFTY PRIVATE BANK"],
  ["NIFTYFINSERVICE", "NIFTY FINANCIAL SERVICES"],
  ["NIFTYINFRA", "NIFTY INFRASTRUCTURE"],
] as const;

export type IndexSym = (typeof INDICES)[number][0];

/** Sector indices and the style group each represents for rotation analysis. */
export const SECTORS: { sym: IndexSym; group: "Cyclicals" | "Financials" | "Industrials" | "Materials" | "Technology" | "Consumer" | "Defensives" }[] = [
  { sym: "NIFTYAUTO", group: "Cyclicals" },
  { sym: "NIFTYREALTY", group: "Cyclicals" },
  { sym: "NIFTYBANK", group: "Financials" },
  { sym: "NIFTYPSUBANK", group: "Financials" },
  { sym: "NIFTYPVTBANK", group: "Financials" },
  { sym: "NIFTYFINSERVICE", group: "Financials" },
  { sym: "NIFTYINFRA", group: "Industrials" },
  { sym: "NIFTYMETAL", group: "Materials" },
  { sym: "NIFTYIT", group: "Technology" },
  { sym: "NIFTYFMCG", group: "Consumer" },
  { sym: "NIFTYPHARMA", group: "Defensives" },
];
export const RISK_ON_GROUPS = ["Cyclicals", "Financials", "Industrials", "Materials"] as const;
export const DEFENSIVE_SYMS: IndexSym[] = ["NIFTYPHARMA", "NIFTYFMCG"];

/** Underlyings whose option chains are analysed (others can be ingested and shown). */
export const OPTION_UNDERLYINGS = ["NIFTY", "BANKNIFTY", "FINNIFTY"] as const;

const optSeries = (u: string) => [
  derived(`opt:${u}:oi_pcr`, `${u} OI PCR (current expiry, ±window)`, "ratio"),
  derived(`opt:${u}:premium_pcr`, `${u} premium PCR (current expiry, ±window)`, "ratio"),
  derived(`opt:${u}:call_premium`, `${u} call premium traded`, "₹ Cr"),
  derived(`opt:${u}:put_premium`, `${u} put premium traded`, "₹ Cr"),
  derived(`opt:${u}:pressure`, `${u} net premium pressure`, "-1..1"),
  derived(`opt:${u}:writing_balance`, `${u} writing balance (put − call)`, "-1..1"),
  derived(`opt:${u}:atm_iv`, `${u} ATM IV`, "%"),
  derived(`opt:${u}:skew25d`, `${u} 25Δ IV skew (put − call)`, "vol pts"),
  derived(`opt:${u}:maxpain_dist`, `${u} spot vs max pain`, "%"),
  derived(`opt:${u}:later_positioning`, `${u} later-expiry positioning`, "0-100"),
];

export const SERIES: SeriesDef[] = [
  ...INDICES.map(([s, t]) => idx(s, t, s === "SENSEX" ? "BSE (licensed provider / ingestion)" : NSE)),
  idx("INDIAVIX", "India VIX"),

  // Breadth & internals (NSE universe)
  market("breadth:adv", "Advancing issues", BREADTH, "D", "count", `Stocks closing above their previous close. ${BREADTH_NOTE}`),
  market("breadth:dec", "Declining issues", BREADTH, "D", "count", `Stocks closing below their previous close. ${BREADTH_NOTE}`),
  market("breadth:adv_vol", "Advancing volume", BREADTH, "D", "shares", `Traded quantity of advancing stocks. ${BREADTH_NOTE}`),
  market("breadth:dec_vol", "Declining volume", BREADTH, "D", "shares", `Traded quantity of declining stocks. ${BREADTH_NOTE}`),
  market("breadth:up_value", "Traded value in advancing stocks", NSE, "D", "₹ Cr", "Traded value is not in daily candles, so it is never estimated: ingestion only."),
  market("breadth:down_value", "Traded value in declining stocks", NSE, "D", "₹ Cr", "Traded value is not in daily candles, so it is never estimated: ingestion only."),
  market("breadth:new_high", "New 52-week highs", BREADTH, "D", "count", `Day's high above the stock's highest high of the preceding 52 weeks; stocks listed for under 52 weeks are not counted. ${BREADTH_NOTE}`),
  market("breadth:new_low", "New 52-week lows", BREADTH, "D", "count", `Day's low below the stock's lowest low of the preceding 52 weeks; stocks listed for under 52 weeks are not counted. ${BREADTH_NOTE}`),
  market("breadth:pct_above_20", "% of stocks above 20DMA", BREADTH, "D", "%", `Close above the simple average of the last 20 closes, among stocks with ≥ 20 sessions. ${BREADTH_NOTE}`),
  market("breadth:pct_above_50", "% of stocks above 50DMA", BREADTH, "D", "%", `Close above the simple average of the last 50 closes, among stocks with ≥ 50 sessions. ${BREADTH_NOTE}`),
  market("breadth:pct_above_100", "% of stocks above 100DMA", BREADTH, "D", "%", `Close above the simple average of the last 100 closes, among stocks with ≥ 100 sessions. ${BREADTH_NOTE}`),
  market("breadth:pct_above_200", "% of stocks above 200DMA", BREADTH, "D", "%", `Close above the simple average of the last 200 closes, among stocks with ≥ 200 sessions. ${BREADTH_NOTE}`),
  market("flow:fii_cash", "FII/FPI net cash-market flow", "NSE / NSDL (FPI)", "D", "₹ Cr"),
  market("flow:dii_cash", "DII net cash-market flow", NSE, "D", "₹ Cr"),
  market("flow:fii_idx_fut_long", "FII index futures long OI", "NSE participant-wise OI", "D", "contracts"),
  market("flow:fii_idx_fut_short", "FII index futures short OI", "NSE participant-wise OI", "D", "contracts"),
  market("flow:fii_idx_opt_net", "FII index options net OI (long calls + short puts − short calls − long puts)", "NSE participant-wise OI", "D", "contracts"),
  market("flow:fii_debt", "FPI net debt flow", "NSDL (FPI)", "D", "₹ Cr"),

  // Option-chain aggregates
  ...OPTION_UNDERLYINGS.flatMap(optSeries),

  // Currency
  market("fx:USDINR", "USD/INR (market)", "FBIL / licensed provider", "D", "INR per USD"),
  fred("DEXINUS", "USD/INR (Fed H.10 noon buying rate)", "Board of Governors of the Federal Reserve System", "D", "INR per USD"),
  fred("DTWEXBGS", "Nominal broad US dollar index", "Board of Governors of the Federal Reserve System", "D", "index"),
  fred("TRESEGINM052N", "India total reserves excluding gold", "International Monetary Fund", "M", "USD mn"),
  manual("rbi:forex_reserves", "India forex reserves (weekly)", "Reserve Bank of India", "W", "USD bn"),

  // Rates, bonds, liquidity, credit
  market("gsec:2y", "India 2Y G-Sec yield", "CCIL / FBIL", "D", "%"),
  market("gsec:5y", "India 5Y G-Sec yield", "CCIL / FBIL", "D", "%"),
  market("gsec:10y", "India 10Y G-Sec yield", "CCIL / FBIL", "D", "%"),
  fred("INDIRLTLT01STM", "India long-term government bond yield (monthly)", "OECD Main Economic Indicators", "M", "%"),
  fred("INDIR3TIB01STM", "India 3-month interbank rate (monthly)", "OECD Main Economic Indicators", "M", "%"),
  manual("rbi:repo", "RBI policy repo rate", "Reserve Bank of India", "D", "%"),
  manual("rbi:call_money", "Weighted average call money rate", "Reserve Bank of India", "D", "%"),
  manual("rbi:system_liquidity", "System liquidity (net LAF, + = surplus)", "Reserve Bank of India", "D", "₹ Cr"),
  manual("rbi:govt_cash", "Government cash balance with RBI", "Reserve Bank of India", "W", "₹ Cr"),
  manual("rbi:cp_3m", "3M commercial paper rate", "Reserve Bank of India / FBIL", "W", "%"),
  manual("rbi:cd_3m", "3M certificate of deposit rate", "Reserve Bank of India / FBIL", "W", "%"),
  manual("rbi:bank_credit_yoy", "Scheduled commercial bank credit growth", "Reserve Bank of India", "W", "% YoY"),
  manual("rbi:deposit_yoy", "Scheduled commercial bank deposit growth", "Reserve Bank of India", "W", "% YoY"),
  manual("rbi:credit_deposit_ratio", "Credit/deposit ratio", "Reserve Bank of India", "W", "%"),
  manual("rbi:gnpa", "Gross NPA ratio, scheduled commercial banks", "Reserve Bank of India (FSR)", "Q", "%"),
  market("credit:aaa_spread", "AAA corporate bond spread (3–5Y) over G-Sec", "FIMMDA / CCIL (licensed)", "D", "bps"),
  market("credit:aa_spread", "AA corporate bond spread (3–5Y) over G-Sec", "FIMMDA / CCIL (licensed)", "D", "bps"),

  // Global
  fred("SP500", "S&P 500", "S&P Dow Jones Indices", "D", "index"),
  fred("NASDAQCOM", "Nasdaq Composite", "Nasdaq OMX", "D", "index"),
  fred("NIKKEI225", "Nikkei 225", "Nikkei Industry Research Institute", "D", "index"),
  fred("VIXCLS", "CBOE VIX", "Chicago Board Options Exchange", "D", "index"),
  fred("BAMLH0A0HYM2", "US high-yield OAS", "ICE Data Indices", "D", "%"),
  fred("BAMLEMCBPIOAS", "Emerging-markets corporate OAS", "ICE Data Indices", "D", "%"),
  fred("DGS10", "US 10Y Treasury yield", "Board of Governors of the Federal Reserve System", "D", "%"),
  fred("DGS2", "US 2Y Treasury yield", "Board of Governors of the Federal Reserve System", "D", "%"),
  market("gl:RUT", "Russell 2000", "FTSE Russell (licensed provider)", "D", "index"),
  market("gl:HSI", "Hang Seng", "Hang Seng Indexes (licensed provider)", "D", "index"),
  market("gl:SHCOMP", "Shanghai Composite", "SSE (licensed provider)", "D", "index"),
  market("gl:STOXX600", "STOXX Europe 600", "STOXX (licensed provider)", "D", "index"),
  market("gl:MSCIEM", "MSCI Emerging Markets", "MSCI (licensed provider)", "D", "index"),
  market("gl:MSCIWORLD", "MSCI World", "MSCI (licensed provider)", "D", "index"),

  // Commodities
  fred("DCOILBRENTEU", "Brent crude", "U.S. Energy Information Administration", "D", "USD/bbl"),
  fred("DCOILWTICO", "WTI crude", "U.S. Energy Information Administration", "D", "USD/bbl"),
  fred("DHHNGSP", "Henry Hub natural gas", "U.S. Energy Information Administration", "D", "USD/MMBtu"),
  fred("PCOPPUSDM", "Copper", "International Monetary Fund", "M", "USD/t"),
  fred("PALUMUSDM", "Aluminium", "International Monetary Fund", "M", "USD/t"),
  market("cmd:GOLD", "Gold", "LBMA / MCX (licensed provider)", "D", "USD/oz"),
  market("cmd:SILVER", "Silver", "LBMA / MCX (licensed provider)", "D", "USD/oz"),
  manual("cmd:STEEL", "Domestic HRC steel price", "Joint Plant Committee (Ministry of Steel)", "M", "₹/t"),

  // Valuation & earnings
  market("val:nifty_pe", "NIFTY 50 trailing P/E", NSE, "D", "x"),
  market("val:nifty_fwd_pe", "NIFTY 50 forward P/E", "Licensed consensus provider", "D", "x"),
  market("val:nifty_pb", "NIFTY 50 P/B", NSE, "D", "x"),
  manual("earn:nifty_eps", "NIFTY 50 trailing EPS", "NSE / licensed provider", "Q", "₹"),
  market("earn:nifty_fwd_eps", "NIFTY 50 12M forward EPS", "Licensed consensus provider", "W", "₹"),
  manual("earn:upgrades", "NIFTY 50 EPS upgrades (month)", "Licensed consensus provider", "M", "count"),
  manual("earn:downgrades", "NIFTY 50 EPS downgrades (month)", "Licensed consensus provider", "M", "count"),
  manual("earn:surprise", "Aggregate earnings surprise (quarter)", "Licensed consensus provider", "Q", "%"),

  // Macro
  fred("INDPROINDMISMEI", "India industrial production", "OECD Main Economic Indicators", "M", "index"),
  fred("INDCPIALLMINMEI", "India CPI (all items)", "OECD Main Economic Indicators", "M", "index"),
  fred("XTEXVA01INM667S", "India exports (value)", "OECD Main Economic Indicators", "M", "USD"),
  fred("NGDPRNSAXDCINQ", "India real GDP", "International Monetary Fund", "Q", "INR"),
  manual("macro:cpi_yoy", "CPI inflation (MOSPI)", "MOSPI", "M", "% YoY"),
  manual("macro:core_cpi_yoy", "Core CPI inflation", "MOSPI", "M", "% YoY"),
  manual("macro:wpi_yoy", "WPI inflation", "Office of the Economic Adviser (DPIIT)", "M", "% YoY"),
  manual("macro:iip_yoy", "IIP growth (MOSPI)", "MOSPI", "M", "% YoY"),
  manual("macro:pmi_mfg", "Manufacturing PMI", "S&P Global (licensed)", "M", "index"),
  manual("macro:pmi_services", "Services PMI", "S&P Global (licensed)", "M", "index"),
  manual("macro:gst", "GST collections", "Ministry of Finance", "M", "₹ Cr"),
  manual("macro:trade_deficit", "Merchandise trade deficit", "Ministry of Commerce", "M", "USD bn"),
  manual("macro:current_account", "Current account balance", "Reserve Bank of India", "Q", "% of GDP"),
  manual("macro:fiscal_deficit", "Central fiscal deficit (FYTD, annualised)", "Controller General of Accounts", "M", "% of GDP"),
  manual("macro:consumer_confidence", "Consumer confidence (current situation index)", "RBI Consumer Confidence Survey", "Q", "index"),

  // Retail / MF / IPO
  manual("retail:mf_equity_inflow", "Net equity mutual fund inflows", "AMFI", "M", "₹ Cr"),
  manual("retail:sip", "SIP contributions", "AMFI", "M", "₹ Cr"),
  manual("retail:etf_flow", "Net ETF inflows", "AMFI", "M", "₹ Cr"),
  manual("retail:demat_adds", "New demat accounts", "NSDL / CDSL", "M", "mn"),
  manual("retail:fo_traders", "Unique F&O traders", "NSE / SEBI", "M", "mn"),
  manual("retail:ipo_count", "Mainboard IPOs", "SEBI / NSE / BSE", "M", "count"),
  manual("retail:sme_ipo_count", "SME IPOs", "NSE Emerge / BSE SME", "M", "count"),
  manual("retail:ipo_subscription", "Average IPO subscription", "NSE / BSE", "M", "x"),
  manual("retail:ipo_listing_gain", "Average IPO listing-day gain", "NSE / BSE", "M", "%"),
];

export const SERIES_BY_KEY: Record<string, SeriesDef> = Object.fromEntries(SERIES.map((s) => [s.key, s]));

/** Pairs of independent sources for the same quantity; disagreement lowers Model Confidence. */
export const CROSS_CHECKS: { name: string; a: string; b: string; tolerance: number; mode: "pct" | "abs"; maxAgeDays: number }[] = [
  { name: "USD/INR", a: "fx:USDINR", b: "fred:DEXINUS", tolerance: 0.75, mode: "pct", maxAgeDays: 7 },
  { name: "India 10Y G-Sec", a: "gsec:10y", b: "fred:INDIRLTLT01STM", tolerance: 0.3, mode: "abs", maxAgeDays: 70 },
];
