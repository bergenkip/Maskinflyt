import type { Metadata } from "next";

// The company's own address: canonical links, the sitemap and share previews
// always point here, also when the page was opened on a *.vercel.app address.
export const SITE_URL = "https://maskingo.no";

export const SITE_NAME = "MaskinGo";

// Only the live site may appear in search results. Vercel previews and local
// servers tell search engines to stay away, so test copies are never indexed.
export function isIndexable(env: string | undefined = process.env.VERCEL_ENV): boolean {
  return env === "production";
}

// Open Graph wants a language and a country, e.g. nb_NO.
const ogLocales = { nb: "nb_NO", en: "en_GB", lt: "lt_LT" } as const;

export function ogLocale(locale: string): string {
  return ogLocales[locale as keyof typeof ogLocales] ?? ogLocales.nb;
}

// Pages that people find through search. Everything else (the app itself,
// password and invitation links) is marked noindex.
export const publicPaths = ["/", "/signup", "/login"] as const;

// For the pages in publicPaths: a canonical link to maskingo.no (one address
// per page, also when opened on *.vercel.app) and permission to be indexed.
export function publicPageMetadata({
  path,
  title,
  description,
  locale,
  imageAlt,
}: {
  path: (typeof publicPaths)[number];
  title: string;
  description: string;
  locale: string;
  // Alt text of the share picture (src/app/opengraph-image.tsx).
  imageAlt: string;
}): Metadata {
  const indexable = isIndexable();
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: indexable, follow: indexable },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: path,
      title,
      description,
      locale: ogLocale(locale),
      // A page's own openGraph replaces the parent's, picture included, so it is named again here.
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: imageAlt }],
    },
  };
}
