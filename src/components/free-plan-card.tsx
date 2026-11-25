import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

// The free plan (Li, 2026-11-25): only the company page in the catalog.
// Shown on the price page and in the "try MaskinGo" block on the start page.
export function FreePlanCard({ className = "" }: { className?: string }) {
  const t = useTranslations("Pricing");
  const format = useFormatter();
  const kr = format.number(0, { style: "currency", currency: "NOK", maximumFractionDigits: 0 });

  return (
    <div
      className={`grid gap-4 rounded-xl border border-dashed border-border p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8 ${className}`}
    >
      <div className="grid gap-2">
        <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-lg font-semibold">{t("free.name")}</span>
          <span className="text-2xl font-semibold tracking-tight whitespace-nowrap tabular-nums">{kr}</span>
          <span className="text-muted">{t("free.what")}</span>
        </h3>
        <p className="leading-relaxed">{t("free.body")}</p>
        <p className="text-sm text-muted">
          {t("free.not")} {t("free.after")}
        </p>
      </div>
      <Link
        href="/signup"
        className="flex min-h-11 items-center justify-center rounded-full border border-border bg-surface px-5 py-2.5 text-center leading-snug font-semibold text-foreground hyphens-none hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {t("free.cta")}
      </Link>
    </div>
  );
}
