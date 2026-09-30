/**
 * The breadth universe: NSE mainboard ordinary shares, read from Dhan's NSE_EQ
 * instrument list (detailed CSV: EXCH_ID, SEGMENT, SECURITY_ID, ISIN,
 * INSTRUMENT, …, INSTRUMENT_TYPE, SERIES, …).
 *
 * Included: INSTRUMENT = EQUITY, INSTRUMENT_TYPE = ES (equity shares) and
 * SERIES EQ (rolling settlement), BE (trade-for-trade) or BZ (trade-for-trade,
 * non-compliant). Excluded: SME platform (SM, ST), ETFs, mutual-fund units,
 * REIT/InvIT units, bonds, T-bills, SGBs and other debt. One entry per ISIN.
 */
export const BREADTH_SERIES = ["EQ", "BE", "BZ"] as const;

export interface UniverseStock {
  id: number;
  symbol: string;
  series: string;
}

/** Splits one CSV line (the instrument list quotes fields only when they contain commas). */
function splitCsv(line: string): string[] {
  if (!line.includes('"')) return line.split(",");
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseUniverse(csv: string): UniverseStock[] {
  const lines = csv.split(/\r?\n/);
  const header = splitCsv(lines[0] ?? "").map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const [iExch, iId, iIsin, iInst, iType, iSeries, iSym] = ["EXCH_ID", "SECURITY_ID", "ISIN", "INSTRUMENT", "INSTRUMENT_TYPE", "SERIES", "UNDERLYING_SYMBOL"].map(col);
  if ([iId, iInst, iType, iSeries].some((i) => i < 0)) throw new Error("NSE_EQ instrument list: unexpected columns");
  const allowed = new Set<string>(BREADTH_SERIES);
  const byIsin = new Map<string, UniverseStock>();
  for (let n = 1; n < lines.length; n++) {
    const line = lines[n];
    if (!line || !line.includes("EQUITY")) continue;
    const f = splitCsv(line).map((x) => x.trim());
    if (iExch >= 0 && f[iExch] && f[iExch] !== "NSE") continue;
    if (f[iInst] !== "EQUITY" || f[iType] !== "ES" || !allowed.has(f[iSeries])) continue;
    const id = Number(f[iId]);
    if (!Number.isInteger(id) || id <= 0) continue;
    const isin = (iIsin >= 0 ? f[iIsin] : "") || `id:${id}`;
    const stock = { id, symbol: (iSym >= 0 ? f[iSym] : "") || String(id), series: f[iSeries] };
    const prev = byIsin.get(isin);
    // Should an ISIN ever appear twice, keep the rolling-settlement (EQ) line.
    if (!prev || (prev.series !== "EQ" && stock.series === "EQ")) byIsin.set(isin, stock);
  }
  return [...byIsin.values()].sort((a, b) => a.id - b.id);
}
