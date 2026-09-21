import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Headshots ≤5MB and optional ID PDFs ≤8MB, plus multipart overhead.
      bodySizeLimit: "10mb",
    },
    // Next 15+ defaults dynamic client cache to 0s, so every in-app click
    // refetches RSC. 30s lets list↔calendar and admin/parent tabs reuse
    // a just-visited (or prefetched) payload without changing product data rules.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
