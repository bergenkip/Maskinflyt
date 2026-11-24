import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { isService, pagePath } from "@/lib/company-page";
import { isIndexable, ogLocale, SITE_NAME } from "@/lib/site";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getPagePhotos } from "@/lib/company-photos-server";
import { CompanyView, type PublicCompany } from "./company-view";

// Published pages for everyone; an unpublished one only for the company's own members, as a preview.
const loadCompany = cache(async (slug: string): Promise<PublicCompany | null> => {
  if (!getSupabaseEnv() || !/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("company_page", { page_slug: slug }).maybeSingle();
  return (data as PublicCompany | null) ?? null;
});

export async function generateMetadata({ params }: PageProps<"/firma/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const company = await loadCompany(slug);
  if (!company) return { title: SITE_NAME, robots: { index: false, follow: false } };
  const [t, tServices, locale] = await Promise.all([getTranslations("PublicPage"), getTranslations("Services"), getLocale()]);
  const services = company.services.filter(isService).map((service) => tServices(service));
  const title = company.city ? t("metaTitle", { name: company.name, city: company.city }) : company.name;
  const description = (company.description ?? services.join(", ")).replace(/\s+/g, " ").slice(0, 160);
  const indexable = company.published && isIndexable();
  const path = pagePath(company.slug);
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: indexable, follow: indexable },
    openGraph: { type: "website", siteName: SITE_NAME, url: path, title, description, locale: ogLocale(locale) },
  };
}

export default async function CompanyPublicPage({ params }: PageProps<"/firma/[slug]">) {
  const { slug } = await params;
  const company = await loadCompany(slug);
  if (!company) notFound();
  const photos = await getPagePhotos(company.slug);
  return <CompanyView company={company} photos={photos} />;
}
