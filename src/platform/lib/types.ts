/**
 * Types shared by every dashboard: dated observations, frequencies and the
 * data-quality status shown next to every indicator.
 */

export type Frequency = "D" | "W" | "M" | "Q";

/** A single dated observation. Dates are ISO `YYYY-MM-DD` strings (UTC, date only). */
export interface Obs {
  date: string;
  value: number;
}

export type DataStatus = "LIVE" | "RECENT" | "STALE" | "UNAVAILABLE";
