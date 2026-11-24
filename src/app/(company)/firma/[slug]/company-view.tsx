import { getTranslations } from "next-intl/server";
import { CheckIcon, EyeOffIcon, GlobeIcon, MailIcon, MapPinIcon, PhoneIcon } from "@/components/icons";
import { formatPhone } from "@/lib/customers";
import { isService, pagePath } from "@/lib/company-page";
import { formatOrgNumber } from "@/lib/org-number";
import { SITE_URL } from "@/lib/site";

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

// The page itself, without the database, so it can also be shown on its own.
export async function CompanyView({ company }: { company: PublicCompany }) {
  const [t, tServices] = await Promise.all([getTranslations("PublicPage"), getTranslations("Services")]);
  const services = company.services.filter(isService);

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
        ...(company.city ? { address: { "@type": "PostalAddress", addressLocality: company.city, addressCountry: company.country } } : {}),
        ...(company.area ? { areaServed: company.area } : {}),
        ...(company.org_number && company.country === "NO" ? { vatID: company.org_number } : {}),
      }
    : null;

  return (
    <article className="grid gap-8 *:min-w-0">
      {!company.published && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 font-medium text-warning">
          <EyeOffIcon className="mt-0.5 size-5 shrink-0" />
          {t("previewNotice")}
        </p>
      )}

      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere] hyphens-auto sm:text-4xl">{company.name}</h1>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
          {company.city && (
            <span className="flex items-center gap-1.5">
              <MapPinIcon className="size-4" />
              {company.city}
            </span>
          )}
          {company.org_number && <span>{t("orgNumber", { number: formatOrgNumber(company.org_number, company.country) })}</span>}
        </p>
      </header>

      {company.description && <p className="text-lg leading-relaxed [overflow-wrap:anywhere] whitespace-pre-line">{company.description}</p>}

      {services.length > 0 && (
        <section aria-labelledby="services-title" className="grid gap-3">
          <h2 id="services-title" className="text-xl font-semibold">
            {t("services")}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {services.map((service) => (
              <li key={service} className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 font-medium">
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
        <section aria-labelledby="contact-title" className="grid gap-3 rounded-xl border border-border bg-surface p-5 sm:p-6">
          <h2 id="contact-title" className="text-xl font-semibold">
            {t("contact")}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {company.phone && (
              <a href={`tel:${company.phone}`} className={actionClass}>
                <PhoneIcon />
                <span className="min-w-0 [overflow-wrap:anywhere]">{formatPhone(company.phone)}</span>
              </a>
            )}
            {company.email && (
              <a href={`mailto:${company.email}`} className={actionClass}>
                <MailIcon />
                <span className="min-w-0 break-all">{company.email}</span>
              </a>
            )}
            {company.website && (
              <a href={company.website} rel="nofollow noopener noreferrer" target="_blank" className={actionClass}>
                <GlobeIcon />
                <span className="min-w-0 break-all">{company.website.replace(/^https:\/\//, "")}</span>
              </a>
            )}
          </div>
        </section>
      )}

      {jsonLd && (
        <script
          type="application/ld+json"
          // The company's own text: "<" is escaped so it cannot close the script tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      )}
    </article>
  );
}
