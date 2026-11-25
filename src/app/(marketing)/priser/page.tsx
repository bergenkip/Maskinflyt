import type { Metadata } from "next";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import {
  BEDRIFT_EXTRA_PERSON_ORE,
  VAT_REGISTERED,
  planPrice,
  planSeats,
  plans,
  type Plan,
} from "@/lib/billing";
import { SITE_NAME, SITE_URL, publicPageMetadata } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tMeta, locale] = await Promise.all([
    getTranslations("Pricing"),
    getTranslations("Metadata"),
    getLocale(),
  ]);
  return publicPageMetadata({
    path: "/priser",
    title: t("metaTitle"),
    description: t("metaDescription"),
    locale,
    imageAlt: tMeta("ogAlt"),
  });
}

const primaryButton =
  "flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 text-base font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Check() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="mt-0.5 size-5 shrink-0 text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

// The price page. Plans, people and prices come from src/lib/billing.ts, the
// same numbers the app charges, so this page can never show other prices.
export default function Page() {
  const t = useTranslations("Pricing");
  const tNav = useTranslations("Nav");
  const format = useFormatter();
  const kr = (ore: number) =>
    format.number(ore / 100, {
      style: "currency",
      currency: "NOK",
      maximumFractionDigits: 0,
    });

  const included = t.raw("included") as string[];
  const faq = t.raw("faq") as { q: string; a: string }[];

  // Prices for search engines: the same plans and amounts as on the page.
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    offers: [
      {
        "@type": "Offer",
        name: t("free.name"),
        url: `${SITE_URL}/priser`,
        priceCurrency: "NOK",
        price: 0,
      },
      ...plans.map((plan) => ({
        "@type": "Offer",
        name: t(`plans.${plan}`),
        url: `${SITE_URL}/priser`,
        priceCurrency: "NOK",
        price: planPrice(plan, "month") / 100,
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: planPrice(plan, "month") / 100,
          priceCurrency: "NOK",
          unitCode: "MON",
          valueAddedTaxIncluded: false,
        },
      })),
    ],
  };

  function seatsLabel(plan: Plan) {
    return plan === "solo"
      ? t("seatsSolo")
      : t("seats", { count: planSeats[plan] });
  }

  return (
    <article className="[overflow-wrap:anywhere] hyphens-auto">
      <script
        type="application/ld+json"
        // Our own data; "<" is escaped so no text can close the script tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />

      <p className="inline-flex max-w-full items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />
        </svg>
        <span>{t("badge")}</span>
      </p>
      <h1 className="mt-5 max-w-3xl text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">
        {t("title")}
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
        {t("lead")}
      </p>

      <section aria-labelledby="plans-title" className="mt-10 sm:mt-14">
        <h2 id="plans-title" className="sr-only">
          {t("plansTitle")}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <li
              key={plan}
              className="flex flex-col rounded-xl border border-border bg-surface p-5"
            >
              <h3 className="text-lg font-semibold">{t(`plans.${plan}`)}</h3>
              <p className="mt-1 text-muted">{seatsLabel(plan)}</p>
              <p className="mt-5 flex flex-col">
                <span className="text-3xl font-semibold tracking-tight whitespace-nowrap tabular-nums">
                  {kr(planPrice(plan, "month"))}
                </span>
                <span className="text-muted">{t("perMonth")}</span>
              </p>
              <p className="mt-2 text-sm text-muted">
                {t("perYear", { price: kr(planPrice(plan, "year")) })}
              </p>
              {plan === "bedrift" && (
                <p className="mt-2 text-sm text-muted">
                  {t("extraSeat", {
                    count: planSeats.bedrift,
                    price: kr(BEDRIFT_EXTRA_PERSON_ORE),
                  })}
                </p>
              )}
              <div className="mt-auto pt-6">
                <Link
                  href="/signup"
                  className={`${primaryButton} py-2.5 text-center leading-snug hyphens-none`}
                >
                  {t("cta")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          {VAT_REGISTERED ? t("vatExcluded") : t("vatNotRegistered")}
        </p>

        {/* The free plan "Katalog" (Li, 2026-11-25): only the company page in the catalog. */}
        <div className="mt-6 grid gap-4 rounded-xl border border-dashed border-border p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8">
          <div className="grid gap-2">
            <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-lg font-semibold">{t("free.name")}</span>
              <span className="text-2xl font-semibold tracking-tight whitespace-nowrap tabular-nums">
                {kr(0)}
              </span>
              <span className="text-muted">{t("free.what")}</span>
            </h3>
            <p className="leading-relaxed">{t("free.body")}</p>
            <p className="text-sm text-muted">
              {t("free.not")} {t("free.after")}
            </p>
          </div>
          <Link
            href="/signup"
            className="flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-5 py-2.5 text-center leading-snug font-semibold text-foreground hyphens-none hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t("free.cta")}
          </Link>
        </div>
      </section>

      <section aria-labelledby="included-title" className="mt-14 sm:mt-20">
        <h2
          id="included-title"
          className="text-2xl font-semibold tracking-tight"
        >
          {t("includedTitle")}
        </h2>
        <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {included.map((item) => (
            <li key={item} className="flex gap-3 leading-relaxed">
              <Check />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="faq-title" className="mt-14 sm:mt-20">
        <h2 id="faq-title" className="text-2xl font-semibold tracking-tight">
          {t("faqTitle")}
        </h2>
        <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface">
          {faq.map(({ q, a }) => (
            <div key={q} className="p-5">
              <dt className="font-semibold">{q}</dt>
              <dd className="mt-2 leading-relaxed text-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-14 flex flex-col gap-3 sm:mt-20 sm:flex-row sm:items-center">
        <Link href="/signup" className={primaryButton}>
          {tNav("signup")}
        </Link>
        <p className="text-muted">{t("badge")}</p>
      </div>
    </article>
  );
}
