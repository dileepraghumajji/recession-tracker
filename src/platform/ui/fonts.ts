import localFont from "next/font/local";

/**
 * Geist (sans) is preloaded with `display: optional`: it is used when it arrives
 * within the first ~100 ms (always once cached), otherwise the metric-matched
 * fallback stays for that page view. This keeps text from re-painting late,
 * which on slow mobile connections pushed LCP past 3 s. Geist Mono is used
 * sparingly (tickers, codes, wordmark), so it isn't preloaded.
 */
export const geistSans = localFont({
  src: "../../../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "optional",
  adjustFontFallback: "Arial",
});

export const geistMono = localFont({
  src: "../../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});
