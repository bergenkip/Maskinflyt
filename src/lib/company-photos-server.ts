import "server-only";
import { COMPANY_PHOTOS_BUCKET, type CompanyPhotoKind } from "@/lib/company-photos";
import { createClient } from "@/lib/supabase/server";

export type CompanyPhoto = {
  id: string;
  kind: CompanyPhotoKind;
  alt: string | null;
  width: number;
  height: number;
  // A link that works for an hour; null when it could not be made.
  url: string | null;
};

type Row = Omit<CompanyPhoto, "url"> & { path: string };

async function withLinks(rows: Row[]): Promise<CompanyPhoto[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const { data: links } = await supabase.storage.from(COMPANY_PHOTOS_BUCKET).createSignedUrls(
    rows.map((row) => row.path),
    60 * 60,
  );
  const urls = new Map((links ?? []).map((link) => [link.path, link.signedUrl]));
  return rows.map(({ path, ...row }) => ({ ...row, url: urls.get(path) ?? null }));
}

// The company's own logo and photos, for the settings page (RLS: members only).
export async function getOwnCompanyPhotos(organizationId: string): Promise<CompanyPhoto[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_photos")
    .select("id, kind, path, alt, width, height")
    .eq("organization_id", organizationId)
    .order("kind")
    .order("position");
  return withLinks((data ?? []) as Row[]);
}

// The logo and photos of a page, for whoever may see the page (visitors: published pages only).
export async function getPagePhotos(slug: string): Promise<CompanyPhoto[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("company_page_photos", { page_slug: slug });
  return withLinks((data ?? []) as Row[]);
}
