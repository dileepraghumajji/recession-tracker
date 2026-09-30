import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => undefined }));

import { classifyDhanError, dhanCredentials, dhanRequest, dhanStatus, dhanUnusable, resetDhanState, setDhanFetch } from "./dhan-client";
import { DHAN_BASE_URL, DHAN_ENDPOINTS, DHAN_FORBIDDEN_PATH_PREFIXES, isAllowedDhanPath } from "./dhan-endpoints";
import { candlesToObs, chainToRecords, fetchChain, fetchIndexSeries, istDate, istIso, marketMaybeOpen, parseLotSizes } from "./dhan";

const SRC = path.resolve(__dirname, "../../../../..");
const ROOT = path.resolve(SRC, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (f === "node_modules" || f.startsWith(".")) return [];
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mts|js|mjs)$/.test(f) ? [p] : [];
  });
}

/** JWT-shaped test token (header.payload.signature) with the given claims. */
function token(claims: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS512" })}.${b64(claims)}.sig`;
}

const future = Math.floor(Date.now() / 1000) + 3600;

describe("Dhan: data endpoints only (the token has full trading scope)", () => {
  it("no order / portfolio / funds endpoint path appears anywhere in the code", () => {
    const pattern = new RegExp(`["'\`](?:https?://api\\.dhan\\.co/v2)?(?:${DHAN_FORBIDDEN_PATH_PREFIXES.map((p) => p.replace(/\//g, "\\/")).join("|")})\\b`);
    const offenders = [...walk(SRC), ...walk(path.join(ROOT, "scripts"))]
      .filter((f) => !f.endsWith("dhan-endpoints.ts") && !f.endsWith("dhan.test.ts"))
      .filter((f) => pattern.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it("every whitelisted endpoint is a documented data endpoint and none is an order endpoint", () => {
    const paths = Object.values(DHAN_ENDPOINTS).map((e) => e.path).sort();
    expect(paths).toEqual(["/charts/historical", "/charts/intraday", "/instrument/NSE_FNO", "/marketfeed/ohlc", "/optionchain", "/optionchain/expirylist"]);
    for (const p of paths) for (const bad of DHAN_FORBIDDEN_PATH_PREFIXES) expect(p.startsWith(bad)).toBe(false);
    expect(isAllowedDhanPath("/orders")).toBe(false);
    expect(isAllowedDhanPath("/super/orders")).toBe(false);
  });

  it("only the Dhan client talks to api.dhan.co, and it builds URLs from the whitelist", () => {
    const users = walk(SRC)
      .filter((f) => !f.endsWith(".test.ts"))
      .filter((f) => readFileSync(f, "utf8").includes("https://api.dhan.co"))
      .map((f) => path.basename(f));
    expect(users).toEqual(["dhan-endpoints.ts"]);
    const client = readFileSync(path.join(__dirname, "dhan-client.ts"), "utf8");
    expect(client.match(/DHAN_BASE_URL \+ /g)).toEqual(["DHAN_BASE_URL + "]);
    expect(client).toContain("DHAN_BASE_URL + ep.path");
  });
});

describe("Dhan client", () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  beforeEach(() => {
    resetDhanState();
    calls.length = 0;
    vi.stubEnv("DHAN_ACCESS_TOKEN", token({ dhanClientId: "1100000001", exp: future }));
    vi.stubEnv("DHAN_CLIENT_ID", "");
  });
  afterEach(() => {
    setDhanFetch(null);
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("reads credentials from the environment, taking the client id from the token when unset", () => {
    const c = dhanCredentials()!;
    expect(c.clientId).toBe("1100000001");
    expect(c.expiresAt).toBe(new Date(future * 1000).toISOString());
    vi.stubEnv("DHAN_CLIENT_ID", "1100000099");
    expect(dhanCredentials()!.clientId).toBe("1100000099");
    vi.stubEnv("DHAN_ACCESS_TOKEN", "");
    expect(dhanCredentials()).toBeNull();
    expect(dhanStatus().state).toBe("not_configured");
  });

  it("sends the documented headers and body to the whitelisted URL", async () => {
    setDhanFetch(async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ data: ["2026-10-06"], status: "success" }), { status: 200 });
    });
    const r = await dhanRequest<{ data: string[] }>("expiryList", { UnderlyingScrip: 13, UnderlyingSeg: "IDX_I" });
    expect(r.data).toEqual(["2026-10-06"]);
    expect(calls[0].url).toBe(`${DHAN_BASE_URL}/optionchain/expirylist`);
    const h = calls[0].init!.headers as Record<string, string>;
    expect(h["client-id"]).toBe("1100000001");
    expect(h["access-token"]).toBe(process.env.DHAN_ACCESS_TOKEN);
    expect(calls[0].init!.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ UnderlyingScrip: 13, UnderlyingSeg: "IDX_I" });
    // cached: a second identical call does not hit the network
    await dhanRequest("expiryList", { UnderlyingScrip: 13, UnderlyingSeg: "IDX_I" });
    expect(calls).toHaveLength(1);
    expect(dhanStatus().state).toBe("ok");
  });

  it("spaces option-chain requests at least 3 s apart (documented limit: 1 request / 3 s)", async () => {
    vi.useFakeTimers();
    const at: number[] = [];
    setDhanFetch(async () => {
      at.push(Date.now());
      return new Response(JSON.stringify({ data: { last_price: 1, oc: {} } }), { status: 200 });
    });
    const p = Promise.all(["2026-10-06", "2026-10-13", "2026-10-20"].map((e) => dhanRequest("optionChain", { UnderlyingScrip: 13, UnderlyingSeg: "IDX_I", Expiry: e })));
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    expect(at).toHaveLength(3);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(3000);
    expect(at[2] - at[1]).toBeGreaterThanOrEqual(3000);
  });

  it("marks the token expired from its exp claim without calling Dhan", async () => {
    vi.stubEnv("DHAN_ACCESS_TOKEN", token({ dhanClientId: "1", exp: Math.floor(Date.now() / 1000) - 60 }));
    setDhanFetch(async (url) => {
      calls.push({ url: String(url), init: undefined });
      return new Response("{}");
    });
    await expect(dhanRequest("marketQuoteOhlc", { IDX_I: [13] })).rejects.toThrow(/expired/);
    expect(calls).toHaveLength(0);
    const s = dhanStatus();
    expect(s.state).toBe("expired");
    expect(dhanUnusable(s)).toBe(true);
  });

  it("maps DH-901 to an invalid token and data-API 807 to an expired one", async () => {
    setDhanFetch(async () => new Response(JSON.stringify({ errorType: "Invalid_Authentication", errorCode: "DH-901", errorMessage: "Client ID or user generated access token is invalid or expired." }), { status: 401 }));
    await expect(dhanRequest("marketQuoteOhlc", { IDX_I: [13] })).rejects.toThrow(/DH-901/);
    expect(dhanStatus().state).toBe("invalid");
    expect(classifyDhanError(200, { status: "failure", errorCode: "807" }).kind).toBe("auth");
    expect(classifyDhanError(400, { errorCode: "DH-905" }).kind).toBe("input");
    expect(classifyDhanError(429, null).kind).toBe("rate_limit");
    expect(classifyDhanError(400, { errorCode: "806" }).kind).toBe("subscription");
  });

  it("an input error does not flag the token", async () => {
    setDhanFetch(async () => new Response(JSON.stringify({ errorType: "Input_Exception", errorCode: "DH-905", errorMessage: "bad" }), { status: 400 }));
    await expect(dhanRequest("historicalDaily", { securityId: "x" })).rejects.toThrow(/DH-905/);
    expect(dhanStatus().state).toBe("unknown");
  });

  it("never forwards credentials on a redirect (instrument list → S3)", async () => {
    setDhanFetch(async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).startsWith(DHAN_BASE_URL)) return new Response(null, { status: 302, headers: { location: "https://s3.example.com/list.csv?sig=1" } });
      return new Response("EXCH_ID,INSTRUMENT,UNDERLYING_SYMBOL,LOT_SIZE\nNSE,OPTIDX,NIFTY,65.0\n");
    });
    const csv = await dhanRequest<string>("instrumentsNseFno", null, { text: true });
    expect(csv).toContain("OPTIDX");
    expect(calls[0].init!.redirect).toBe("manual");
    expect(calls[1].url).toBe("https://s3.example.com/list.csv?sig=1");
    expect(calls[1].init!.headers).toBeUndefined();
  });
});

describe("Dhan payload mapping", () => {
  it("daily candles become IST-dated closes; invalid values are dropped, not filled", () => {
    // 1790620200 = 2026-09-28T18:30Z = 2026-09-29 00:00 IST
    expect(candlesToObs({ timestamp: [1790533800, 1790620200, 1790706600], close: [22780.25, 22716.2, 0] })).toEqual([
      { date: "2026-09-28", value: 22780.25 },
      { date: "2026-09-29", value: 22716.2 },
    ]);
  });

  it("option-chain legs map to records; zero prices/IVs mean no trade and become null", () => {
    const recs = chainToRecords(
      "NIFTY",
      "2026-10-06",
      {
        data: {
          last_price: 22723.6,
          oc: {
            "23400.000000": {
              ce: { last_price: 6.95, previous_close_price: 11.05, oi: 5031910, previous_oi: 3463070, volume: 24098100, implied_volatility: 12.39, top_bid_price: 6.9, top_ask_price: 6.95 },
              pe: { last_price: 0, previous_close_price: 0, oi: 0, previous_oi: 0, volume: 0, implied_volatility: 0, top_bid_price: 0, top_ask_price: 0 },
            },
          },
        },
      },
      "2026-09-30T13:47:00+05:30",
      65,
    );
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ strike: 23400, type: "CE", ltp: 6.95, prevClose: 11.05, oi: 5031910, changeInOi: 1568840, volume: 24098100, iv: 12.39, bid: 6.9, ask: 6.95, lotSize: 65 });
    expect(recs[1]).toMatchObject({ type: "PE", ltp: null, prevClose: null, iv: null, bid: null, ask: null, oi: 0, changeInOi: 0 });
  });

  it("parses index-option lot sizes from the instrument list", () => {
    const csv = "EXCH_ID,SEGMENT,SECURITY_ID,ISIN,INSTRUMENT,UNDERLYING_SECURITY_ID,UNDERLYING_SYMBOL,SYMBOL_NAME,LOT_SIZE\nNSE,D,1,NA,OPTSTK,2,TCS,x,175.0\nNSE,D,40755,NA,OPTIDX,13,NIFTY,x,65.0\nNSE,D,40756,NA,OPTIDX,25,BANKNIFTY,x,30.0\n";
    expect(parseLotSizes(csv, ["NIFTY", "BANKNIFTY", "FINNIFTY"])).toEqual({ NIFTY: 65, BANKNIFTY: 30 });
  });

  it("uses India time for dates and session hours", () => {
    const t = Date.parse("2026-09-30T20:00:00Z"); // 01:30 IST on 1 Oct
    expect(istDate(t)).toBe("2026-10-01");
    expect(istIso(Date.parse("2026-09-30T08:17:00Z"))).toBe("2026-09-30T13:47:00+05:30");
    expect(marketMaybeOpen(Date.parse("2026-09-30T08:17:00Z"))).toBe(true); // Wed 13:47 IST
    expect(marketMaybeOpen(Date.parse("2026-09-30T10:05:00Z"))).toBe(false); // 15:35 IST
    expect(marketMaybeOpen(Date.parse("2026-10-03T06:00:00Z"))).toBe(false); // Saturday
  });
});

describe("Dhan provider requests", () => {
  const seen: { url: string; body: Record<string, unknown> | null }[] = [];
  function fake(handler: (path: string, body: Record<string, unknown> | null) => unknown) {
    setDhanFetch(async (url, init) => {
      const u = String(url);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      seen.push({ url: u, body });
      return new Response(typeof handler(u.replace(DHAN_BASE_URL, ""), body) === "string" ? (handler(u.replace(DHAN_BASE_URL, ""), body) as string) : JSON.stringify(handler(u.replace(DHAN_BASE_URL, ""), body)), { status: 200 });
    });
  }
  beforeEach(() => {
    resetDhanState();
    seen.length = 0;
    vi.stubEnv("DHAN_ACCESS_TOKEN", token({ dhanClientId: "1", exp: future }));
    (globalThis as { __dhanLots?: unknown }).__dhanLots = undefined;
  });
  afterEach(() => {
    setDhanFetch(null);
    vi.unstubAllEnvs();
  });

  it("adds today's quote to the daily history only when the market traded today", async () => {
    const now = Date.parse("2026-09-30T08:17:00Z");
    const daily = { timestamp: [1790533800, 1790620200], close: [22780.25, 22716.2] };
    fake((p) => (p === "/charts/historical" ? daily : p === "/charts/intraday" ? { timestamp: [Math.floor(now / 1000) - 300], close: [22721.25] } : { data: { IDX_I: { "13": { last_price: 22722.55 } } } }));
    const obs = await fetchIndexSeries("NIFTY50", now);
    expect(obs.at(-1)).toEqual({ date: "2026-09-30", value: 22722.55 });
    expect(seen.every((s) => isAllowedDhanPath(s.url.replace(DHAN_BASE_URL, "")))).toBe(true);

    resetDhanState();
    fake((p) => (p === "/charts/historical" ? daily : p === "/charts/intraday" ? { timestamp: [], close: [] } : { data: { IDX_I: { "13": { last_price: 22716.2 } } } }));
    const holiday = await fetchIndexSeries("NIFTY50", Date.parse("2026-10-02T08:17:00Z"));
    expect(holiday.at(-1)).toEqual({ date: "2026-09-29", value: 22716.2 });
  });

  it("fetches the analysed expiries and returns a chain in shares", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1000 });
    const now = Date.parse("2026-09-30T08:17:00Z");
    fake((p, b) => {
      if (p === "/optionchain/expirylist") return { data: ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27", "2026-11-03", "2026-12-29"], status: "success" };
      if (p === "/optionchain") return { data: { last_price: 22723.6, oc: { "22700.000000": { ce: { last_price: 100, oi: 10, previous_oi: 5, volume: 1 }, pe: { last_price: 90, oi: 20, previous_oi: 25, volume: 2 } } } }, status: "success", expiry: b?.Expiry };
      if (p.startsWith("/instrument/")) return "EXCH_ID,INSTRUMENT,UNDERLYING_SYMBOL,LOT_SIZE\nNSE,OPTIDX,NIFTY,65.0\n";
      return {};
    });
    const chain = (await fetchChain("NIFTY", "full", now))!;
    vi.useRealTimers();
    expect(chain.volumeUnit).toBe("shares");
    expect(chain.spot).toBe(22723.6);
    expect(chain.timestamp).toBe("2026-09-30T13:47:00+05:30");
    expect([...new Set(chain.records.map((r) => r.expiry))]).toEqual(["2026-10-06", "2026-10-13", "2026-10-27", "2026-12-29"]);
    expect(chain.records[0].lotSize).toBe(65);
    const chainCalls = seen.filter((s) => s.url.endsWith("/optionchain"));
    expect(chainCalls.map((c) => c.body!.Expiry)).toEqual(["2026-10-06", "2026-10-13", "2026-10-27", "2026-12-29"]);
  }, 30_000);
});
