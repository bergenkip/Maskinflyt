import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { ArrowRightIcon, CheckCircleIcon, EyeOffIcon } from "@/components/icons";
import { formatPhone } from "@/lib/customers";
import { isService, pagePath, slugify, type CompanyPageValues } from "@/lib/company-page";
import { getCurrentMembership } from "@/lib/membership";
import { canManageBilling } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { getOwnCompanyPhotos } from "@/lib/company-photos-server";
import { CompanyPageForm } from "./page-form";
import { CompanyPhotosForm } from "./photos-form";
import { DaysOffForm, HoursForm } from "./hours-form";
import { weekFromRows } from "@/lib/company-hours";
import { toLocalParts } from "@/lib/jobs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CompanyPage");
  return { title: `${t("title")} · MaskinGo` };
}

const sectionClass = "grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6";

type PageRow = {
  slug: string;
  published: boolean;
  description: string | null;
  services: string[];
  city: string | null;
  area: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  free_times: boolean | null;
  slot_minutes: number;
};

// The company's public page (stage 15a): owners and admins write it and choose when it is shown.
export default async function CompanyPageSettings() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canManageBilling(membership)) redirect("/app/settings");
  const { organization } = membership;

  const [t, tPhotos, tHours] = await Promise.all([
    getTranslations("CompanyPage"),
    getTranslations("CompanyPhotos"),
    getTranslations("CompanyHours"),
  ]);
  const today = toLocalParts(new Date(), organization.timeZone).date;
  const supabase = await createClient();
  const [{ data }, photos, hours, daysOff] = await Promise.all([
    supabase
      .from("company_pages")
      .select("slug, published, description, services, city, area, phone, email, website, free_times, slot_minutes")
      .eq("organization_id", organization.id)
      .maybeSingle(),
    getOwnCompanyPhotos(organization.id),
    supabase.from("company_hours").select("weekday, opens, closes").eq("organization_id", organization.id),
    supabase
      .from("company_days_off")
      .select("day, note")
      .eq("organization_id", organization.id)
      .gte("day", today)
      .order("day")
      .limit(60),
  ]);
  const page = data as PageRow | null;
  const host = (await headers()).get("x-forwarded-host") ?? "maskingo.no";

  const initial: CompanyPageValues = {
    slug: page?.slug ?? slugify(organization.name),
    published: page?.published ?? false,
    description: page?.description ?? "",
    services: (page?.services ?? []).filter(isService),
    city: page?.city ?? "",
    area: page?.area ?? "",
    phone: page?.phone ? formatPhone(page.phone) : "",
    email: page?.email ?? "",
    website: page?.website ?? "",
  };

  return (
    <div className="grid max-w-2xl gap-8">
      <div className="grid gap-2">
        <Link
          href="/app/settings"
          className="-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-2 font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowRightIcon className="size-5 rotate-180" />
          {t("back")}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>

      {page && (
        <section aria-labelledby="page-status" className={sectionClass}>
          <div
            className={`flex items-start gap-3 rounded-lg border p-3 ${
              page.published ? "border-success/40 bg-success-soft text-success" : "border-border bg-background text-foreground"
            }`}
          >
            {page.published ? <CheckCircleIcon className="mt-0.5 size-5 shrink-0" /> : <EyeOffIcon className="mt-0.5 size-5 shrink-0 text-muted" />}
            <div className="grid min-w-0 gap-0.5">
              <h2 id="page-status" className="font-semibold">
                {page.published ? t("statusPublished") : t("statusHidden")}
              </h2>
              <p className="break-all">{`${host}${pagePath(page.slug)}`}</p>
            </div>
          </div>
          <Link
            href={pagePath(page.slug)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 font-semibold text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-fit"
          >
            {page.published ? t("open") : t("preview")}
            <ArrowRightIcon className="size-5" />
          </Link>
        </section>
      )}

      <section aria-labelledby="page-form" className={sectionClass}>
        <h2 id="page-form" className="text-lg font-semibold">
          {t("formTitle")}
        </h2>
        <CompanyPageForm initial={initial} host={host} />
      </section>

      <section aria-labelledby="page-photos" className={sectionClass}>
        <div className="grid gap-1">
          <h2 id="page-photos" className="text-lg font-semibold">
            {tPhotos("title")}
          </h2>
          <p className="text-sm text-muted">{tPhotos("lead")}</p>
        </div>
        <CompanyPhotosForm photos={photos} />
      </section>

      <section aria-labelledby="page-times" className={sectionClass}>
        <div className="grid gap-1">
          <h2 id="page-times" className="text-lg font-semibold">
            {tHours("title")}
          </h2>
          <p className="text-sm text-muted">{tHours("lead")}</p>
        </div>
        {!page ? (
          <p className="font-medium text-muted">{tHours("pageFirst")}</p>
        ) : hours.error || daysOff.error ? (
          <p className="text-danger">{tHours("errors.unknown")}</p>
        ) : (
          <>
            <HoursForm
              initial={{
                freeTimes: page.free_times === true,
                bookingMinutes: String(page.slot_minutes),
                week: weekFromRows((hours.data ?? []) as { weekday: number; opens: string; closes: string }[]),
              }}
            />
            <div className="grid gap-3 border-t border-border pt-5">
              <div className="grid gap-1">
                <h3 className="font-semibold">{tHours("daysOffTitle")}</h3>
                <p className="text-sm text-muted">{tHours("daysOffLead")}</p>
              </div>
              <DaysOffForm days={(daysOff.data ?? []) as { day: string; note: string | null }[]} minDate={today} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
