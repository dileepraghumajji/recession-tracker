import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBisSeries, parseBisCsv, parseCsv } from "./bis";

// Real responses of https://stats.bis.org/api/v1/data/WS_CBPOL/D.IN/all (SDMX-CSV, full detail), saved 2026-09-30.
const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, "__fixtures__", name), "utf8");
const DEC_2025 = fixture("bis-cbpol-d-in-2025-12.csv");
const APR_2001 = fixture("bis-cbpol-d-in-2001-04.csv");
const expect_ = { freq: "D", refArea: "IN", unitMeasure: "368", unitMult: "0" };

describe("parseCsv", () => {
  it("handles quoted fields with commas, doubled quotes and CRLF", () => {
    expect(parseCsv('a,b,c\r\n1,"x, ""y""",3\r\n')).toEqual([
      ["a", "b", "c"],
      ["1", 'x, "y"', "3"],
    ]);
  });
});

describe("parseBisCsv (RBI repo rate via BIS)", () => {
  it("reads the December 2025 cut to 5.25% on its effective date and skips NaN days without filling them", () => {
    const obs = parseBisCsv(DEC_2025, { expect: expect_ });
    expect(obs.find((o) => o.date === "2025-12-04")?.value).toBe(5.5);
    expect(obs.find((o) => o.date === "2025-12-05")?.value).toBe(5.25);
    // BIS writes NaN for 30 Nov, 7, 13 and 14 Dec 2025: absent, not carried forward.
    for (const d of ["2025-11-30", "2025-12-07", "2025-12-13", "2025-12-14"]) expect(obs.some((o) => o.date === d)).toBe(false);
    expect(obs).toHaveLength(17);
    expect(obs.map((o) => o.date)).toEqual([...obs.map((o) => o.date)].sort());
  });

  it("drops the Bank Rate before 3 Apr 2001, when the repo rate became the policy rate", () => {
    expect(parseBisCsv(APR_2001, { expect: expect_ })[0]).toEqual({ date: "2001-03-29", value: 7 });
    expect(parseBisCsv(APR_2001, { expect: expect_, startPeriod: "2001-04-03" })).toEqual([
      { date: "2001-04-03", value: 8.5 },
      { date: "2001-04-04", value: 8.5 },
    ]);
  });

  it("rejects rows in another unit, unit multiplier, frequency or country", () => {
    expect(() => parseBisCsv(DEC_2025.replace(",5.25,368,0,", ",5.25,369,0,"), { expect: expect_ })).toThrow(/2025-12-05: unit 369/);
    expect(() => parseBisCsv(DEC_2025.replace(",5.25,368,0,", ",5.25,368,3,"), { expect: expect_ })).toThrow(/×10\^3/);
    expect(() => parseBisCsv(DEC_2025, { expect: { ...expect_, refArea: "US" } })).toThrow(/unexpected series D.IN/);
  });

  it("rejects a non-numeric value and a missing column instead of guessing", () => {
    expect(() => parseBisCsv(DEC_2025.replace("2025-12-05,5.25,", "2025-12-05,5.25%,"), { expect: expect_ })).toThrow(/invalid value "5.25%"/);
    expect(() => parseBisCsv(DEC_2025.replace("UNIT_MULT", "UNIT_X"), { expect: expect_ })).toThrow(/no UNIT_MULT column/);
    expect(() => parseBisCsv("", { expect: expect_ })).toThrow(/empty/);
  });
});

describe("fetchBisSeries", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests SDMX-CSV for the series from startPeriod", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(DEC_2025, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const obs = await fetchBisSeries({ flow: "WS_CBPOL", key: "D.IN", startPeriod: "2001-04-03", expect: expect_ });
    expect(obs).toHaveLength(17);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://stats.bis.org/api/v1/data/WS_CBPOL/D.IN/all?startPeriod=2001-04-03");
    expect((init.headers as Record<string, string>).Accept).toBe("application/vnd.sdmx.data+csv;version=1.0.0");
  });

  it("reports BIS's 404 'no data' answer as an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<message:Error/>", { status: 404 })));
    await expect(fetchBisSeries({ flow: "WS_CBPOL", key: "D.IN", expect: expect_ })).rejects.toThrow(/BIS WS_CBPOL\/D.IN: HTTP 404/);
  });
});
