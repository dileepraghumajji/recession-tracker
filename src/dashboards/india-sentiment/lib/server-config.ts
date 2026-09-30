import { cookies } from "next/headers";

export const CONFIG_COOKIE = "ims_model";

/** Weight/threshold overrides chosen on the Settings page (cookie, so every page uses the same model). */
export async function configOverridesFromCookie(): Promise<string | null> {
  const v = (await cookies()).get(CONFIG_COOKIE)?.value;
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return null;
  }
}
