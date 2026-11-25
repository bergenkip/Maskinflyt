import Link from "next/link";
import { useTranslations } from "next-intl";

const button =
  "flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-center leading-snug font-semibold hyphens-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// For people who order from the companies (stage 16a): a free customer
// account, shown on the start page and in the catalog (Li, 2026-11-25).
export function CustomerSignup({ headingId, className = "" }: { headingId: string; className?: string }) {
  const t = useTranslations("Home");
  return (
    <div className={`grid gap-3 [overflow-wrap:anywhere] ${className}`}>
      <div className="grid gap-1">
        <h3 id={headingId} className="text-lg font-semibold">
          {t("customerTitle")}
        </h3>
        <p className="max-w-2xl text-muted">{t("customerText")}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Link href="/signup?konto=kunde" className={`${button} bg-accent text-on-accent hover:bg-accent/90`}>
          {t("customerSignup")}
        </Link>
        <Link
          href={`/login?${new URLSearchParams({ next: "/kunde" })}`}
          className={`${button} border border-border bg-surface text-link hover:bg-accent-soft`}
        >
          {t("customerLogin")}
        </Link>
      </div>
    </div>
  );
}
