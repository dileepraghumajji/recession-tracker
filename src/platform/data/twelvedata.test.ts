import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dailyObs, fetchTwelveDataDaily, resetTwelveDataThrottle, TWELVE_DATA_MIN_INTERVAL_MS } from "./twelvedata";

// 2026-09-30 is a Wednesday; New York is on EDT (UTC-4).
const BEFORE_CLOSE = Date.parse("2026-09-30T18:00:00Z"); // 14:00 New York
const AFTER_CLOSE = Date.parse("2026-09-30T20:30:00Z"); // 16:30 New York

const bars = [
  { datetime: "2026-09-30", close: "221.50" },
  { datetime: "2026-09-29", close: "220.10" },
  { datetime: "2026-09-28", close: "0" },
  { datetime: "2026-09-25", close: "not a number" },
  { datetime: "2026-09-24", close: "218.00" },
];
const body = (values = bars, meta: Record<string, string> = { symbol: "IWM", currency: "USD", exchange_timezone: "America/New_York", mic_code: "ARCX" }) => ({ meta, values, status: "ok" });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

describe("dailyObs", () => {
  it("keeps valid positive closes in date order and drops invalid ones (never fills)", () => {
    expect(dailyObs(bars, { timeZone: "America/New_York", closeTime: "16:00", now: AFTER_CLOSE })).toEqual([
      { date: "2026-09-24", value: 218 },
      { date: "2026-09-29", value: 220.1 },
      { date: "2026-09-30", value: 221.5 },
    ]);
  });

  it("drops today's bar until the session has closed in the exchange's time zone", () => {
    const before = dailyObs(bars, { timeZone: "America/New_York", closeTime: "16:00", now: BEFORE_CLOSE });
    expect(before.map((o) => o.date)).toEqual(["2026-09-24", "2026-09-29"]);
    // 01:00 UTC on Oct 1 is still Sep 30, 21:00 in New York: the Sep 30 bar is complete.
    const lateUtc = dailyObs(bars, { timeZone: "America/New_York", closeTime: "16:00", now: Date.parse("2026-10-01T01:00:00Z") });
    expect(lateUtc.at(-1)).toEqual({ date: "2026-09-30", value: 221.5 });
  });

  it("without a close time (24h markets) never keeps today's bar, and never keeps future dates", () => {
    const withFuture = [...bars, { datetime: "2026-10-01", close: "1" }];
    expect(dailyObs(withFuture, { timeZone: "UTC", now: AFTER_CLOSE }).map((o) => o.date)).toEqual(["2026-09-24", "2026-09-29"]);
  });
});

describe("fetchTwelveDataDaily (mocked fetch)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers({ now: AFTER_CLOSE });
    resetTwelveDataThrottle();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TWELVE_DATA_API_KEY", "secret-key");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });

  const run = async <T>(p: Promise<T>) => {
    const settled = p.then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, e }),
    );
    await vi.runAllTimersAsync();
    const r = await settled;
    if (!r.ok) throw r.e;
    return r.v;
  };

  it("requests split-adjusted daily history for the pinned listing and parses it", async () => {
    fetchMock.mockResolvedValueOnce(json(body()));
    const obs = await run(fetchTwelveDataDaily({ symbol: "IWM", micCode: "ARCX", currency: "USD", closeTime: "16:00" }));
    expect(obs).toEqual([
      { date: "2026-09-24", value: 218 },
      { date: "2026-09-29", value: 220.1 },
      { date: "2026-09-30", value: 221.5 },
    ]);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://api.twelvedata.com/time_series");
    expect(Object.fromEntries(url.searchParams)).toEqual({ symbol: "IWM", interval: "1day", outputsize: "5000", adjust: "splits", mic_code: "ARCX", apikey: "secret-key" });
  });

  it("reports Twelve Data's error message (e.g. a symbol outside the plan) without leaking the key", async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 403, message: "This symbol is available starting with Grow plan", status: "error" }, 403));
    const err = await run(fetchTwelveDataDaily({ symbol: "XAU/USD" })).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Twelve Data XAU/USD: 403: This symbol is available starting with Grow plan (symbol not included in this Twelve Data plan)");
    expect((err as Error).message).not.toContain("secret-key");
    expect(fetchMock).toHaveBeenCalledTimes(1); // a 4xx is not retried
  });

  it("treats an error body sent with HTTP 200 as an error", async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 400, message: "**symbol** not found: FOO", status: "error" }));
    await expect(run(fetchTwelveDataDaily({ symbol: "FOO" }))).rejects.toThrow("Twelve Data FOO: 400: **symbol** not found: FOO");
  });

  it("rejects a response for another listing or currency instead of storing it", async () => {
    fetchMock.mockResolvedValueOnce(json(body(bars, { symbol: "IWM", currency: "ARS", exchange_timezone: "America/Argentina/Buenos_Aires", mic_code: "XBUE" })));
    await expect(run(fetchTwelveDataDaily({ symbol: "IWM", micCode: "ARCX", currency: "USD", closeTime: "16:00" }))).rejects.toThrow("expected listing ARCX, got XBUE");
    fetchMock.mockResolvedValueOnce(json(body(bars, { symbol: "IWM", currency: "EUR", exchange_timezone: "America/New_York", mic_code: "ARCX" })));
    await expect(run(fetchTwelveDataDaily({ symbol: "IWM", micCode: "ARCX", currency: "USD", closeTime: "16:00" }))).rejects.toThrow("expected currency USD, got EUR");
  });

  it("spaces requests to stay within the free plan's 8 credits per minute", async () => {
    const at: number[] = [];
    fetchMock.mockImplementation(async () => {
      at.push(Date.now());
      return json(body());
    });
    await run(Promise.all(["IWM", "EEM", "URTH", "GLD", "SLV", "IWM", "EEM", "URTH", "GLD", "SLV"].map((symbol) => fetchTwelveDataDaily({ symbol, closeTime: "16:00" }))));
    expect(at).toHaveLength(10);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(TWELVE_DATA_MIN_INTERVAL_MS);
    // No 60-second window holds more than 8 requests.
    for (const t of at) expect(at.filter((x) => x >= t && x < t + 60_000).length).toBeLessThanOrEqual(8);
  });

  it("waits for the minute's credits to reset after a 429, then retries", async () => {
    const at: number[] = [];
    fetchMock.mockImplementation(async () => {
      at.push(Date.now());
      return at.length === 1 ? json({ code: 429, message: "You have run out of API credits for the current minute.", status: "error" }, 429) : json(body());
    });
    const obs = await run(fetchTwelveDataDaily({ symbol: "IWM", closeTime: "16:00" }));
    expect(obs).toHaveLength(3);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(20_000);
  });

  it("gives up after two retries when the key stays rate-limited, without a final pointless wait", async () => {
    fetchMock.mockImplementation(async () => json({ code: 429, message: "You have run out of API credits for the current minute.", status: "error" }, 429));
    const start = Date.now();
    await expect(run(fetchTwelveDataDaily({ symbol: "IWM" }))).rejects.toThrow("Twelve Data IWM: HTTP 429");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(Date.now() - start).toBe(20_000 + 40_000);
  });

  it("does not call the API without a key", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "");
    await expect(run(fetchTwelveDataDaily({ symbol: "IWM" }))).rejects.toThrow("TWELVE_DATA_API_KEY not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
