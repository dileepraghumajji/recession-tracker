import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseBisCsv } from "@/platform/data/bis";
import type { Obs } from "../types";
import { mergeAuthoritative, OFFICIAL_IMPORTS, runOfficialImports, type OfficialImport } from "./official";
import { createMemoryStore } from "./store";

// Real BIS response (RBI repo rate, 24 Nov – 14 Dec 2025), saved 2026-09-30.
const DEC_2025 = parseBisCsv(readFileSync(path.join(import.meta.dirname, "../../../../platform/data/__fixtures__/bis-cbpol-d-in-2025-12.csv"), "utf8"), {
  expect: { freq: "D", refArea: "IN", unitMeasure: "368", unitMult: "0" },
});
const NOW = () => Date.parse("2026-09-30T06:00:00Z");
let seq = 0;
const newStore = () => createMemoryStore(`__officialTest${++seq}`);
const repo = (fetch: () => Promise<Obs[]>, minObs = 5): OfficialImport => ({ ...OFFICIAL_IMPORTS[0], fetch, minObs });
const saveIngested = async (store: ReturnType<typeof newStore>, obs: Obs[]) =>
  store.saveSeries({ key: "rbi:repo", kind: "manual", sourceId: "rbi:repo", origin: "ingest:test", fetchedAt: null, sourceLastUpdated: null, fetchStatus: "ok", fetchError: null, synthetic: false }, obs, "merge");

afterEach(() => {
  delete process.env.DATA_MODE;
});

describe("mergeAuthoritative", () => {
  it("replaces stored values up to the source's last date and keeps later ones", () => {
    const stored = [
      { date: "2025-12-05", value: 9 },
      { date: "2025-12-20", value: 5 },
    ];
    const out = mergeAuthoritative(DEC_2025, stored);
    expect(out.find((o) => o.date === "2025-12-05")?.value).toBe(5.25);
    expect(out.at(-1)).toEqual({ date: "2025-12-20", value: 5 });
    expect(out).toHaveLength(DEC_2025.length + 1);
  });
});

describe("runOfficialImports", () => {
  it("stores the BIS history as rbi:repo with origin bis, keeping newer ingested values", async () => {
    const store = newStore();
    await saveIngested(store, [{ date: "2026-08-06", value: 5 }]);
    const r = await runOfficialImports({ store, now: NOW, imports: [repo(async () => DEC_2025)] });
    expect(r.status).toBe("ok");
    expect(r.results[0]).toMatchObject({ key: "rbi:repo", status: "updated", first: "2025-11-24", last: "2026-08-06", count: 18 });
    const s = (await store.loadAll())["rbi:repo"]!;
    expect(s.meta).toMatchObject({ origin: "bis", fetchStatus: "ok", synthetic: false });
    expect(s.obs.find((o) => o.date === "2025-12-05")?.value).toBe(5.25);
    expect(s.obs.at(-1)).toEqual({ date: "2026-08-06", value: 5 });
  });

  it("reports unchanged data without rewriting the observations", async () => {
    const store = newStore();
    await runOfficialImports({ store, now: NOW, imports: [repo(async () => DEC_2025)] });
    const v = await store.dataVersion();
    const r = await runOfficialImports({ store, now: NOW, imports: [repo(async () => DEC_2025)] });
    expect(r.results[0].status).toBe("unchanged");
    expect((await store.loadAll())["rbi:repo"]!.obs).toEqual(DEC_2025);
    expect(await store.dataVersion()).not.toBe(v); // fetch time recorded
  });

  it("keeps stored data and records the error when a fetch is truncated, implausible or fails", async () => {
    const store = newStore();
    await saveIngested(store, [{ date: "2025-01-01", value: 6.5 }]);
    const cases: [() => Promise<Obs[]>, RegExp][] = [
      [async () => DEC_2025.slice(0, 3), /only 3 observations/],
      [async () => [...DEC_2025, { date: "2025-12-15", value: 525 }], /value 525 outside/],
      [async () => [...DEC_2025, { date: "2026-10-01", value: 5.25 }], /after today/],
      [async () => Promise.reject(new Error("BIS WS_CBPOL/D.IN: HTTP 503")), /HTTP 503/],
    ];
    for (const [fetch, msg] of cases) {
      const r = await runOfficialImports({ store, now: NOW, imports: [repo(fetch)] });
      expect(r.status).toBe("error");
      expect(r.results[0].message).toMatch(msg);
      const s = (await store.loadAll())["rbi:repo"]!;
      expect(s.obs).toEqual([{ date: "2025-01-01", value: 6.5 }]);
      expect(s.meta.fetchStatus).toBe("error");
    }
  });

  it("does nothing in demo mode", async () => {
    process.env.DATA_MODE = "demo";
    const store = newStore();
    const r = await runOfficialImports({ store, now: NOW, imports: [repo(async () => DEC_2025)] });
    expect(r.status).toBe("skipped");
    expect(await store.loadAll()).toEqual({});
  });

  it("imports the repo rate from BIS from 3 Apr 2001 with a plausibility check", () => {
    expect(OFFICIAL_IMPORTS.map((i) => [i.key, i.origin, i.range, i.minObs])).toEqual([["rbi:repo", "bis", [0, 20], 4000]]);
  });
});
