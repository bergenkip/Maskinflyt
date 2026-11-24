import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { COMPANY } from "@/lib/legal";
import { planPrice, planSeats, plans, type Plan } from "@/lib/billing";

const primaryButton =
  "flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 text-center text-base font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const secondaryButton =
  "flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-5 text-center text-base font-semibold text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// The "try MaskinGo" block at the end of the start page and the trade pages:
// the free trial, who it fits, the plans in short and how to reach us. Plans
// and prices come from src/lib/billing.ts, the same numbers the app charges.
export function TrialOffer() {
  const t = useTranslations("Home");
  const tPricing = useTranslations("Pricing");
  const format = useFormatter();
  const kr = (ore: number) =>
    format.number(ore / 100, { style: "currency", currency: "NOK", maximumFractionDigits: 0 });
  const seats = (plan: Plan) =>
    plan === "solo" ? tPricing("seatsSolo") : tPricing("seats", { count: planSeats[plan] });

  return (
    <section
      aria-labelledby="contact-title"
      className="mt-14 rounded-xl border border-border bg-surface p-5 [overflow-wrap:anywhere] hyphens-auto sm:mt-20 sm:p-8"
    >
      <p className="inline-flex max-w-full items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />
        </svg>
        <span>{tPricing("badge")}</span>
      </p>
      <h2 id="contact-title" className="mt-4 text-2xl font-semibold tracking-tight">
        {t("contactTitle")}
      </h2>
      <p className="mt-3 max-w-2xl leading-relaxed text-muted">{t("contactBody")}</p>

      <ul aria-label={tPricing("plansTitle")} className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {plans.map((plan) => (
          <li key={plan} className="rounded-lg border border-border p-4">
            <p className="font-semibold">{tPricing(`plans.${plan}`)}</p>
            <p className="text-sm text-muted">{seats(plan)}</p>
            <p className="mt-3 flex flex-col">
              <span className="text-xl font-semibold tracking-tight whitespace-nowrap tabular-nums">
                {kr(planPrice(plan, "month"))}
              </span>
              <span className="text-sm text-muted">{tPricing("perMonth")}</span>
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Link href="/signup" className={primaryButton}>
          {tPricing("cta")}
        </Link>
        <Link href="/priser" className={secondaryButton}>
          {t("seePrices")}
        </Link>
        <a href={`mailto:${COMPANY.email}`} className={`${secondaryButton} gap-2 hyphens-none`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16v12H4zM4 7l8 6 8-6" />
          </svg>
          {COMPANY.email}
        </a>
      </div>
    </section>
  );
}
