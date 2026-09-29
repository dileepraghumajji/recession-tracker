/** Small fetch wrapper with timeout, retry on 429/5xx (exponential backoff) and bounded concurrency. */

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url: string, opts: { retries?: number; timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<Response> {
  const retries = opts.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "macro-recession-stress-monitor/0.1", ...opts.headers }, cache: "no-store" });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new HttpError(`HTTP ${res.status}`, res.status);
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status);
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (e instanceof HttpError && e.status < 500 && e.status !== 429) throw e;
      if (attempt < retries) await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Redacts API keys from error messages / URLs before they are logged or shown. */
export function redact(s: string): string {
  return s.replace(/(api_key|apikey|token)=[^&\s]+/gi, "$1=***");
}
