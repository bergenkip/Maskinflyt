import Link from "next/link";
import { getTranslations } from "next-intl/server";

// The companies' own pages (stage 15a): the company is the sender, so MaskinGo
// stays in a small line at the bottom.
export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("PublicPage");
  return (
    <div className="flex min-h-full flex-1 flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-10 sm:px-6 sm:pt-10 sm:pb-16">{children}</main>
      <footer className="border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-3xl px-4 py-4 text-sm text-muted sm:px-6">
          <Link
            href="/"
            className="-mx-2 flex min-h-11 items-center rounded-lg px-2 underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t("madeWith")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
