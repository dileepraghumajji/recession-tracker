import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Write endpoints: enforced only when ADMIN_TOKEN is configured, unless `required`. */
export function checkAdmin(req: Request, required = false): NextResponse | null {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return required ? NextResponse.json({ error: "ADMIN_TOKEN must be configured for this endpoint" }, { status: 403 }) : null;
  }
  const got = req.headers.get("x-admin-token") ?? "";
  if (!safeEqual(got, token)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

export function checkCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 403 });
    return null;
  }
  const got = req.headers.get("authorization") ?? "";
  if (!safeEqual(got, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

const buckets = new Map<string, { tokens: number; at: number }>();
/** Tiny in-memory token bucket (per instance) to protect expensive endpoints. */
export function rateLimit(req: Request, name: string, perMinute: number): NextResponse | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${name}:${ip}`;
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return NextResponse.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": "30" } });
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 5000) buckets.clear();
  return null;
}

export function errorResponse(e: unknown, status = 500) {
  console.error(e);
  return NextResponse.json({ error: "internal error" }, { status });
}
