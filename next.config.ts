import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  serverExternalPackages: ["pg"],
  // The recession tracker used to live at the site root. Keep old bookmarks and
  // API clients working (308 preserves the method and body for POST/PATCH/DELETE).
  async redirects() {
    const pages = ["indicators", "rates", "methodology", "history", "backtest", "alerts", "settings"];
    const apis = ["alerts", "backtest", "history", "indicators", "manual", "score-history", "snapshot", "status"];
    return [
      ...pages.map((p) => ({ source: `/${p}/:path*`, destination: `/dashboards/recession/${p}/:path*`, permanent: true })),
      ...apis.map((a) => ({ source: `/api/${a}/:path*`, destination: `/api/recession/${a}/:path*`, permanent: true })),
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
