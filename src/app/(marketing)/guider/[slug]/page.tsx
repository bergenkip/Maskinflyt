import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { TrialOffer } from "@/components/trial-offer";
import { IndustryLink } from "@/components/industry-link";
import {
  GUIDES_PATH,
  GUIDES_UPDATED,
  guideFromSlug,
  guidePath,
  guideRelated,
  guides,
  guideSlugs,
  type Guide,
  type GuideSection,
} from "@/lib/guides";
import { isIndustry, type IndustryQuestion } from "@/lib/industries";
import { SITE_NAME, SITE_URL, publicPageMetadata } from "@/lib/site";
import { GuideCard } from "../guide-card";

export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guideSlugs[guide] }));
}

export async function generateMetadata({ params }: PageProps<"/guider/[slug]">): Promise<Metadata> {
  const guide = guideFromSlug((await params).slug);
  if (!guide) return { title: SITE_NAME, robots: { index: false, follow: false } };
  const [t, tMeta, locale] = await Promise.all([getTranslations("Guides"), getTranslations("Metadata"), getLocale()]);
  return publicPageMetadata({
    path: guidePath(guide),
    title: t(`${guide}.metaTitle`),
    description: t(`${guide}.metaDescription`),
    locale,
    imageAlt: tMeta("ogAlt"),
  });
}

export default async function GuideRoute({ params }: PageProps<"/guider/[slug]">) {
  const guide = guideFromSlug((await params).slug);
  if (!guide) notFound();
  return <GuideArticle guide={guide} />;
}

// One guide: title, the sections in order, questions and answers, then the way on
// to the MaskinGo page it belongs to, the other guides and the free trial.
function GuideArticle({ guide }: { guide: Guide }) {
  const t = useTranslations("Guides");
  const tIndustry = useTranslations("Industry");
  const format = useFormatter();

  const sections = t.raw(`${guide}.sections`) as GuideSection[];
  const faq = t.raw(`${guide}.faq`) as IndustryQuestion[];
  const related = guideRelated[guide];
  const others = guides.filter((other) => other !== guide);
  const updated = format.dateTime(new Date(`${GUIDES_UPDATED}T12:00:00Z`), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // The article, its breadcrumb and its questions for search engines: the same text as on the page.
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: t(`${guide}.title`),
        description: t(`${guide}.metaDescription`),
        datePublished: GUIDES_UPDATED,
        dateModified: GUIDES_UPDATED,
        mainEntityOfPage: `${SITE_URL}${guidePath(guide)}`,
        author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "MaskinGo", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: t("navName"), item: `${SITE_URL}${GUIDES_PATH}` },
          { "@type": "ListItem", position: 3, name: t(`${guide}.navName`), item: `${SITE_URL}${guidePath(guide)}` },
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

  const paragraph = "mt-4 leading-relaxed";

  return (
    <article className="[overflow-wrap:anywhere] hyphens-auto">
      <script
        type="application/ld+json"
        // Our own texts; "<" is escaped so no text can close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />

      <nav aria-label={t("allGuides")}>
        <Link
          href={GUIDES_PATH}
          className="-my-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          {t("allGuides")}
        </Link>
      </nav>

      <header className="mt-4 max-w-3xl">
        <p className="inline-flex max-w-full items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
          {t("guideBadge")}
        </p>
        <h1 className="mt-5 text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">{t(`${guide}.title`)}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">{t(`${guide}.lead`)}</p>
        <p className="mt-4 text-sm text-muted">
          <time dateTime={GUIDES_UPDATED}>{t("updated", { date: updated })}</time>
        </p>
      </header>

      <div className="max-w-3xl">
        {sections.map((section) => (
          <section key={section.heading} className="mt-10 sm:mt-12">
            <h2 className="text-2xl font-semibold tracking-tight">{section.heading}</h2>
            {section.body?.map((text) => (
              <p key={text} className={paragraph}>
                {text}
              </p>
            ))}
            {section.list && (
              <ul className="mt-4 space-y-2">
                {section.list.map((item) => (
                  <li key={item} className="flex gap-3 leading-relaxed">
                    {/* A plain dot: the same list style for facts, steps and mistakes. */}
                    <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
            )}
            {section.table && (
              <figure className="mt-4">
                <figcaption className="font-semibold">{section.table.caption}</figcaption>
                {/* On a phone each row is a card; from a tablet up it is a table. */}
                <ul className="mt-3 space-y-3 sm:hidden">
                  {section.table.rows.map((row) => (
                    <li key={row.join("|")} className="rounded-xl border border-border bg-surface p-4">
                      <p className="font-semibold">{row[0]}</p>
                      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                        {row.slice(1).map((cell, index) => (
                          <div key={index} className="contents">
                            <dt className="text-muted">{section.table!.head[index + 1]}</dt>
                            <dd className="tabular-nums">{cell}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 hidden overflow-x-auto rounded-xl border border-border bg-surface sm:block">
                  <table className="w-full border-collapse text-left [overflow-wrap:normal] hyphens-none">
                    <thead>
                      <tr className="border-b border-border">
                        {section.table.head.map((cell) => (
                          <th key={cell} scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row) => (
                        <tr key={row.join("|")} className="border-b border-border last:border-0">
                          {row.map((cell, index) =>
                            index === 0 ? (
                              <th key={index} scope="row" className="px-4 py-3 font-medium">
                                {cell}
                              </th>
                            ) : (
                              <td key={index} className={`px-4 py-3 text-muted ${index < row.length - 1 ? "whitespace-nowrap tabular-nums" : ""}`}>
                                {cell}
                              </td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </figure>
            )}
            {section.after?.map((text) => (
              <p key={text} className={paragraph}>
                {text}
              </p>
            ))}
          </section>
        ))}

        <p role="note" className="mt-10 rounded-xl border border-border bg-surface p-5 text-sm leading-relaxed text-muted">
          {t("disclaimer")}
        </p>

        <section aria-labelledby="faq-title" className="mt-12 sm:mt-16">
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
      </div>

      <nav aria-labelledby="related-title" className="mt-12 sm:mt-16">
        <h2 id="related-title" className="text-sm font-semibold tracking-wide text-muted uppercase">
          {t("relatedTitle")}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {isIndustry(related) ? (
            <IndustryLink industry={related} />
          ) : (
            <Link
              href={`/${related}`}
              className="flex h-full min-h-11 items-start gap-3 rounded-xl border border-border bg-surface p-5 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{tIndustry(`${related}.navName`)}</span>
                <span className="mt-1 block leading-relaxed text-muted">{tIndustry(`${related}.summary`)}</span>
              </span>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          )}
        </div>
      </nav>

      <nav aria-labelledby="more-title" className="mt-12 sm:mt-16">
        <h2 id="more-title" className="text-sm font-semibold tracking-wide text-muted uppercase">
          {t("moreTitle")}
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {others.map((other) => (
            <li key={other}>
              <GuideCard guide={other} />
            </li>
          ))}
        </ul>
      </nav>

      <TrialOffer />
    </article>
  );
}
