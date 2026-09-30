/**
 * Per-browser UI preferences applied as attributes on <html> (read by tokens.css):
 * data-density = comfortable | compact | spacious, data-market = teal-red | blue-orange,
 * data-sidebar = collapsed (desktop sidebar).
 */
export type Density = "comfortable" | "compact" | "spacious";
export type MarketScheme = "teal-red" | "blue-orange";

export const PREF_KEYS = { density: "tk-density", market: "tk-market" } as const;
/** Desktop sidebar collapsed ("1") or expanded; applied as data-sidebar="collapsed" on <html>. */
export const SIDEBAR_KEY = "tk-sidebar-collapsed";

/** Inline script (runs before paint) so preferences never flash. */
export const PREFERENCES_SCRIPT = `try{var d=localStorage.getItem("${PREF_KEYS.density}");if(d)document.documentElement.dataset.density=d;var m=localStorage.getItem("${PREF_KEYS.market}");if(m)document.documentElement.dataset.market=m;if(localStorage.getItem("tk-sidebar-collapsed")==="1")document.documentElement.dataset.sidebar="collapsed";}catch(e){}`;

export function setPreference(key: keyof typeof PREF_KEYS, value: string) {
  document.documentElement.dataset[key] = value;
  try {
    localStorage.setItem(PREF_KEYS[key], value);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new CustomEvent("tk-preferences"));
}

export function getPreference<T extends string>(key: keyof typeof PREF_KEYS, fallback: T): T {
  if (typeof document === "undefined") return fallback;
  return (document.documentElement.dataset[key] as T) || fallback;
}
