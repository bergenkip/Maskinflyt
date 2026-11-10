import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { SITE_NAME, SITE_URL, isIndexable, ogLocale } from "@/lib/site";
import { THEME_COOKIE, resolveTheme, themeColors } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations("Metadata"), getLocale()]);
  const indexable = isIndexable();
  return {
    // Relative links (canonical, share picture) become https://maskingo.no/...
    metadataBase: new URL(SITE_URL),
    applicationName: SITE_NAME,
    title: t("title"),
    description: t("description"),
    // Pages that should be found in search (start, sign up, log in) opt in
    // themselves; everything else stays out of search results by default.
    robots: { index: false, follow: indexable },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: t("title"),
      description: t("description"),
      locale: ogLocale(locale),
    },
    twitter: { card: "summary_large_image" },
  };
}

async function getTheme() {
  return resolveTheme((await cookies()).get(THEME_COOKIE)?.value);
}

export async function generateViewport(): Promise<Viewport> {
  return {
    width: "device-width",
    initialScale: 1,
    // Lets the page use the full iPhone screen; padding uses safe-area insets.
    viewportFit: "cover",
    // The header colour (--surface), so the browser bar and the header read as one strip.
    themeColor: themeColors[await getTheme()],
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, theme] = await Promise.all([getLocale(), getTheme()]);

  return (
    <html
      lang={locale}
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
