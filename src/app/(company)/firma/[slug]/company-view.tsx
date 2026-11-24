import { getTranslations } from "next-intl/server";
import {
  CheckIcon,
  EyeOffIcon,
  GlobeIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  SendIcon,
} from "@/components/icons";
import type { CompanyPhoto } from "@/lib/company-photos-server";
import { formatPhone } from "@/lib/customers";
import { addDays } from "@/lib/calendar";
import { isService, pagePath } from "@/lib/company-page";
import { toLocalParts } from "@/lib/jobs";
import { MAX_REQUEST_DAYS_AHEAD } from "@/lib/job-requests";
import { formatOrgNumber } from "@/lib/org-number";
import { SITE_URL } from "@/lib/site";
import { RequestForm } from "./request-form";

export type PublicCompany = {
  name: string;
  org_number: string | null;
  country: string;
  slug: string;
  published: boolean;
  description: string | null;
  services: string[];
  city: string | null;
  area: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  updated_at: string;
};

const actionClass =
  "flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2 font-semibold text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// Rows without a lonely photo where possible: 1 wide, 2 and 4 in pairs, others in threes.
const columns = (count: number) => (count === 1 ? "" : count === 2 || count === 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3");

// The page itself, without the database, so it can also be shown on its own.
export async function CompanyView({
  company,
  photos = [],
}: {
  company: PublicCompany;
  photos?: CompanyPhoto[];
}) {
  const [t, tServices, tRequest] = await Promise.all([
    getTranslations("PublicPage"),
    getTranslations("Services"),
    getTranslations("JobRequestForm"),
  ]);
  // A request can be for today (in Norway) or a later day.
  const today = toLocalParts(new Date(), "Europe/Oslo").date;
  const services = company.services.filter(isService);
  const logo = photos.find((photo) => photo.kind === "logo" && photo.url);
  const pictures = photos.filter(
    (photo) => photo.kind === "photo" && photo.url,
  );

  // What search engines read about the company; only for a published page.
  const jsonLd = company.published
    ? {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        name: company.name,
        url: `${SITE_URL}${pagePath(company.slug)}`,
        ...(company.description ? { description: company.description } : {}),
        ...(company.phone ? { telephone: company.phone } : {}),
        ...(company.email ? { email: company.email } : {}),
        ...(company.website ? { sameAs: [company.website] } : {}),
        ...(company.city
          ? {
              address: {
                "@type": "PostalAddress",
                addressLocality: company.city,
                addressCountry: company.country,
              },
            }
          : {}),
        ...(company.area ? { areaServed: company.area } : {}),
        ...(company.org_number && company.country === "NO"
          ? { vatID: company.org_number }
          : {}),
      }
    : null;

  return (
    <article className="grid gap-8 *:min-w-0">
      {!company.published && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 font-medium text-warning"
        >
          <EyeOffIcon className="mt-0.5 size-5 shrink-0" />
          {t("previewNotice")}
        </p>
      )}

      <header className="flex items-center gap-4">
        {logo && (
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-1.5 sm:size-20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logo.url!}
              alt={t("logoAlt", { name: company.name })}
              width={logo.width}
              height={logo.height}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}
        <div className="grid min-w-0 gap-2">
          <h1 className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere] hyphens-auto sm:text-4xl">
            {company.name}
          </h1>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
            {company.city && (
              <span className="flex items-center gap-1.5">
                <MapPinIcon className="size-4" />
                {company.city}
              </span>
            )}
            {company.org_number && (
              <span>
                {t("orgNumber", {
                  number: formatOrgNumber(company.org_number, company.country),
                })}
              </span>
            )}
          </p>
        </div>
      </header>

      {company.published && (
        <a
          href="#request"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-fit"
        >
          <SendIcon className="size-5" />
          {tRequest("open")}
        </a>
      )}

      {company.description && (
        <p className="text-lg leading-relaxed [overflow-wrap:anywhere] whitespace-pre-line">
          {company.description}
        </p>
      )}

      {pictures.length > 0 && (
        <section aria-labelledby="photos-title" className="grid gap-3">
          <h2 id="photos-title" className="sr-only">
            {t("photos")}
          </h2>
          <ul
            className={`grid gap-2 sm:gap-3 ${columns(pictures.length)}`}
          >
            {pictures.map((photo, index) => (
              <li
                key={photo.id}
                className="aspect-[4/3] overflow-hidden rounded-lg bg-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url!}
                  alt={
                    photo.alt ??
                    t("photoAlt", { name: company.name, number: index + 1 })
                  }
                  width={photo.width}
                  height={photo.height}
                  loading={index < 3 ? "eager" : "lazy"}
                  className="size-full object-cover"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {services.length > 0 && (
        <section aria-labelledby="services-title" className="grid gap-3">
          <h2 id="services-title" className="text-xl font-semibold">
            {t("services")}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {services.map((service) => (
              <li
                key={service}
                className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 font-medium"
              >
                <CheckIcon className="size-4 text-accent" />
                {tServices(service)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {company.area && (
        <section aria-labelledby="area-title" className="grid gap-2">
          <h2 id="area-title" className="text-xl font-semibold">
            {t("area")}
          </h2>
          <p className="flex items-start gap-2 [overflow-wrap:anywhere]">
            <MapPinIcon className="mt-0.5 size-5 text-muted" />
            {company.area}
          </p>
        </section>
      )}

      {(company.phone || company.email || company.website) && (
        <section
          aria-labelledby="contact-title"
          className="grid gap-3 rounded-xl border border-border bg-surface p-5 sm:p-6"
        >
          <h2 id="contact-title" className="text-xl font-semibold">
            {t("contact")}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {company.phone && (
              <a href={`tel:${company.phone}`} className={actionClass}>
                <PhoneIcon />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {formatPhone(company.phone)}
                </span>
              </a>
            )}
            {company.email && (
              <a href={`mailto:${company.email}`} className={actionClass}>
                <MailIcon />
                <span className="min-w-0 break-all">{company.email}</span>
              </a>
            )}
            {company.website && (
              <a
                href={company.website}
                rel="nofollow noopener noreferrer"
                target="_blank"
                className={actionClass}
              >
                <GlobeIcon />
                <span className="min-w-0 break-all">
                  {company.website.replace(/^https:\/\//, "")}
                </span>
              </a>
            )}
          </div>
        </section>
      )}

      <section
        id="request"
        aria-labelledby="request-title"
        className="grid scroll-mt-6 gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6"
      >
        <div className="grid gap-1">
          <h2 id="request-title" className="text-xl font-semibold">
            {tRequest("title")}
          </h2>
          <p className="text-muted [overflow-wrap:anywhere]">
            {tRequest("lead", { company: company.name })}
          </p>
        </div>
        {company.published ? (
          <RequestForm
            slug={company.slug}
            company={company.name}
            services={services.map((service) => ({
              value: service,
              label: tServices(service),
            }))}
            minDate={today}
            maxDate={addDays(today, MAX_REQUEST_DAYS_AHEAD)}
          />
        ) : (
          <p className="flex items-start gap-2 font-medium text-muted">
            <EyeOffIcon className="mt-0.5 size-5 shrink-0" />
            {tRequest("preview")}
          </p>
        )}
      </section>

      {jsonLd && (
        <script
          type="application/ld+json"
          // The company's own text: "<" is escaped so it cannot close the script tag.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
      )}
    </article>
  );
}
