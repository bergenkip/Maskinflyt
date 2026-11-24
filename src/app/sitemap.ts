import type { MetadataRoute } from "next";
import { industries, topics } from "@/lib/industries";
import { SITE_URL, publicPaths } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    changeFrequency: "monthly",
    priority:
      path === "/"
        ? 1
        : [...industries, ...topics].some((page) => path === `/${page}`)
          ? 0.8
          : 0.5,
  }));
}
