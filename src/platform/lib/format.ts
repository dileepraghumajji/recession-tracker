/** Number/date formatting shared by every dashboard. */

export function fmtNum(x: number | null | undefined, dp = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtSigned(x: number | null | undefined, dp = 2, suffix = ""): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const s = fmtNum(Math.abs(x), dp);
  return `${x > 0 ? "+" : x < 0 ? "−" : "±"}${s}${suffix}`;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return d.length > 10 ? new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC" : d;
}
