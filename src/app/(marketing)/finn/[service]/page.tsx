import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { cleanPlace, directoryPath, serviceFromSlug } from "@/lib/directory";
import { getDirectory, getDirectoryPlaces } from "@/lib/directory-server";
import { isIndexable, ogLocale, SITE_NAME } from "@/lib/site";
import { DirectoryView } from "../directory-view";

export async function generateMetadata({ params, searchParams }: PageProps<"/finn/[service]">): Promise<Metadata> {
  const [{ service: slug }, { sted }] = await Promise.all([params, searchParams]);
  const service = serviceFromSlug(slug);
  if (!service) return { title: SITE_NAME, robots: { index: false, follow: false } };
  const [t, tServices, locale] = await Promise.all([getTranslations("Directory"), getTranslations("Services"), getLocale()]);
  const name = tServices(service);
  const title = t("metaTitleService", { service: name });
  const description = t("metaDescriptionService", { service: name.toLowerCase() });
  const path = directoryPath(service);
  // The service page is indexed; a search for a place within it is not.
  const indexable = isIndexable() && !cleanPlace(sted);
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: indexable, follow: isIndexable() },
    openGraph: { type: "website", siteName: SITE_NAME, url: path, title, description, locale: ogLocale(locale) },
  };
}

// One service in the catalog, e.g. /finn/kranbil, optionally narrowed to a place.
export default async function DirectoryServicePage({ params, searchParams }: PageProps<"/finn/[service]">) {
  const [{ service: slug }, { sted }] = await Promise.all([params, searchParams]);
  const service = serviceFromSlug(slug);
  if (!service) notFound();
  const place = cleanPlace(sted);
  const [companies, places] = await Promise.all([getDirectory(service, place), getDirectoryPlaces()]);
  return <DirectoryView service={service} place={place} companies={companies} places={places} />;
}
