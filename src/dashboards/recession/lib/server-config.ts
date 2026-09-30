import { cookies } from "next/headers";

export const MODEL_COOKIE = "mrsm_model";

/** Model-weight overrides chosen in Settings (stored in a cookie so every page uses the same model). */
export async function modelOverridesFromCookie(): Promise<string | null> {
  const c = await cookies();
  const v = c.get(MODEL_COOKIE)?.value;
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return null;
  }
}
