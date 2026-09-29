/**
 * Raw upstream series. Each entry is one API call. Official sources are used
 * wherever possible (Federal Reserve Board, BLS, BEA, Census, Chicago Fed, via
 * FRED's API which redistributes them with release metadata).
 *
 * Proprietary series (ISM, Conference Board, Goldman Sachs FCI, forward P/E) are
 * NOT scraped. ISM values can be loaded by the operator through the
 * authenticated manual-observations endpoint if they hold a licence.
 */
import type { SeriesDef } from "./types";

const FED_BOARD = "Board of Governors of the Federal Reserve System (via FRED)";
const BLS = "U.S. Bureau of Labor Statistics (via FRED)";
const BEA = "U.S. Bureau of Economic Analysis (via FRED)";
const CENSUS = "U.S. Census Bureau (via FRED)";
const DOL = "U.S. Employment and Training Administration (via FRED)";
const ICE = "ICE Data Indices, LLC (via FRED)";

function fred(
  key: string,
  sourceId: string,
  title: string,
  source: string,
  frequency: SeriesDef["frequency"],
  units: string,
  notes?: string,
): SeriesDef {
  return {
    key,
    provider: "fred",
    sourceId,
    title,
    source,
    frequency,
    units,
    url: `https://fred.stlouisfed.org/series/${sourceId}`,
    notes,
  };
}

function manual(key: string, title: string, source: string, frequency: SeriesDef["frequency"], units: string, notes: string): SeriesDef {
  return { key, provider: "manual", sourceId: key, title, source, frequency, units, notes };
}

export const SERIES: SeriesDef[] = [
  // --- Treasury curve (H.15) ---
  fred("DGS30", "DGS30", "30-Year Treasury Constant Maturity", FED_BOARD, "D", "%"),
  fred("DGS10", "DGS10", "10-Year Treasury Constant Maturity", FED_BOARD, "D", "%"),
  fred("DGS5", "DGS5", "5-Year Treasury Constant Maturity", FED_BOARD, "D", "%"),
  fred("DGS2", "DGS2", "2-Year Treasury Constant Maturity", FED_BOARD, "D", "%"),
  fred("DGS3MO", "DGS3MO", "3-Month Treasury Constant Maturity", FED_BOARD, "D", "%"),
  fred("DFF", "DFF", "Effective Federal Funds Rate", "Federal Reserve Bank of New York (via FRED)", "D", "%"),
  fred("DFII10", "DFII10", "10-Year TIPS (real) yield", FED_BOARD, "D", "%"),
  fred(
    "THREEFYTP10",
    "THREEFYTP10",
    "10-Year term premium (Kim-Wright model)",
    FED_BOARD,
    "D",
    "%",
    "Model-based estimate (Kim & Wright). Term premia are not directly observable; treat as an estimate.",
  ),
  fred("T5YIE", "T5YIE", "5-Year breakeven inflation", "Federal Reserve Bank of St. Louis (via FRED)", "D", "%"),
  fred("T10YIE", "T10YIE", "10-Year breakeven inflation", "Federal Reserve Bank of St. Louis (via FRED)", "D", "%"),

  // --- Credit ---
  fred("BAMLH0A0HYM2", "BAMLH0A0HYM2", "ICE BofA US High Yield OAS", ICE, "D", "%", "FRED redistributes only ~3 years of ICE history; percentiles use that window."),
  fred("BAMLC0A0CM", "BAMLC0A0CM", "ICE BofA US Corporate (IG) OAS", ICE, "D", "%", "FRED redistributes only ~3 years of ICE history."),
  fred("BAMLC0A4CBBB", "BAMLC0A4CBBB", "ICE BofA BBB US Corporate OAS", ICE, "D", "%", "FRED redistributes only ~3 years of ICE history."),
  fred("BAMLH0A3HYC", "BAMLH0A3HYC", "ICE BofA CCC & Lower US High Yield OAS", ICE, "D", "%", "FRED redistributes only ~3 years of ICE history."),
  fred("BAA10Y", "BAA10Y", "Moody's Baa corporate yield minus 10Y Treasury", "Moody's (via FRED)", "D", "%", "Long-history credit proxy (since 1986)."),

  // --- Labor ---
  fred("UNRATE", "UNRATE", "Unemployment rate", BLS, "M", "%"),
  fred("ICSA", "ICSA", "Initial jobless claims", DOL, "W", "claims"),
  fred("CCSA", "CCSA", "Continuing claims", DOL, "W", "claims"),
  fred("PAYEMS", "PAYEMS", "Total nonfarm payrolls", BLS, "M", "thousands"),
  fred("CES0500000003", "CES0500000003", "Average hourly earnings, total private", BLS, "M", "$/hour"),
  fred("JTSJOL", "JTSJOL", "JOLTS job openings", BLS, "M", "thousands"),
  fred("JTSQUR", "JTSQUR", "JOLTS quits rate", BLS, "M", "%"),

  // --- Activity ---
  manual("ISM_MFG_PMI", "ISM Manufacturing PMI", "Institute for Supply Management (licensed, manual load)", "M", "index", "ISM data is proprietary and is not redistributed by FRED. Load via POST /api/manual if licensed."),
  manual("ISM_MFG_NO", "ISM Manufacturing New Orders", "Institute for Supply Management (licensed, manual load)", "M", "index", "Proprietary - manual load only."),
  manual("ISM_MFG_EMP", "ISM Manufacturing Employment", "Institute for Supply Management (licensed, manual load)", "M", "index", "Proprietary - manual load only."),
  manual("ISM_SVC_PMI", "ISM Services PMI", "Institute for Supply Management (licensed, manual load)", "M", "index", "Proprietary - manual load only."),
  manual("ISM_SVC_NO", "ISM Services New Orders", "Institute for Supply Management (licensed, manual load)", "M", "index", "Proprietary - manual load only."),
  fred("PHILLY_MFG", "GACDFSA066MSFRBPHI", "Philadelphia Fed Manufacturing: current general activity", "Federal Reserve Bank of Philadelphia (via FRED)", "M", "diffusion index"),
  fred("EMPIRE_MFG", "GACDISA066MSFRBNY", "NY Fed Empire State Manufacturing: general business conditions", "Federal Reserve Bank of New York (via FRED)", "M", "diffusion index"),
  fred("INDPRO", "INDPRO", "Industrial production index", FED_BOARD, "M", "index 2017=100"),
  fred("RRSFS", "RRSFS", "Real retail and food services sales", CENSUS, "M", "millions 1982-84 $"),
  fred("PCEC96", "PCEC96", "Real personal consumption expenditures", BEA, "M", "billions chained 2017 $"),
  fred("GDPC1_GROWTH", "A191RL1Q225SBEA", "Real GDP growth (q/q annualised)", BEA, "Q", "% SAAR"),
  fred("GDPNOW", "GDPNOW", "Atlanta Fed GDPNow estimate", "Federal Reserve Bank of Atlanta (via FRED)", "Q", "% SAAR", "Nowcast for the current quarter; revised as data arrive."),

  // --- Housing ---
  fred("HOUST", "HOUST", "Housing starts", CENSUS, "M", "thousands SAAR"),
  fred("PERMIT", "PERMIT", "Building permits", CENSUS, "M", "thousands SAAR"),
  fred("EXHOSLUSM495S", "EXHOSLUSM495S", "Existing home sales", "National Association of Realtors (via FRED)", "M", "units SAAR", "NAR licenses a limited history window to FRED."),
  fred("HSN1F", "HSN1F", "New one-family houses sold", CENSUS, "M", "thousands SAAR"),
  fred("FIXHAI", "FIXHAI", "Housing affordability index (fixed)", "National Association of Realtors (via FRED)", "M", "index"),
  fred("MORTGAGE30US", "MORTGAGE30US", "30-year fixed mortgage rate", "Freddie Mac (via FRED)", "W", "%"),
  fred("MSACSR", "MSACSR", "Monthly supply of new houses", CENSUS, "M", "months"),
  fred("ACTLISCOUUS", "ACTLISCOUUS", "Active housing listings", "Realtor.com (via FRED)", "M", "listings"),

  // --- Inflation ---
  fred("CPIAUCSL", "CPIAUCSL", "CPI, all items", BLS, "M", "index"),
  fred("CPILFESL", "CPILFESL", "Core CPI (ex food & energy)", BLS, "M", "index"),
  fred("PCEPI", "PCEPI", "PCE price index", BEA, "M", "index"),
  fred("PCEPILFE", "PCEPILFE", "Core PCE price index", BEA, "M", "index"),
  fred("MICH", "MICH", "UMich 1-year inflation expectations", "University of Michigan (via FRED)", "M", "%"),

  // --- Commodities ---
  fred("DCOILWTICO", "DCOILWTICO", "WTI crude oil spot", "U.S. Energy Information Administration (via FRED)", "D", "$/bbl"),
  fred("DCOILBRENTEU", "DCOILBRENTEU", "Brent crude oil spot", "U.S. Energy Information Administration (via FRED)", "D", "$/bbl"),
  fred("DHHNGSP", "DHHNGSP", "Henry Hub natural gas spot", "U.S. Energy Information Administration (via FRED)", "D", "$/MMBtu"),
  fred("PCOPPUSDM", "PCOPPUSDM", "Global copper price", "International Monetary Fund (via FRED)", "M", "$/metric ton"),
  {
    key: "GOLD",
    provider: "twelvedata",
    sourceId: "XAU/USD",
    title: "Gold spot (XAU/USD)",
    source: "Twelve Data (market data API)",
    frequency: "D",
    units: "$/oz",
    url: "https://twelvedata.com",
    notes: "Requires TWELVE_DATA_API_KEY. FRED discontinued LBMA gold prices in 2022.",
  },

  // --- Equities ---
  fred("SP500", "SP500", "S&P 500 index", "S&P Dow Jones Indices (via FRED)", "D", "index", "FRED carries ~10 years of daily history."),
  fred("NASDAQ100", "NASDAQ100", "Nasdaq-100 index", "Nasdaq (via FRED)", "D", "index"),
  fred("VIXCLS", "VIXCLS", "CBOE Volatility Index (VIX)", "Chicago Board Options Exchange (via FRED)", "D", "index"),
  {
    key: "RUT_PROXY",
    provider: "twelvedata",
    sourceId: "IWM",
    title: "Russell 2000 (iShares IWM ETF proxy)",
    source: "Twelve Data (market data API)",
    frequency: "D",
    units: "$",
    url: "https://twelvedata.com",
    notes: "ETF proxy for the Russell 2000 - requires TWELVE_DATA_API_KEY. The index itself is not freely redistributed.",
  },

  // --- Financial conditions ---
  fred("NFCI", "NFCI", "Chicago Fed National Financial Conditions Index", "Federal Reserve Bank of Chicago (via FRED)", "W", "index (0 = average)"),
  fred("ANFCI", "ANFCI", "Chicago Fed Adjusted NFCI", "Federal Reserve Bank of Chicago (via FRED)", "W", "index (0 = average)"),
  fred("DTWEXBGS", "DTWEXBGS", "Nominal broad U.S. dollar index", FED_BOARD, "D", "index"),
  fred("DRTSCILM", "DRTSCILM", "SLOOS: net % of banks tightening C&I standards (large/mid firms)", FED_BOARD, "Q", "net %"),

  // --- Consumer ---
  fred("UMCSENT", "UMCSENT", "UMich consumer sentiment", "University of Michigan (via FRED)", "M", "index"),
  fred("OECD_CONF", "CSCICP03USM665S", "OECD consumer confidence (US, amplitude adjusted)", "OECD (via FRED)", "M", "index (100 = average)"),
  fred("DRCCLACBS", "DRCCLACBS", "Credit card delinquency rate (all commercial banks)", FED_BOARD, "Q", "%"),
  fred("DRCLACBS", "DRCLACBS", "Consumer loan delinquency rate (all commercial banks)", FED_BOARD, "Q", "%"),
  fred("TDSP", "TDSP", "Household debt service ratio", FED_BOARD, "Q", "% of disposable income"),
  fred("PSAVERT", "PSAVERT", "Personal saving rate", BEA, "M", "%"),
  fred("DSPIC96", "DSPIC96", "Real disposable personal income", BEA, "M", "billions chained 2017 $"),
];

export const SERIES_BY_KEY: Record<string, SeriesDef> = Object.fromEntries(SERIES.map((s) => [s.key, s]));
