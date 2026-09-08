import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Headshots ≤5MB and optional ID PDFs ≤8MB, plus multipart overhead.
      bodySizeLimit: "10mb",
    },
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
