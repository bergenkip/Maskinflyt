import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { cleanPlace, directoryPath, wantedService } from "@/lib/directory";
import { getDirectory, getDirectoryPlaces } from "@/lib/directory-server";
import { publicPageMetadata } from "@/lib/site";
import { DirectoryView } from "./directory-view";

export async function generateMetadata({ searchParams }: PageProps<"/finn">): Promise<Metadata> {
  const { sted } = await searchParams;
  const [t, tMeta, locale] = await Promise.all([getTranslations("Directory"), getTranslations("Metadata"), getLocale()]);
  const metadata = publicPageMetadata({
    path: "/finn",
    title: t("metaTitle"),
    description: t("metaDescription"),
    locale,
    imageAlt: tMeta("ogAlt"),
  });
  // A search for a place is a view of the same page: not indexed on its own.
  return cleanPlace(sted) ? { ...metadata, robots: { index: false, follow: true } } : metadata;
}

// The catalog of every listed company (stage 15d). A search for a service goes
// to that service's own address, e.g. /finn/kranbil.
export default async function DirectoryPage({ searchParams }: PageProps<"/finn">) {
  const { tjeneste, sted } = await searchParams;
  const service = wantedService(tjeneste);
  const place = cleanPlace(sted);
  if (service || tjeneste !== undefined) redirect(directoryPath(service, place));
  const [companies, places] = await Promise.all([getDirectory(null, place), getDirectoryPlaces()]);
  return <DirectoryView service={null} place={place} companies={companies} places={places} />;
}
