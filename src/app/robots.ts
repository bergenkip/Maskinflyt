import type { MetadataRoute } from "next";
import { SITE_URL, isIndexable } from "@/lib/site";

// VERCEL_ENV is known at build time, and previews are built separately,
// so a preview never invites search engines in.
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    // /app is not blocked here on purpose: search engines must be able to
    // fetch it to see its "noindex" (it also sends signed-out visitors to /login).
    rules: { userAgent: "*", allow: "/", disallow: ["/auth/", "/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
