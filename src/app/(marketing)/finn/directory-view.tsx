import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DirectorySearch } from "@/components/directory-search";
import { ArrowRightIcon, ClockIcon, MapPinIcon } from "@/components/icons";
import { isService, pagePath, services, type Service } from "@/lib/company-page";
import { directoryPath, DIRECTORY_PATH } from "@/lib/directory";
import type { DirectoryCompany } from "@/lib/directory-server";
import { SITE_URL } from "@/lib/site";

const chip =
  "flex min-h-11 items-center rounded-full border border-border bg-surface px-4 font-medium hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[current=page]:border-accent aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent";

// The catalog (stage 15d): a search by service and place, the listed companies,
// and links to every service and the places that have companies. What the
// companies wrote is data and is shown as written.
export async function DirectoryView({
  service,
  place,
  companies,
  places,
}: {
  service: Service | null;
  place: string;
  companies: DirectoryCompany[] | null;
  places: { city: string; companies: number }[];
}) {
  const [t, tServices, tNav] = await Promise.all([
    getTranslations("Directory"),
    getTranslations("Services"),
    getTranslations("Nav"),
  ]);
  const filtered = Boolean(service || place);

  // For search engines: the listed companies, in order.
  const jsonLd =
    companies && companies.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: companies.slice(0, 50).map((company, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: `${SITE_URL}${pagePath(company.slug)}`,
            name: company.name,
          })),
        }
      : null;

  return (
    <div className="grid gap-8 *:min-w-0">
      <div className="grid gap-3">
        {service && (
          <Link
            href={DIRECTORY_PATH}
            className="-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-2 font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ArrowRightIcon className="size-5 rotate-180" />
            {t("allCompanies")}
          </Link>
        )}
        <h1 className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere] hyphens-auto sm:text-4xl">
          {service
            ? place
              ? t("titleServicePlace", { service: tServices(service), place })
              : tServices(service)
            : place
              ? t("titlePlace", { place })
              : t("title")}
        </h1>
        <p className="max-w-2xl text-lg text-muted">{service ? t("leadService", { service: tServices(service).toLowerCase() }) : t("lead")}</p>
      </div>

      <DirectorySearch
        id="directory"
        service={service}
        place={place}
        className="rounded-xl border border-border bg-surface p-4 sm:p-5"
      />

      <section aria-labelledby="directory-results" className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="directory-results" className="text-xl font-semibold">
            {companies ? t("results", { count: companies.length }) : t("resultsTitle")}
          </h2>
          {filtered && (
            <Link
              href={DIRECTORY_PATH}
              className="flex min-h-11 items-center rounded-lg font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {t("clear")}
            </Link>
          )}
        </div>
        {!companies ? (
          <p className="text-danger">{t("error")}</p>
        ) : companies.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-muted">{filtered ? t("empty") : t("emptyAll")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {companies.map((company) => (
              <li key={company.slug} className="min-w-0">
                <CompanyCard company={company} serviceName={(value) => tServices(value)} freeTimes={t("freeTimes")} logoAlt={t("logoAlt", { name: company.name })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav aria-labelledby="directory-services" className="grid gap-3">
        <h2 id="directory-services" className="text-xl font-semibold">
          {t("byService")}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {services.map((value) => (
            <li key={value}>
              <Link href={directoryPath(value, place)} aria-current={value === service ? "page" : undefined} className={chip}>
                {tServices(value)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {places.length > 0 && (
        <nav aria-labelledby="directory-places" className="grid gap-3">
          <h2 id="directory-places" className="text-xl font-semibold">
            {t("byPlace")}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {places.map((item) => (
              <li key={item.city}>
                <Link
                  href={directoryPath(service, item.city)}
                  aria-current={item.city.toLowerCase() === place.toLowerCase() ? "page" : undefined}
                  className={`${chip} gap-1.5`}
                >
                  <MapPinIcon className="size-4 shrink-0" />
                  <span className="[overflow-wrap:anywhere]">{item.city}</span>
                  <span className="text-sm text-muted">({item.companies})</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <section aria-labelledby="directory-cta" className="grid gap-3 rounded-xl border border-border bg-accent-soft p-5 sm:p-6">
        <h2 id="directory-cta" className="text-xl font-semibold">
          {t("ctaTitle")}
        </h2>
        <p className="max-w-2xl">{t("ctaText")}</p>
        <Link
          href="/signup"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-fit"
        >
          {tNav("signup")}
          <ArrowRightIcon className="size-5" />
        </Link>
      </section>

      {jsonLd && (
        <script
          type="application/ld+json"
          // The data is serialised by JSON.stringify; "<" is escaped so no tag can close the script.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      )}
    </div>
  );
}

// One company: the name is the link to its page, and the whole card can be tapped.
function CompanyCard({
  company,
  serviceName,
  freeTimes,
  logoAlt,
}: {
  company: DirectoryCompany;
  serviceName: (service: Service) => string;
  freeTimes: string;
  logoAlt: string;
}) {
  const offered = company.services.filter(isService);
  const where = [company.city, company.area].filter(Boolean).join(" · ");
  return (
    <article className="relative grid h-full content-start gap-3 rounded-xl border border-border bg-surface p-4 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent hover:border-accent sm:p-5">
      <header className="flex items-center gap-3">
        {company.logo && (
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={company.logo.url}
              alt={logoAlt}
              width={company.logo.width}
              height={company.logo.height}
              loading="lazy"
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}
        <div className="grid min-w-0 gap-0.5">
          <h3 className="text-lg font-semibold [overflow-wrap:anywhere] hyphens-auto">
            <Link href={pagePath(company.slug)} className="outline-none after:absolute after:inset-0 after:rounded-xl">
              {company.name}
            </Link>
          </h3>
          {where && (
            <p className="flex items-start gap-1.5 text-sm text-muted">
              <MapPinIcon className="mt-0.5 size-4 shrink-0" />
              <span className="[overflow-wrap:anywhere]">{where}</span>
            </p>
          )}
        </div>
      </header>
      {company.description && <p className="line-clamp-3 [overflow-wrap:anywhere]">{company.description}</p>}
      {offered.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 text-sm">
          {offered.map((service) => (
            <li key={service} className="rounded-full border border-border px-2.5 py-0.5">
              {serviceName(service)}
            </li>
          ))}
        </ul>
      )}
      {company.free_times && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-success">
          <ClockIcon className="size-4 shrink-0" />
          {freeTimes}
        </p>
      )}
    </article>
  );
}
