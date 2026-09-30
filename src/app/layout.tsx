import type { Metadata } from "next";
import "./globals.css";
import { PRODUCT } from "@/platform/product";
import { geistMono, geistSans } from "@/platform/ui/fonts";
import { ThemeProvider } from "@/platform/ui/theme-provider";
import { PREFERENCES_SCRIPT } from "@/platform/ui/preferences";

export const metadata: Metadata = {
  title: { default: PRODUCT.name, template: `%s · ${PRODUCT.name}` },
  description: PRODUCT.description,
};

/** Document root only: fonts, theme and preferences. Page chrome lives in the (classic) and (system) layouts. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
