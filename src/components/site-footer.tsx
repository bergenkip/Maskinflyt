import Link from "next/link";
import { useTranslations } from "next-intl";
import { COMPANY } from "@/lib/legal";

const linkClass =
  "flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// Footer for pages visible without signing in: the start page and the legal pages.
export function SiteFooter() {
  const t = useTranslations("Footer");
  const tLegal = useTranslations("Legal");

  return (
    <footer className="border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>{t("text")}</p>
        <nav aria-label={t("linksLabel")} className="-my-3 flex flex-wrap gap-x-5">
          <Link href="/priser" className={linkClass}>
            {t("pricing")}
          </Link>
          <Link href="/personvern" className={linkClass}>
            {tLegal("footerPrivacy")}
          </Link>
          <Link href="/vilkar" className={linkClass}>
            {tLegal("footerTerms")}
          </Link>
          <Link href="/databehandleravtale" className={linkClass}>
            {tLegal("footerDpa")}
          </Link>
          <a href={`mailto:${COMPANY.email}`} className={linkClass}>
            {COMPANY.email}
          </a>
        </nav>
      </div>
    </footer>
  );
}
