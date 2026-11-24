import type { MetadataRoute } from "next";
import { isService, pagePath, services } from "@/lib/company-page";
import { directoryPath } from "@/lib/directory";
import { industries, topics } from "@/lib/industries";
import { SITE_URL, publicPaths } from "@/lib/site";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createVisitorClient } from "@/lib/supabase/standalone";

// The published company pages change during the day; the list is rebuilt hourly.
export const revalidate = 3600;

async function companyPages(): Promise<MetadataRoute.Sitemap> {
  if (!getSupabaseEnv()) return [];
  try {
    const { data, error } = await createVisitorClient().rpc("published_company_pages");
    if (error || !data) return [];
    return (data as { slug: string; updated_at: string }[]).map((page) => ({
      url: `${SITE_URL}${pagePath(page.slug)}`,
      lastModified: page.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch {
    // Without the database the sitemap still lists MaskinGo's own pages.
    return [];
  }
}

// The catalog's service pages that list at least one company (an empty page is not worth indexing).
async function directoryPages(): Promise<MetadataRoute.Sitemap> {
  if (!getSupabaseEnv()) return [];
  try {
    const { data, error } = await createVisitorClient().rpc("company_directory");
    if (error || !data) return [];
    const offered = new Set((data as { services: string[] }[]).flatMap((row) => row.services.filter(isService)));
    return services
      .filter((service) => offered.has(service))
      .map((service) => ({ url: `${SITE_URL}${directoryPath(service)}`, changeFrequency: "daily" as const, priority: 0.7 }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const own: MetadataRoute.Sitemap = publicPaths.map((path) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    changeFrequency: "monthly",
    priority:
      path === "/"
        ? 1
        : [...industries, ...topics].some((page) => path === `/${page}`)
          ? 0.8
          : 0.5,
  }));
  const [pages, directory] = await Promise.all([companyPages(), directoryPages()]);
  return [...own, ...directory, ...pages];
}
