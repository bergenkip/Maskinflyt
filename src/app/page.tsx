import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { DirectorySearch } from "@/components/directory-search";
import { IndustryLink } from "@/components/industry-link";
import { TrialOffer } from "@/components/trial-offer";
import { ProductShowcase } from "@/components/product-showcase";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { industries } from "@/lib/industries";
import { SITE_NAME, SITE_URL, publicPageMetadata } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations("Metadata"), getLocale()]);
  return publicPageMetadata({ path: "/", title: t("homeTitle"), description: t("description"), locale, imageAlt: t("ogAlt") });
}

const steps = ["receive", "check", "approve"] as const;

const stepIcons: Record<(typeof steps)[number], ReactNode> = {
  // Calendar, phone with a tick, document with a tick.
  receive: <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />,
  check: <path d="M7 3h10v18H7zM11 18h2M9.5 11l2 2 3.5-3.5" />,
  approve: <path d="M6 3h9l3 3v15H6zM9 10h6M9 14h3M13 17l1.5 1.5L18 15" />,
};

const features = ["jobs", "driver", "hours", "customers", "invoices", "team"] as const;

const featureIcons: Record<(typeof features)[number], ReactNode> = {
  jobs: <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h3M8 17h6" />,
  driver: <path d="M7 3h10v18H7zM11 18h2M10 7h4" />,
  hours: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />,
  customers: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14c2 .8 3 3 3 6" />,
  invoices: <path d="M6 3h9l3 3v15H6zM9 10h6M9 14h6M9 17h3" />,
  team: <path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6zM9 12l2 2 4-4" />,
};

// The company's own inbox (Resend → Inboxes, see docs/HANDOFF.md).

const primaryButton =
  "flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 text-base font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const secondaryButton =
  "flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-5 text-base font-semibold text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Icon({ children, className }: { children: ReactNode; className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export default function Home() {
  const t = useTranslations("Home");
  const tNav = useTranslations("Nav");
  const tMeta = useTranslations("Metadata");
  const tIndustry = useTranslations("Industry");
  const locale = useLocale();

  // Tells search engines what MaskinGo is (schema.org). Only facts that are
  // true today: no prices, ratings or reviews until they really exist.
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/brand/maskingo-logo-full.png`,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: SITE_URL,
        inLanguage: locale,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        url: SITE_URL,
        description: tMeta("description"),
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, iOS, Android",
        inLanguage: ["nb", "en", "lt"],
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <script
        type="application/ld+json"
        // Our own constant data; "<" is escaped so no text can close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <SiteHeader />

      {/* The header reaches the screen edges; the content keeps clear of the notch in landscape. */}
      <div className="flex flex-1 flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-10 sm:px-6 sm:pt-6 sm:pb-16">
          <p className="inline-flex max-w-full items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
            <Icon className="size-4 shrink-0">
              <path d="M3 17h2l2-6h6l2 6h2M7 17a2 2 0 1 0 4 0M13 17a2 2 0 1 0 4 0M14 11l4-7 2 1" />
            </Icon>
            <span className="[overflow-wrap:anywhere]">{t("badge")}</span>
          </p>

          <h1 className="mt-5 max-w-3xl text-3xl leading-tight font-semibold tracking-tight [overflow-wrap:anywhere] hyphens-auto sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{t("lead")}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className={primaryButton}>
              {tNav("signup")}
            </Link>
            <Link href="/login" className={secondaryButton}>
              {tNav("login")}
            </Link>
          </div>

          {/* For customers: the free catalog of companies (stage 15d), searchable at once. */}
          <section
            aria-labelledby="find-title"
            className="mt-8 grid gap-4 rounded-xl border border-accent/40 bg-accent-soft p-4 sm:mt-10 sm:p-6"
          >
            <div className="grid gap-1">
              <h2 id="find-title" className="text-xl font-semibold [overflow-wrap:anywhere]">
                {t("findTitle")}
              </h2>
              <p className="text-muted">{t("findLead")}</p>
            </div>
            <DirectorySearch id="home-find" />
          </section>

          <ProductShowcase />

          <section aria-labelledby="steps-title" className="mt-14 sm:mt-20">
            <h2 id="steps-title" className="text-sm font-semibold tracking-wide text-muted uppercase">
              {t("stepsTitle")}
            </h2>
            <ol className="mt-4 grid gap-4 md:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step} className="rounded-xl border border-border bg-surface p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <Icon className="size-5">{stepIcons[step]}</Icon>
                    </span>
                    <h3 className="font-semibold [overflow-wrap:anywhere] hyphens-auto">
                      <span className="text-muted">{index + 1}. </span>
                      {t(`steps.${step}.title`)}
                    </h3>
                  </div>
                  <p className="mt-3 leading-relaxed text-muted">{t(`steps.${step}.body`)}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="features-title" className="mt-14 sm:mt-20">
            <h2 id="features-title" className="text-sm font-semibold tracking-wide text-muted uppercase">
              {t("featuresTitle")}
            </h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <li key={feature} className="flex gap-4 rounded-xl border border-border bg-surface p-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Icon className="size-5">{featureIcons[feature]}</Icon>
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold [overflow-wrap:anywhere] hyphens-auto">{t(`features.${feature}.title`)}</h3>
                    <p className="mt-1 leading-relaxed text-muted">{t(`features.${feature}.body`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <nav aria-labelledby="industries-title" className="mt-14 sm:mt-20">
            <h2 id="industries-title" className="text-sm font-semibold tracking-wide text-muted uppercase">
              {tIndustry("homeTitle")}
            </h2>
            <ul className="mt-4 grid gap-4 md:grid-cols-3">
              {industries.map((industry) => (
                <li key={industry}>
                  <IndustryLink industry={industry} />
                </li>
              ))}
            </ul>
          </nav>

          <TrialOffer />
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
