import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { isService, pagePath } from "@/lib/company-page";
import { isIndexable, ogLocale, SITE_NAME } from "@/lib/site";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getPagePhotos } from "@/lib/company-photos-server";
import type { FreeSlot } from "@/lib/company-hours";
import { getCustomerAccount, getMyRequests } from "@/lib/customer-account-server";
import { formatPhone } from "@/lib/customers";
import type { JobRequestValues } from "@/lib/job-requests";
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

export default async function CompanyPublicPage({ params, searchParams }: PageProps<"/firma/[slug]">) {
  const [{ slug }, { gjenta }] = await Promise.all([params, searchParams]);
  const company = await loadCompany(slug);
  if (!company) notFound();
  const supabase = await createClient();
  const [photos, booking] = await Promise.all([
    getPagePhotos(company.slug),
    supabase.rpc("company_page_booking", { page_slug: company.slug }).maybeSingle(),
  ]);
  // With free times switched on, the request form offers them; otherwise a wished-for day.
  const freeTimes = (booking.data as { free_times: boolean } | null)?.free_times === true;
  const [slots, customer] = await Promise.all([
    freeTimes ? supabase.rpc("company_time_slots", { page_slug: company.slug }) : null,
    getCustomerAccount(),
  ]);
  // A signed-in customer (stage 16a): their details, and with ?gjenta= an earlier request to this company.
  let prefill: Partial<JobRequestValues> | undefined;
  if (customer) {
    const again =
      typeof gjenta === "string" ? (await getMyRequests())?.find((r) => r.id === gjenta && r.slug === company.slug) : undefined;
    prefill = {
      name: customer.name,
      phone: customer.phone ? formatPhone(customer.phone) : "",
      email: customer.email,
      place: again?.place ?? customer.place ?? "",
      ...(again ? { description: again.description, service: again.service ?? "" } : {}),
    };
  }
  return (
    <CompanyView
      company={company}
      photos={photos}
      slots={slots && !slots.error ? ((slots.data ?? []) as FreeSlot[]) : null}
      customer={customer ? { name: customer.name, prefill: prefill! } : null}
    />
  );
}
