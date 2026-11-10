import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Every page depends on the signed-in user and their language, so we keep
// classic dynamic rendering instead of Cache Components for now.
const nextConfig: NextConfig = {
  experimental: {
    // Catalog CSV files may be up to 2 MB (src/lib/catalog/csv.ts).
    serverActions: { bodySizeLimit: "3mb" },
  },
  // The signed-in app and the sign-in callback never belong in search results,
  // also when a page forgets its own "noindex" tag.
  async headers() {
    return ["/app", "/app/:path*", "/auth/:path*"].map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }));
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
