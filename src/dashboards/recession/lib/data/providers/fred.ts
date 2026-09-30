/** FRED provider: the shared platform client (one process-wide throttle for every dashboard). */
export { fetchFred, normalizeFredTimestamp, parseFredCsv, type FetchResult } from "@/platform/data/fred";
