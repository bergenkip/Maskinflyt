import type { MetadataRoute } from "next";
import { pagePath } from "@/lib/company-page";
import { industries } from "@/lib/industries";
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const own: MetadataRoute.Sitemap = publicPaths.map((path) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : industries.some((industry) => path === `/${industry}`) ? 0.8 : 0.5,
  }));
  return [...own, ...(await companyPages())];
}
