import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SearchIcon } from "@/components/icons";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

// The companies' own pages (stage 15a) in the same frame as the rest of the
// site: header, footer and margins (Li, 2026-11-25). The page itself stays
// narrow to read well, and ends with the way back to the catalog.
export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("PublicPage");
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <div className="flex flex-1 flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-10 sm:px-6 sm:pt-10 sm:pb-16">
          {children}
          <Link
            href="/finn"
            className="mt-8 flex min-h-11 w-fit items-center gap-2 rounded-lg font-semibold text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <SearchIcon className="size-5 shrink-0" />
            {t("moreCompanies")}
          </Link>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
