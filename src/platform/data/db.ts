/**
 * Shared PostgreSQL connection pool. Every dashboard uses this one pool (and its
 * own tables); a dashboard falls back to its in-memory store when DATABASE_URL is unset.
 */
import type { Pool } from "pg";

/**
 * DATABASE_SSL: "require" = TLS with certificate verification (system CAs, or
 * DATABASE_CA_CERT when set, e.g. Supabase's root CA); "no-verify" = TLS without
 * verification (encrypted, but not protected against MITM); unset = no TLS.
 */
export function sslConfig() {
  const mode = process.env.DATABASE_SSL;
  if (mode === "require") return { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n") || undefined };
  if (mode === "no-verify") return { rejectUnauthorized: false };
  return undefined;
}

export function databaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

const g = globalThis as unknown as { __terminalkPool?: Pool };

export async function pool(): Promise<Pool> {
  if (g.__terminalkPool) return g.__terminalkPool;
  const { Pool } = await import("pg");
  g.__terminalkPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    ssl: sslConfig(),
  });
  return g.__terminalkPool;
}
