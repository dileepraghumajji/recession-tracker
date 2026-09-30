import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SERIES_BY_KEY } from "../../series";
import { PROVIDERS, providerFor } from "../provider";
import { resetTwelveDataThrottle } from "@/platform/data/twelvedata";
import { TWELVE_DATA_SERIES, twelveDataProvider } from "./twelvedata";

const TARGETS = ["gl:RUT", "gl:HSI", "gl:SHCOMP", "gl:STOXX600", "gl:MSCIEM", "gl:MSCIWORLD", "cmd:GOLD", "cmd:SILVER"];
const ETF_PROXIES = { "gl:RUT": "IWM", "gl:MSCIEM": "EEM", "gl:MSCIWORLD": "URTH", "cmd:SILVER": "SLV" };
const FILLED = { ...ETF_PROXIES, "cmd:GOLD": "XAU/USD" };
const UNFILLED = ["gl:HSI", "gl:SHCOMP", "gl:STOXX600"];

describe("Twelve Data provider (India dashboard)", () => {
  beforeEach(() => vi.stubEnv("TWELVE_DATA_API_KEY", "secret-key"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fills only the series with a free-plan source: gold spot, and USD NYSE Arca ETFs for the rest", () => {
    expect(Object.fromEntries(Object.entries(TWELVE_DATA_SERIES).map(([k, q]) => [k, q.symbol]))).toEqual(FILLED);
    for (const k of Object.keys(ETF_PROXIES)) expect(TWELVE_DATA_SERIES[k], k).toMatchObject({ micCode: "ARCX", currency: "USD", closeTime: "16:00" });
    // A 24h market: no close time, so the current (incomplete) UTC day is never stored.
    expect(TWELVE_DATA_SERIES["cmd:GOLD"]).toEqual({ symbol: "XAU/USD" });
    for (const k of TARGETS) expect(twelveDataProvider.supports(SERIES_BY_KEY[k]), k).toBe(k in FILLED);
  });

  it("labels every proxy as an ETF proxy in the catalogue and explains every unfilled series", () => {
    for (const [key, symbol] of Object.entries(ETF_PROXIES)) {
      const d = SERIES_BY_KEY[key];
      expect(d.title, key).toContain(`${symbol} ETF proxy`);
      expect(d.notes, key).toMatch(/^ETF PROXY, not the /);
      expect(d.notes, key).toContain(`(${symbol})`);
      expect(d.units, key).toBe("USD (ETF price)");
    }
    expect(SERIES_BY_KEY["cmd:GOLD"]).toMatchObject({ title: "Gold spot (XAU/USD)", units: "USD/oz" });
    expect(SERIES_BY_KEY["cmd:GOLD"].notes).not.toContain("PROXY");
    for (const key of UNFILLED) {
      expect(SERIES_BY_KEY[key].notes, key).toMatch(/^Not filled automatically: .*A different index is never substituted\./);
      expect(SERIES_BY_KEY[key].units, key).toBe("index");
    }
  });

  it("is registered and chosen for these series only when TWELVE_DATA_API_KEY is set", () => {
    expect(PROVIDERS).toContain(twelveDataProvider);
    expect(providerFor(SERIES_BY_KEY["cmd:GOLD"])?.name).toBe("twelvedata");
    expect(providerFor(SERIES_BY_KEY["gl:HSI"])).toBeNull();
    vi.stubEnv("TWELVE_DATA_API_KEY", "");
    expect(twelveDataProvider.configured()).toBe(false);
    expect(providerFor(SERIES_BY_KEY["cmd:GOLD"])).toBeNull();
  });

  it("fetches the mapped symbol for a series", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-09-30T21:00:00Z") });
    resetTwelveDataThrottle();
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({
        meta: { symbol: "EEM", currency: "USD", exchange_timezone: "America/New_York", mic_code: "ARCX" },
        values: [
          { datetime: "2026-09-30", close: "48.12" },
          { datetime: "2026-09-29", close: "47.90" },
        ],
        status: "ok",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = twelveDataProvider.fetchSeries(SERIES_BY_KEY["gl:MSCIEM"]);
    await vi.runAllTimersAsync();
    expect(await p).toEqual([
      { date: "2026-09-29", value: 47.9 },
      { date: "2026-09-30", value: 48.12 },
    ]);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("symbol")).toBe("EEM");
    expect(url.searchParams.get("mic_code")).toBe("ARCX");
  });
});
