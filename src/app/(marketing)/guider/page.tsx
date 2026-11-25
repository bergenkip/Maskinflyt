import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { TrialOffer } from "@/components/trial-offer";
import { GUIDES_PATH, guidePath, guides } from "@/lib/guides";
import { SITE_URL, publicPageMetadata } from "@/lib/site";
import { GuideCard } from "./guide-card";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tMeta, locale] = await Promise.all([getTranslations("Guides"), getTranslations("Metadata"), getLocale()]);
  return publicPageMetadata({
    path: GUIDES_PATH,
    title: t("metaTitle"),
    description: t("metaDescription"),
    locale,
    imageAlt: tMeta("ogAlt"),
  });
}

// The list of all guides.
export default function GuidesPage() {
  const t = useTranslations("Guides");

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "MaskinGo", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: t("navName"), item: `${SITE_URL}${GUIDES_PATH}` },
    ],
  };

  return (
    <div className="[overflow-wrap:anywhere] hyphens-auto">
      <script
        type="application/ld+json"
        // Our own texts; "<" is escaped so no text can close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <p className="inline-flex max-w-full items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
        {t("badge")}
      </p>
      <h1 className="mt-5 max-w-3xl text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{t("lead")}</p>

      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((guide) => (
          <li key={guidePath(guide)}>
            <GuideCard guide={guide} />
          </li>
        ))}
      </ul>

      <TrialOffer />
    </div>
  );
}
