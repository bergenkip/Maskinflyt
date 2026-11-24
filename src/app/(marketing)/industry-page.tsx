import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import {
  industries,
  isIndustry,
  type IndustryPoint,
  type IndustryQuestion,
  type LandingPage,
} from "@/lib/industries";
import { IndustryLink } from "@/components/industry-link";
import { industryPhotoSize, industryPhotos } from "@/lib/industry-photos";
import { COMPANY } from "@/lib/legal";
import { SITE_URL, publicPageMetadata } from "@/lib/site";

export async function industryMetadata(
  industry: LandingPage,
): Promise<Metadata> {
  const [t, tMeta, locale] = await Promise.all([
    getTranslations("Industry"),
    getTranslations("Metadata"),
    getLocale(),
  ]);
  return publicPageMetadata({
    path: `/${industry}`,
    title: t(`${industry}.metaTitle`),
    description: t(`${industry}.metaDescription`),
    locale,
    imageAlt: tMeta("ogAlt"),
  });
}

const primaryButton =
  "flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 text-base font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const secondaryButton =
  "flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-5 text-base font-semibold text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Icon({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
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

const icons = {
  calendar: <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h3M8 17h6" />,
  phone: <path d="M7 3h10v18H7zM11 18h2M9.5 11l2 2 3.5-3.5" />,
  photo: (
    <path d="M4 7h3l2-3h6l2 3h3v12H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
  ),
  clock: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />,
  invoice: <path d="M6 3h9l3 3v15H6zM9 10h6M9 14h6M9 17h3" />,
} satisfies Record<string, ReactNode>;

// One icon per point, in the order the points are written in messages/*.json.
const pointIcons: Record<LandingPage, (keyof typeof icons)[]> = {
  kranbil: ["calendar", "phone", "photo", "invoice"],
  maskinentreprenor: ["calendar", "phone", "clock", "invoice"],
  transport: ["calendar", "phone", "photo", "invoice"],
  timeforing: ["phone", "clock", "clock", "invoice"],
  faktura: ["clock", "invoice", "invoice", "invoice"],
};

// A page for one trade: what goes wrong today, what MaskinGo does about it,
// questions and answers, and the way to sign up. Only true facts about the
// app: no prices, ratings or customer quotes until they really exist.
export function IndustryPage({ industry }: { industry: LandingPage }) {
  const t = useTranslations("Industry");
  const tHome = useTranslations("Home");
  const tNav = useTranslations("Nav");

  const problems = t.raw(`${industry}.problems`) as string[];
  const points = t.raw(`${industry}.points`) as IndustryPoint[];
  const faq = t.raw(`${industry}.faq`) as IndustryQuestion[];
  // A trade page links to the other trades; a topic page links to every trade.
  const others = industries.filter((other) => other !== industry);

  // Breadcrumb and questions for search engines, the same text as on the page.
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "MaskinGo",
            item: SITE_URL,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: t(`${industry}.navName`),
            item: `${SITE_URL}/${industry}`,
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };

  return (
    <article className="[overflow-wrap:anywhere] hyphens-auto">
      <script
        type="application/ld+json"
        // Our own texts; "<" is escaped so no text can close the script tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />

      <p className="inline-flex max-w-full items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
        <Icon className="size-4 shrink-0">
          <path d="M3 17h2l2-6h6l2 6h2M7 17a2 2 0 1 0 4 0M13 17a2 2 0 1 0 4 0M14 11l4-7 2 1" />
        </Icon>
        <span>{t(`${industry}.badge`)}</span>
      </p>

      <h1 className="mt-5 max-w-3xl text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">
        {t(`${industry}.title`)}
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
        {t(`${industry}.lead`)}
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/signup" className={primaryButton}>
          {tNav("signup")}
        </Link>
        <Link href="/" className={secondaryButton}>
          {t("readMore")}
        </Link>
      </div>

      {/* A trade page shows its trade; topic pages have no photo of their own. */}
      {isIndustry(industry) && (
        <div className="mt-10 aspect-[3/2] overflow-hidden rounded-xl border border-border bg-border shadow-xl shadow-slate-900/10 sm:mt-14 sm:aspect-[21/9]">
          <Image
            src={industryPhotos[industry]}
            alt={t(`${industry}.photoAlt`)}
            {...industryPhotoSize}
            sizes="(min-width: 1280px) 1200px, 100vw"
            priority
            className="size-full object-cover"
          />
        </div>
      )}

      <section aria-labelledby="problems-title" className="mt-14 sm:mt-20">
        <h2
          id="problems-title"
          className="text-2xl font-semibold tracking-tight"
        >
          {t("problemTitle")}
        </h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {problems.map((problem) => (
            <li
              key={problem}
              className="flex gap-3 rounded-xl border border-border bg-surface p-5"
            >
              <Icon className="mt-0.5 size-5 shrink-0 text-muted">
                <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v5M12 16h.01" />
              </Icon>
              <p className="leading-relaxed text-muted">{problem}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="points-title" className="mt-14 sm:mt-20">
        <h2 id="points-title" className="text-2xl font-semibold tracking-tight">
          {t("pointsTitle")}
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {points.map((point, index) => (
            <li
              key={point.title}
              className="flex gap-4 rounded-xl border border-border bg-surface p-5"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Icon className="size-5">
                  {icons[pointIcons[industry][index] ?? "calendar"]}
                </Icon>
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold">{point.title}</h3>
                <p className="mt-1 leading-relaxed text-muted">{point.body}</p>
              </div>
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

      <section
        aria-labelledby="contact-title"
        className="mt-14 rounded-xl border border-border bg-surface p-5 sm:mt-20 sm:p-8"
      >
        <h2
          id="contact-title"
          className="text-2xl font-semibold tracking-tight"
        >
          {tHome("contactTitle")}
        </h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">
          {tHome("contactBody")}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href="/signup" className={primaryButton}>
            {tNav("signup")}
          </Link>
          <a
            href={`mailto:${COMPANY.email}`}
            className={`${secondaryButton} gap-2`}
          >
            <Icon className="size-5 shrink-0 text-accent">
              <path d="M4 6h16v12H4zM4 7l8 6 8-6" />
            </Icon>
            {COMPANY.email}
          </a>
        </div>
      </section>

      <nav aria-labelledby="others-title" className="mt-14 sm:mt-20">
        <h2
          id="others-title"
          className="text-sm font-semibold tracking-wide text-muted uppercase"
        >
          {isIndustry(industry) ? t("otherTitle") : t("homeTitle")}
        </h2>
        <ul
          className={`mt-4 grid gap-3 sm:grid-cols-2 ${others.length === 3 ? "lg:grid-cols-3" : ""}`}
        >
          {others.map((other) => (
            <li key={other}>
              <IndustryLink industry={other} />
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
