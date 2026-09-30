/**
 * BIS statistics (shared by every dashboard): the SDMX RESTful API of the BIS
 * Data Portal, https://stats.bis.org/api-doc/v1/. No key; reuse is allowed,
 * including in commercial products, provided the BIS is cited as the source
 * (https://data.bis.org/help/legal).
 *
 * Series are requested as SDMX-CSV with full detail, so every row carries its
 * attributes and the unit (UNIT_MEASURE, UNIT_MULT), frequency and reference
 * area of each observation are checked before a value is accepted. Rows
 * without a number (BIS writes "NaN" for weekends and holidays in daily
 * series) are dropped, never filled.
 */
import type { Obs } from "@/platform/lib/types";
import { sortAndClean } from "@/platform/lib/timeseries";
import { fetchWithRetry } from "@/platform/data/http";

export const BIS_API = "https://stats.bis.org/api/v1";

export interface BisQuery {
  /** Dataflow id, e.g. "WS_CBPOL" (central bank policy rates). */
  flow: string;
  /** Series key, e.g. "D.IN" (daily, India). */
  key: string;
  /** First date to request (YYYY-MM-DD); earlier observations are also dropped when parsing. */
  startPeriod?: string;
  /** Expected attributes of every row; a row that differs fails the whole fetch. */
  expect: { freq: string; refArea: string; unitMeasure: string; unitMult: string };
}

/** Minimal RFC 4180 parser (quoted fields, doubled quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Parses an SDMX-CSV response of one BIS series into observations (checked, sorted, no gaps filled). */
export function parseBisCsv(text: string, q: Pick<BisQuery, "expect" | "startPeriod">): Obs[] {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (rows.length < 2) throw new Error("empty SDMX-CSV response");
  const header = rows[0];
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`SDMX-CSV response has no ${name} column`);
    return i;
  };
  const [iFreq, iArea, iDate, iValue, iUnit, iMult] = ["FREQ", "REF_AREA", "TIME_PERIOD", "OBS_VALUE", "UNIT_MEASURE", "UNIT_MULT"].map(col);
  const out: Obs[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length !== header.length) throw new Error(`row ${r + 1} has ${row.length} fields, expected ${header.length}`);
    const date = row[iDate];
    const where = `${date || `row ${r + 1}`}`;
    if (row[iFreq] !== q.expect.freq || row[iArea] !== q.expect.refArea) throw new Error(`${where}: unexpected series ${row[iFreq]}.${row[iArea]}`);
    if (row[iUnit] !== q.expect.unitMeasure || row[iMult] !== q.expect.unitMult)
      throw new Error(`${where}: unit ${row[iUnit] || "?"} ×10^${row[iMult] || "?"}, expected ${q.expect.unitMeasure} ×10^${q.expect.unitMult}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${where}: not a daily date`);
    if (q.startPeriod && date < q.startPeriod) continue;
    const raw = row[iValue].trim();
    if (raw === "" || raw === "NaN") continue; // no observation (weekend/holiday): never filled
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`${where}: invalid value "${raw}"`);
    out.push({ date, value });
  }
  return sortAndClean(out);
}

/** Fetches one BIS series (full history from `startPeriod`). */
export async function fetchBisSeries(q: BisQuery): Promise<Obs[]> {
  const qs = q.startPeriod ? `?startPeriod=${encodeURIComponent(q.startPeriod)}` : "";
  const url = `${BIS_API}/data/${encodeURIComponent(q.flow)}/${encodeURIComponent(q.key)}/all${qs}`;
  try {
    const res = await fetchWithRetry(url, { retries: 3, timeoutMs: 60_000, backoffBaseMs: 3000, headers: { Accept: "application/vnd.sdmx.data+csv;version=1.0.0" } });
    const text = await res.text();
    if (text.length > 30_000_000) throw new Error("response too large");
    return parseBisCsv(text, q);
  } catch (e) {
    throw new Error(`BIS ${q.flow}/${q.key}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
