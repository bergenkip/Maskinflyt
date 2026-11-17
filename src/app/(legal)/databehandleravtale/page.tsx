import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { fillCompany } from "@/lib/legal";
import { publicPageMetadata } from "@/lib/site";
import { LegalDocument } from "../legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tMeta, locale] = await Promise.all([getTranslations("Legal"), getTranslations("Metadata"), getLocale()]);
  return publicPageMetadata({
    path: "/databehandleravtale",
    title: `${t("dpa.title")} · MaskinGo`,
    description: fillCompany(t.raw("dpa.lead") as string),
    locale,
    imageAlt: tMeta("ogAlt"),
  });
}

export default function Page() {
  return <LegalDocument kind="dpa" />;
}
