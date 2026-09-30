/**
 * SYNTHETIC DEMO DATA - for UI development and automated tests only.
 *
 * Generates deterministic, plausible-looking series from a few latent factors
 * (a business-cycle factor keyed to NBER dates, an inflation path and a policy
 * rate path). Values are NOT real and every page shows a prominent warning when
 * DATA_MODE=demo. Never enabled by default.
 */
import type { Obs, SeriesDef } from "../../types";
import { addDays, fromTime, toTime, todayISO } from "@/platform/lib/timeseries";
import { NBER_RECESSIONS } from "../../nber";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  const u = Math.max(r(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

type Anchor = [string, number];
function interp(anchors: Anchor[], date: string): number {
  const t = toTime(date);
  if (t <= toTime(anchors[0][0] + "-01")) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const t1 = toTime(anchors[i][0] + "-01");
    if (t <= t1) {
      const t0 = toTime(anchors[i - 1][0] + "-01");
      return anchors[i - 1][1] + ((t - t0) / (t1 - t0)) * (anchors[i][1] - anchors[i - 1][1]);
    }
  }
  return anchors[anchors.length - 1][1];
}

// Stylised paths (approximate shapes only).
const INFL: Anchor[] = [
  ["1960-01", 1.5], ["1966-01", 3], ["1970-01", 5.8], ["1972-06", 3.2], ["1974-12", 12], ["1976-12", 5], ["1980-03", 14.5],
  ["1983-06", 2.8], ["1990-10", 6], ["1994-01", 2.6], ["1998-01", 1.6], ["2000-06", 3.6], ["2002-01", 1.2], ["2005-09", 4.5],
  ["2008-07", 5.5], ["2009-07", -2], ["2011-09", 3.8], ["2015-06", 0.1], ["2019-12", 2.3], ["2020-05", 0.2], ["2022-06", 9], ["2023-06", 3.2],
  ["2024-09", 2.4], ["2025-06", 2.8], ["2026-09", 3.1],
];
const POLICY: Anchor[] = [
  ["1960-01", 3.5], ["1966-10", 5.5], ["1969-08", 9.2], ["1972-02", 3.3], ["1974-07", 12.9], ["1977-01", 4.6], ["1980-04", 17.6],
  ["1980-07", 9], ["1981-06", 19], ["1983-01", 8.7], ["1984-08", 11.6], ["1986-10", 5.9], ["1989-03", 9.8], ["1993-01", 3],
  ["1995-03", 6], ["2000-07", 6.5], ["2003-07", 1], ["2006-07", 5.25], ["2008-12", 0.15], ["2015-12", 0.2], ["2019-06", 2.4],
  ["2020-04", 0.05], ["2022-03", 0.3], ["2023-08", 5.33], ["2024-09", 5.1], ["2025-01", 4.33], ["2026-09", 3.6],
];
const TERM_PREMIUM: Anchor[] = [
  ["1960-01", 0.5], ["1975-01", 1.5], ["1982-01", 4.2], ["1990-01", 2], ["2000-01", 1], ["2008-01", 0.8], ["2012-06", 0],
  ["2016-06", -0.4], ["2020-06", -0.8], ["2023-10", 0.6], ["2024-06", 0.2], ["2026-09", 0.85],
];

const monthCache = new Map<string, number>();
/** Business-cycle latent factor 0..1 keyed to NBER dates (demo only). */
function cycle(date: string): number {
  const mkey = date.slice(0, 7);
  const hit = monthCache.get(mkey);
  if (hit !== undefined) return hit;
  const t = toTime(mkey + "-15");
  let c = 0.12;
  for (const r of NBER_RECESSIONS) {
    const p = toTime(r.peak);
    const tr = toTime(r.trough);
    const M = 30.44 * 86_400_000;
    if (t >= p - 18 * M && t < p) c = Math.max(c, 0.12 + 0.45 * (1 - (p - t) / (18 * M)));
    else if (t >= p && t <= tr) c = Math.max(c, 0.6 + 0.4 * Math.sin((Math.PI * (t - p)) / Math.max(tr - p, M)) + 0.2);
    else if (t > tr && t < tr + 24 * M) c = Math.max(c, 0.12 + 0.6 * (1 - (t - tr) / (24 * M)));
  }
  // demo "current" conditions: mild late-cycle softening
  const now = toTime(todayISO());
  const M = 30.44 * 86_400_000;
  if (t > now - 12 * M) c = Math.max(c, 0.12 + 0.2 * (1 - (now - t) / (12 * M)));
  c = Math.min(1, c);
  monthCache.set(mkey, c);
  return c;
}

function dates(freq: SeriesDef["frequency"], start: string, end: string): string[] {
  const out: string[] = [];
  if (freq === "D") {
    for (let t = toTime(start); t <= toTime(end); t += 86_400_000) {
      const d = new Date(t).getUTCDay();
      if (d !== 0 && d !== 6) out.push(fromTime(t));
    }
  } else if (freq === "W") {
    let d = start;
    while (new Date(d + "T00:00:00Z").getUTCDay() !== 6) d = addDays(d, 1);
    for (; d <= end; d = addDays(d, 7)) out.push(d);
  } else {
    const step = freq === "M" ? 1 : 3;
    let [y, m] = start.split("-").map(Number);
    if (freq === "Q") m = Math.floor((m - 1) / 3) * 3 + 1;
    for (;;) {
      const d = `${y}-${String(m).padStart(2, "0")}-01`;
      if (d > end) break;
      if (d >= start.slice(0, 8) + "01") out.push(d);
      m += step;
      if (m > 12) {
        m -= 12;
        y++;
      }
    }
  }
  return out;
}

interface Spec {
  start: string;
  lagDays: number;
  f: (d: string, ctx: Ctx) => number;
  noise?: number;
  ar?: number;
  kind?: "level" | "walk" | "mult";
}
interface Ctx {
  c: number;
  cLead: number;
  cLag: number;
  pi: number;
  r: number;
  r12: number;
  tp: number;
  e: number;
}

function ctxAt(d: string): Ctx {
  const r12 = (interp(POLICY, addDays(d, 180)) + interp(POLICY, addDays(d, 365)) + interp(POLICY, d)) / 3;
  return {
    c: cycle(d),
    cLead: cycle(addDays(d, 240)),
    cLag: cycle(addDays(d, -120)),
    pi: interp(INFL, d),
    r: interp(POLICY, d),
    r12,
    tp: interp(TERM_PREMIUM, d),
    e: 0,
  };
}

const y10 = (x: Ctx) => 0.35 * x.r12 + 0.65 * (Math.max(x.pi, 1) * 0.6 + 1.8) + x.tp;

const SPECS: Record<string, Spec> = {
  DGS30: { start: "1977-02-15", lagDays: 1, f: (_, x) => y10(x) + 0.25 + 0.3 * x.tp, noise: 0.03, ar: 0.97 },
  DGS10: { start: "1962-01-02", lagDays: 1, f: (_, x) => y10(x), noise: 0.03, ar: 0.97 },
  DGS5: { start: "1962-01-02", lagDays: 1, f: (_, x) => 0.55 * y10(x) + 0.45 * x.r12, noise: 0.03, ar: 0.97 },
  DGS2: { start: "1976-06-01", lagDays: 1, f: (_, x) => x.r12 + 0.15 - 0.6 * x.cLead, noise: 0.03, ar: 0.97 },
  DGS3MO: { start: "1981-09-01", lagDays: 1, f: (_, x) => Math.max(0.02, x.r - 0.08), noise: 0.02, ar: 0.9 },
  DFF: { start: "1954-07-01", lagDays: 1, f: (_, x) => Math.max(0.05, x.r), noise: 0.01, ar: 0.5 },
  DFII10: { start: "2003-01-02", lagDays: 1, f: (_, x) => y10(x) - (1.6 + 0.3 * Math.max(x.pi, 0)), noise: 0.03, ar: 0.97 },
  THREEFYTP10: { start: "1990-01-02", lagDays: 3, f: (_, x) => x.tp, noise: 0.02, ar: 0.97 },
  T5YIE: { start: "2003-01-02", lagDays: 1, f: (_, x) => 1.4 + 0.25 * Math.max(x.pi, -1) - 0.5 * x.c, noise: 0.02, ar: 0.95 },
  T10YIE: { start: "2003-01-02", lagDays: 1, f: (_, x) => 1.7 + 0.18 * Math.max(x.pi, -1) - 0.3 * x.c, noise: 0.02, ar: 0.95 },
  BAMLH0A0HYM2: { start: "-3y", lagDays: 1, f: (_, x) => 2.8 + 8 * x.c ** 1.5, noise: 0.05, ar: 0.97 },
  BAMLC0A0CM: { start: "-3y", lagDays: 1, f: (_, x) => 0.8 + 2.5 * x.c ** 1.5, noise: 0.02, ar: 0.97 },
  BAMLC0A4CBBB: { start: "-3y", lagDays: 1, f: (_, x) => 1.05 + 3 * x.c ** 1.5, noise: 0.02, ar: 0.97 },
  BAMLH0A3HYC: { start: "-3y", lagDays: 1, f: (_, x) => 7 + 18 * x.c ** 1.5, noise: 0.15, ar: 0.97 },
  BAA10Y: { start: "1986-01-02", lagDays: 1, f: (_, x) => 1.5 + 3.5 * x.c ** 1.5, noise: 0.03, ar: 0.97 },
  UNRATE: { start: "1948-01-01", lagDays: 35, f: (_, x) => 3.8 + 5.5 * x.cLag ** 1.3, noise: 0.08 },
  ICSA: { start: "1967-01-07", lagDays: 5, f: (d, x) => (190_000 + 50_000 * ((toTime(d) - toTime("1967-01-01")) / 3.15e12)) * (1 + 1.4 * x.c ** 1.5), noise: 9000, ar: 0.6 },
  CCSA: { start: "1967-01-07", lagDays: 12, f: (d, x) => (1_300_000 + 400_000 * ((toTime(d) - toTime("1967-01-01")) / 3.15e12)) * (1 + 1.6 * x.cLag ** 1.5), noise: 25000, ar: 0.8 },
  PAYEMS: { start: "1960-01-01", lagDays: 35, kind: "walk", f: (_, x) => 170 - 520 * x.c ** 1.5, noise: 60 },
  CES0500000003: { start: "2006-03-01", lagDays: 35, kind: "walk", f: (_, x) => (Math.max(x.pi, 0) + 1.2) / 1200, noise: 0.0008 },
  JTSJOL: { start: "2000-12-01", lagDays: 65, f: (_, x) => 7500 * (1 - 0.55 * x.c), noise: 150 },
  JTSQUR: { start: "2000-12-01", lagDays: 65, f: (_, x) => 2.6 - 1.2 * x.c, noise: 0.05 },
  PHILLY_MFG: { start: "1968-05-01", lagDays: 20, f: (_, x) => 14 - 45 * x.c, noise: 9 },
  EMPIRE_MFG: { start: "2001-07-01", lagDays: 15, f: (_, x) => 12 - 42 * x.c, noise: 9 },
  INDPRO: { start: "1960-01-01", lagDays: 45, kind: "walk", f: (_, x) => (2.5 - 16 * x.c ** 1.5) / 1200, noise: 0.004 },
  RRSFS: { start: "1992-01-01", lagDays: 45, kind: "walk", f: (_, x) => (3 - 14 * x.c ** 1.5) / 1200, noise: 0.006 },
  PCEC96: { start: "2007-01-01", lagDays: 60, kind: "walk", f: (_, x) => (2.6 - 8 * x.c ** 1.5) / 1200, noise: 0.002 },
  GDPC1_GROWTH: { start: "1960-01-01", lagDays: 120, f: (_, x) => 3.3 - 9 * x.c ** 1.4, noise: 1.2 },
  GDPNOW: { start: "2011-07-01", lagDays: 20, f: (_, x) => 2.9 - 8 * x.c ** 1.4, noise: 0.8 },
  HOUST: { start: "1959-01-01", lagDays: 45, f: (_, x) => 1550 * (1 - 0.55 * x.cLead) - 60 * Math.max(x.r - 5, 0), noise: 60 },
  PERMIT: { start: "1960-01-01", lagDays: 45, f: (_, x) => 1500 * (1 - 0.55 * x.cLead) - 60 * Math.max(x.r - 5, 0), noise: 50 },
  EXHOSLUSM495S: { start: "-13m", lagDays: 50, f: (_, x) => 4_600_000 * (1 - 0.4 * x.cLead), noise: 80_000 },
  HSN1F: { start: "1963-01-01", lagDays: 50, f: (_, x) => 720 * (1 - 0.5 * x.cLead), noise: 35 },
  FIXHAI: { start: "1986-01-01", lagDays: 60, f: (_, x) => 175 - 12 * (y10(x) + 1.7 - 5), noise: 3 },
  MORTGAGE30US: { start: "1971-04-02", lagDays: 5, f: (_, x) => y10(x) + 1.75, noise: 0.04, ar: 0.9 },
  MSACSR: { start: "1963-01-01", lagDays: 50, f: (_, x) => 5.2 + 5 * x.cLead, noise: 0.3 },
  ACTLISCOUUS: { start: "2016-07-01", lagDays: 30, f: (_, x) => 1_000_000 * (1 + 0.5 * x.c), noise: 30_000 },
  CPIAUCSL: { start: "1947-01-01", lagDays: 45, kind: "walk", f: (_, x) => x.pi / 1200, noise: 0.0012 },
  CPILFESL: { start: "1957-01-01", lagDays: 45, kind: "walk", f: (_, x) => (0.75 * x.pi + 0.6) / 1200, noise: 0.0006 },
  PCEPI: { start: "1959-01-01", lagDays: 60, kind: "walk", f: (_, x) => (x.pi - 0.4) / 1200, noise: 0.001 },
  PCEPILFE: { start: "1959-01-01", lagDays: 60, kind: "walk", f: (_, x) => (0.75 * x.pi + 0.3) / 1200, noise: 0.0005 },
  MICH: { start: "1978-01-01", lagDays: 25, f: (_, x) => 1.2 + 0.7 * Math.max(x.pi, 0), noise: 0.2 },
  DCOILWTICO: { start: "1986-01-02", lagDays: 3, kind: "mult", f: (d, x) => 18 * Math.exp(0.028 * (((toTime(d) - toTime("1960-01-01")) / 3.156e10) - 26) - 1.1 * x.c), noise: 0.018, ar: 0.995 },
  DCOILBRENTEU: { start: "1987-05-20", lagDays: 3, kind: "mult", f: (d, x) => 20 * Math.exp(0.028 * (((toTime(d) - toTime("1960-01-01")) / 3.156e10) - 26) - 1.1 * x.c), noise: 0.018, ar: 0.995 },
  DHHNGSP: { start: "1997-01-07", lagDays: 5, kind: "mult", f: (d, x) => 2.5 * Math.exp(0.012 * (((toTime(d) - toTime("1960-01-01")) / 3.156e10) - 37) - 0.8 * x.c), noise: 0.03, ar: 0.99 },
  PCOPPUSDM: { start: "1990-01-01", lagDays: 30, kind: "mult", f: (d, x) => 2500 * Math.exp(0.035 * (((toTime(d) - toTime("1960-01-01")) / 3.156e10) - 30) - 1.2 * x.c), noise: 0.05, ar: 0.9 },
  GOLD: { start: "2006-01-02", lagDays: 1, kind: "mult", f: (d) => 550 * Math.exp(0.08 * (((toTime(d) - toTime("1960-01-01")) / 3.156e10) - 46)), noise: 0.01, ar: 0.995 },
  SP500: { start: "-10y", lagDays: 1, kind: "mult", f: (d) => 60 * Math.exp(0.07 * ((toTime(d) - toTime("1960-01-01")) / 3.156e10) - 1.3 * cycle(addDays(d, 120))), noise: 0.01, ar: 0.99 },
  NASDAQ100: { start: "1986-01-02", lagDays: 1, kind: "mult", f: (d) => 130 * Math.exp(0.1 * (((toTime(d) - toTime("1960-01-01")) / 3.156e10) - 26) - 1.6 * cycle(addDays(d, 120))), noise: 0.014, ar: 0.99 },
  RUT_PROXY: { start: "2000-05-26", lagDays: 1, kind: "mult", f: (d) => 50 * Math.exp(0.06 * (((toTime(d) - toTime("1960-01-01")) / 3.156e10) - 40) - 1.5 * cycle(addDays(d, 120))), noise: 0.013, ar: 0.99 },
  VIXCLS: { start: "1990-01-02", lagDays: 1, f: (_, x) => 14 + 30 * x.c ** 1.5, noise: 1.2, ar: 0.9 },
  NFCI: { start: "1971-01-08", lagDays: 7, f: (_, x) => -0.55 + 2.4 * x.c ** 1.5 + 0.03 * Math.max(x.r - 6, 0), noise: 0.03, ar: 0.9 },
  ANFCI: { start: "1971-01-08", lagDays: 7, f: (_, x) => -0.3 + 1.6 * x.c ** 1.5, noise: 0.03, ar: 0.9 },
  DTWEXBGS: { start: "2006-01-02", lagDays: 3, kind: "mult", f: (d, x) => 100 * Math.exp(0.004 * (((toTime(d) - toTime("1960-01-01")) / 3.156e10) - 46) + 0.15 * x.c), noise: 0.004, ar: 0.995 },
  DRTSCILM: { start: "1990-04-01", lagDays: 40, f: (_, x) => -8 + 75 * x.cLead ** 1.3, noise: 5 },
  UMCSENT: { start: "1978-01-01", lagDays: 25, f: (_, x) => 97 - 35 * x.c - 2.5 * Math.max(x.pi - 2, 0), noise: 3 },
  OECD_CONF: { start: "1960-01-01", lagDays: 40, f: (_, x) => 100.8 - 2.5 * x.c - 0.12 * Math.max(x.pi - 2, 0), noise: 0.2, ar: 0.8 },
  DRCCLACBS: { start: "1991-01-01", lagDays: 60, f: (_, x) => 2.6 + 4.2 * x.cLag ** 1.5, noise: 0.1 },
  DRCLACBS: { start: "1987-01-01", lagDays: 60, f: (_, x) => 2.1 + 2.3 * x.cLag ** 1.5, noise: 0.06 },
  TDSP: { start: "1980-01-01", lagDays: 90, f: (_, x) => 10 + 0.18 * x.r + 1.5 * x.c, noise: 0.1 },
  PSAVERT: { start: "1959-01-01", lagDays: 60, f: (_, x) => 6.5 + 3 * x.c, noise: 0.6 },
  DSPIC96: { start: "1959-01-01", lagDays: 60, kind: "walk", f: (_, x) => (2.8 - 6 * x.c) / 1200, noise: 0.004 },
};

export function syntheticSeries(def: SeriesDef): Obs[] {
  const spec = SPECS[def.key];
  if (!spec) return [];
  const today = todayISO();
  const end = addDays(today, -spec.lagDays);
  let start = spec.start;
  if (start === "-3y") start = addDays(today, -3 * 365);
  else if (start === "-10y") start = addDays(today, -10 * 365);
  else if (start === "-13m") start = addDays(today, -400);
  const r = rng(hash(def.key));
  const ds = dates(def.frequency, start, end);
  const out: Obs[] = [];
  let noiseState = 0;
  let level = spec.kind === "walk" ? (def.key === "PAYEMS" ? 54_000 : 100) : 0;
  const ar = spec.ar ?? 0;
  for (const d of ds) {
    const x = ctxAt(d);
    const base = spec.f(d, x);
    noiseState = ar * noiseState + gauss(r) * (spec.noise ?? 0) * Math.sqrt(1 - ar * ar || 1);
    if (spec.kind === "walk") {
      if (def.key === "PAYEMS") level += base + noiseState;
      else level *= Math.exp(base + noiseState);
      out.push({ date: d, value: Math.round(level * 1000) / 1000 });
    } else if (spec.kind === "mult") {
      out.push({ date: d, value: Math.round(base * Math.exp(noiseState) * 1000) / 1000 });
    } else {
      const v = base + noiseState;
      out.push({ date: d, value: Math.round(v * 1000) / 1000 });
    }
  }
  return out;
}
