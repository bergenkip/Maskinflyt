import "server-only";
import { COMPANY_PHOTOS_BUCKET } from "@/lib/company-photos";
import type { Service } from "@/lib/company-page";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type DirectoryCompany = {
  slug: string;
  name: string;
  description: string | null;
  services: string[];
  city: string | null;
  area: string | null;
  free_times: boolean;
  // The logo, with a link that works for an hour (null when there is none).
  logo: { url: string; width: number; height: number } | null;
};

type Row = Omit<DirectoryCompany, "logo"> & { logo_path: string | null; logo_width: number | null; logo_height: number | null };

// The listed companies for a search, or null when the catalog could not be read.
export async function getDirectory(service: Service | null, place: string): Promise<DirectoryCompany[] | null> {
  if (!getSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("company_directory", { wanted_service: service, wanted_place: place || null });
  if (error) return null;
  const rows = (data ?? []) as Row[];
  const paths = rows.flatMap((row) => (row.logo_path ? [row.logo_path] : []));
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    // One request signs every logo on the page.
    const { data: links } = await supabase.storage.from(COMPANY_PHOTOS_BUCKET).createSignedUrls(paths, 60 * 60);
    for (const link of links ?? []) if (link.path && link.signedUrl) urls.set(link.path, link.signedUrl);
  }
  return rows.map(({ logo_path, logo_width, logo_height, ...row }) => {
    const url = logo_path ? urls.get(logo_path) : undefined;
    return { ...row, logo: url && logo_width && logo_height ? { url, width: logo_width, height: logo_height } : null };
  });
}

// Places with listed companies, most first, for quick links.
export async function getDirectoryPlaces(): Promise<{ city: string; companies: number }[]> {
  if (!getSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("company_directory_places");
  return (data ?? []) as { city: string; companies: number }[];
}
