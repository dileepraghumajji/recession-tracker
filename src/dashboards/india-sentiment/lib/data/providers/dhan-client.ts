/**
 * Server-side DhanHQ v2 client for market DATA only.
 *
 * - Credentials come from DHAN_ACCESS_TOKEN / DHAN_CLIENT_ID (server env only;
 *   the client id falls back to the token's own `dhanClientId` claim).
 * - URLs are built only from DHAN_ENDPOINTS (read-only data endpoints); any
 *   other path is rejected before a request is made.
 * - Requests are spaced per documented rate bucket, identical requests share one
 *   in-flight promise, and responses are cached per endpoint.
 * - The token's state (valid / expired / invalid / not subscribed / unreachable)
 *   is tracked so the UI can say so and fall back to demo data.
 */
import "server-only";
import { DHAN_BASE_URL, DHAN_DATA_DAILY_CAP, DHAN_ENDPOINTS, DHAN_MIN_INTERVAL_MS, isAllowedDhanPath, type DhanBucket, type DhanEndpointName } from "./dhan-endpoints";

export type DhanTokenState = "not_configured" | "unknown" | "ok" | "expired" | "invalid" | "not_subscribed" | "unreachable";

export interface DhanStatus {
  configured: boolean;
  state: DhanTokenState;
  /** Token expiry from its `exp` claim (ISO), when readable. */
  expiresAt: string | null;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  /** Short, secret-free description of the last failure. */
  lastError: string | null;
  requestsToday: number;
}

export class DhanError extends Error {
  constructor(
    message: string,
    /** Dhan error code (e.g. DH-901, 807) or HTTP status. */
    public code: string,
    public kind: "auth" | "subscription" | "rate_limit" | "input" | "no_data" | "server" | "network",
  ) {
    super(message);
  }
}

// ------------------------------------------------------------------ credentials

function decodeClaims(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function dhanCredentials(): { token: string; clientId: string; expiresAt: string | null } | null {
  const token = process.env.DHAN_ACCESS_TOKEN?.trim();
  if (!token) return null;
  const claims = decodeClaims(token);
  const clientId = process.env.DHAN_CLIENT_ID?.trim() || (typeof claims?.dhanClientId === "string" ? claims.dhanClientId : "");
  if (!clientId) return null;
  const exp = typeof claims?.exp === "number" ? new Date(claims.exp * 1000).toISOString() : null;
  return { token, clientId, expiresAt: exp };
}

// ------------------------------------------------------------------ state

interface State {
  state: DhanTokenState;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  networkFailures: number;
  day: string;
  requestsToday: number;
  nextSlot: Record<DhanBucket, number>;
  cache: Map<string, { at: number; value: unknown }>;
  inflight: Map<string, Promise<unknown>>;
  /** Token the state above refers to (a new token resets it). */
  tokenId: string;
}

const g = globalThis as unknown as { __dhan?: State };
function st(): State {
  const tokenId = (process.env.DHAN_ACCESS_TOKEN ?? "").slice(-12);
  if (!g.__dhan || g.__dhan.tokenId !== tokenId)
    g.__dhan = { state: "unknown", lastOkAt: null, lastErrorAt: null, lastError: null, networkFailures: 0, day: "", requestsToday: 0, nextSlot: { optionchain: 0, quote: 0, data: 0 }, cache: new Map(), inflight: new Map(), tokenId };
  return g.__dhan;
}

export function dhanStatus(now = Date.now()): DhanStatus {
  const c = dhanCredentials();
  const s = st();
  if (!c) return { configured: false, state: "not_configured", expiresAt: null, lastOkAt: null, lastErrorAt: null, lastError: null, requestsToday: 0 };
  const expired = c.expiresAt !== null && Date.parse(c.expiresAt) <= now;
  return { configured: true, state: expired ? "expired" : s.state, expiresAt: c.expiresAt, lastOkAt: s.lastOkAt, lastErrorAt: s.lastErrorAt, lastError: s.lastError, requestsToday: s.requestsToday };
}

/** States in which live Dhan data cannot be fetched (the dashboard falls back to demo data). */
export function dhanUnusable(status: DhanStatus): boolean {
  return status.configured && (status.state === "expired" || status.state === "invalid" || status.state === "not_subscribed" || status.state === "unreachable");
}

/** Test hook: forget state, cache and rate-limit slots. */
export function resetDhanState() {
  delete g.__dhan;
}

// ------------------------------------------------------------------ errors

/** Maps DhanHQ error payloads (trading-style DH-9xx and data-API 8xx codes) to a kind. */
export function classifyDhanError(httpStatus: number, body: unknown): DhanError {
  const b = (body ?? {}) as Record<string, unknown>;
  const code = String(b.errorCode ?? (b.data as Record<string, unknown> | undefined)?.errorCode ?? b.status ?? httpStatus);
  const msg = String(b.errorMessage ?? b.remarks ?? `HTTP ${httpStatus}`).slice(0, 200);
  const known: Record<string, DhanError["kind"]> = {
    "DH-901": "auth",
    "807": "auth",
    "808": "auth",
    "809": "auth",
    "810": "auth",
    "DH-902": "subscription",
    "806": "subscription",
    "DH-904": "rate_limit",
    "805": "rate_limit",
    "DH-905": "input",
    "811": "input",
    "812": "input",
    "813": "input",
    "814": "input",
    "804": "input",
    "DH-907": "no_data",
    "DH-908": "server",
    "DH-909": "server",
    "DH-910": "server",
    "800": "server",
  };
  const kind = known[code] ?? (httpStatus === 401 || httpStatus === 403 ? "auth" : httpStatus === 429 ? "rate_limit" : httpStatus >= 500 ? "server" : "input");
  return new DhanError(`Dhan ${code}: ${msg}`, code, kind);
}

function recordFailure(e: DhanError) {
  const s = st();
  s.lastErrorAt = new Date().toISOString();
  s.lastError = e.message;
  if (e.kind === "auth") s.state = e.code === "807" ? "expired" : "invalid";
  else if (e.kind === "subscription") s.state = "not_subscribed";
  else if (e.kind === "network") {
    s.networkFailures++;
    if (s.networkFailures >= 3) s.state = "unreachable";
  }
}

function recordSuccess() {
  const s = st();
  s.state = "ok";
  s.networkFailures = 0;
  s.lastOkAt = new Date().toISOString();
}

// ------------------------------------------------------------------ transport

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reserves the next free slot in a bucket and waits for it (requests in a bucket are spaced, never bursty). */
async function acquire(bucket: DhanBucket) {
  const s = st();
  const now = Date.now();
  const at = Math.max(now, s.nextSlot[bucket]);
  s.nextSlot[bucket] = at + DHAN_MIN_INTERVAL_MS[bucket];
  if (at > now) await sleep(at - now);
  const day = new Date().toISOString().slice(0, 10);
  if (s.day !== day) {
    s.day = day;
    s.requestsToday = 0;
  }
  if (++s.requestsToday > DHAN_DATA_DAILY_CAP * 0.95) throw new DhanError("Dhan daily request budget nearly used; skipping", "budget", "rate_limit");
}

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
/** Test hook. */
export function setDhanFetch(f: Fetch | null) {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

async function send(name: DhanEndpointName, body: unknown, parse: "json" | "text"): Promise<unknown> {
  const ep = DHAN_ENDPOINTS[name];
  // Defence in depth: never build a URL that is not a whitelisted data endpoint.
  if (!isAllowedDhanPath(ep.path)) throw new DhanError(`blocked non-data Dhan path ${ep.path}`, "blocked", "input");
  const cred = dhanCredentials();
  if (!cred) throw new DhanError("Dhan credentials not configured", "config", "auth");
  if (cred.expiresAt && Date.parse(cred.expiresAt) <= Date.now()) {
    const e = new DhanError(`Dhan access token expired at ${cred.expiresAt}`, "807", "auth");
    recordFailure(e);
    throw e;
  }
  for (let attempt = 0; ; attempt++) {
    await acquire(ep.bucket);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), name === "instrumentsNseFno" ? 60_000 : 20_000);
    let res: Response;
    try {
      res = await fetchImpl(DHAN_BASE_URL + ep.path, {
        method: ep.method,
        headers: { "access-token": cred.token, "client-id": cred.clientId, Accept: "application/json", ...(ep.method === "POST" ? { "Content-Type": "application/json" } : {}) },
        body: ep.method === "POST" ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
        cache: "no-store",
        // Never let fetch follow a redirect with the credentials attached (the instrument list redirects to S3).
        redirect: "manual",
      });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (location) {
        if (!location.startsWith("https://")) throw new Error("insecure redirect");
        res = await fetchImpl(location, { method: "GET", signal: ctrl.signal, cache: "no-store", redirect: "follow" });
      }
    } catch (e) {
      clearTimeout(timer);
      const err = new DhanError(`Dhan ${ep.path} unreachable (${ctrl.signal.aborted ? "timeout" : e instanceof Error ? e.message.slice(0, 80) : "network error"})`, "network", "network");
      recordFailure(err);
      if (attempt < 1) continue;
      throw err;
    }
    clearTimeout(timer);
    if (res.ok) {
      const out = parse === "json" ? await res.json() : await res.text();
      const o = out as Record<string, unknown>;
      if (parse === "json" && o && typeof o === "object" && (o.status === "failure" || o.errorCode)) {
        const err = classifyDhanError(res.status, o);
        recordFailure(err);
        throw err;
      }
      recordSuccess();
      return out;
    }
    const raw = await res.text().catch(() => "");
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* non-JSON error body */
    }
    const err = classifyDhanError(res.status, parsed);
    if ((err.kind === "rate_limit" || err.kind === "server") && attempt < 2) {
      await sleep(err.kind === "rate_limit" ? 3_000 * (attempt + 1) : 1_000 * (attempt + 1));
      continue;
    }
    if (err.kind !== "input" && err.kind !== "no_data") recordFailure(err);
    throw err;
  }
}

/**
 * Calls a whitelisted Dhan data endpoint with response caching and in-flight
 * de-duplication. `maxAgeMs` overrides the endpoint's default cache lifetime.
 */
export async function dhanRequest<T>(name: DhanEndpointName, body: unknown = null, opts: { maxAgeMs?: number; text?: boolean } = {}): Promise<T> {
  const s = st();
  const key = `${name}|${JSON.stringify(body)}`;
  const maxAge = opts.maxAgeMs ?? DHAN_ENDPOINTS[name].cacheMs;
  const hit = s.cache.get(key);
  if (hit && Date.now() - hit.at < maxAge) return hit.value as T;
  const pending = s.inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = send(name, body, opts.text ? "text" : "json")
    .then((v) => {
      s.cache.set(key, { at: Date.now(), value: v });
      if (s.cache.size > 400) s.cache.delete(s.cache.keys().next().value as string);
      return v;
    })
    .finally(() => s.inflight.delete(key));
  s.inflight.set(key, p);
  return p as Promise<T>;
}
