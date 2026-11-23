import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/site";
import { LegalDocument } from "../legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tMeta, locale] = await Promise.all([getTranslations("Legal"), getTranslations("Metadata"), getLocale()]);
  return publicPageMetadata({
    path: "/personvern",
    title: `${t("privacy.title")} · MaskinGo`,
    description: t("privacy.lead"),
    locale,
    imageAlt: tMeta("ogAlt"),
  });
}

export default function Page() {
  return <LegalDocument kind="privacy" />;
}
