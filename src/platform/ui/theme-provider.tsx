"use client";
import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";

/** Dark-first theming. Storage key kept from the original app so saved preferences survive. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="data-theme" defaultTheme="dark" enableSystem={false} storageKey="mrsm-theme" themes={["dark", "light"]} disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
