import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => undefined }));

import { resetDhanState } from "./providers/dhan-client";
import { dataContext, fallbackReason } from "./service";
import { demoFallbackStore, getStore } from "./store";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (exp: number) => `${b64({ alg: "HS512" })}.${b64({ dhanClientId: "1", exp })}.sig`;
const now = () => Math.floor(Date.now() / 1000);

describe("India data context", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetDhanState();
  });

  it("uses the main store in live mode while the provider is usable", () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("DHAN_ACCESS_TOKEN", token(now() + 3600));
    const ctx = dataContext();
    expect(ctx).toMatchObject({ key: "main", mode: "live", fallback: null });
    expect(ctx.store).toBe(getStore());
  });

  it("falls back to an isolated synthetic store when the Dhan token has expired", () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("DHAN_ACCESS_TOKEN", token(now() - 60));
    const ctx = dataContext();
    expect(ctx.key).toBe("fallback");
    expect(ctx.mode).toBe("demo");
    expect(ctx.store).toBe(demoFallbackStore);
    expect(ctx.store).not.toBe(getStore());
    expect(fallbackReason(ctx.fallback!)).toMatch(/^Dhan access token expired .* IST$/);
  });

  it("DATA_MODE=demo is plain demo mode, never a fallback", () => {
    vi.stubEnv("DATA_MODE", "demo");
    vi.stubEnv("DHAN_ACCESS_TOKEN", token(now() - 60));
    expect(dataContext()).toMatchObject({ key: "main", mode: "demo", fallback: null });
  });

  it("without Dhan credentials, live mode stays live (market factors show as unavailable)", () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("DHAN_ACCESS_TOKEN", "");
    expect(dataContext()).toMatchObject({ key: "main", mode: "live", fallback: null });
  });
});
