import Link from "next/link";
import type { ReactNode } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { AlertIcon, CheckCircleIcon, ClockIcon, UsersIcon, XCircleIcon } from "@/components/icons";
import {
  extraPeople,
  extraPersonPrice,
  planFits,
  planPrice,
  plans,
  planSeats,
  VAT_REGISTERED,
  type BillingState,
  type Interval,
  type Plan,
} from "@/lib/billing";
import { ChoosePlanForm, PortalForm } from "./billing-forms";

export type BillingViewProps = {
  state: BillingState;
  taken: number;
  // The people the current plan includes; null while trying the app or on Bedrift.
  seats: number | null;
  interval: Interval;
  // Owners and admins choose the plan; the others only see it.
  manages: boolean;
  configured: boolean;
  hasCustomer: boolean;
  notice?: "paid" | null;
};

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const planName = (plan: Plan) => `${plan[0].toUpperCase()}${plan.slice(1)}`;

// The billing page without the database and Stripe, so it can be shown on its own.
export async function BillingView({ state, taken, seats, interval, manages, configured, hasCustomer, notice }: BillingViewProps) {
  const [t, format] = await Promise.all([getTranslations("Billing"), getFormatter()]);
  const money = (ore: number) => format.number(ore / 100, { style: "currency", currency: "NOK", maximumFractionDigits: 0 });
  const date = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { day: "numeric", month: "long", year: "numeric" }) : "");
  const paying = state.kind === "active" ? state : null;
  const extra = paying ? extraPeople(paying.plan, taken) : 0;

  let status: { tone: "ok" | "info" | "warn" | "danger"; icon: ReactNode; title: string; lead: string };
  switch (state.kind) {
    case "trial":
      status = {
        tone: state.daysLeft <= 7 ? "warn" : "info",
        icon: <ClockIcon className="size-6 shrink-0" />,
        title: t("status.trial", { days: state.daysLeft }),
        lead: t("status.trialLead", { date: date(state.endsAt) }),
      };
      break;
    case "trialEnded":
      status = { tone: "danger", icon: <AlertIcon className="size-6 shrink-0" />, title: t("status.trialEnded"), lead: t("status.trialEndedLead") };
      break;
    case "active":
      status = {
        tone: state.ending ? "warn" : "ok",
        icon: <CheckCircleIcon className="size-6 shrink-0" />,
        title: t("status.active", { plan: planName(state.plan) }),
        lead: state.renewsAt
          ? state.ending
            ? t("status.activeEnding", { date: date(state.renewsAt) })
            : t("status.activeRenews", { date: date(state.renewsAt) })
          : "",
      };
      break;
    case "pastDue":
      status = { tone: "danger", icon: <AlertIcon className="size-6 shrink-0" />, title: t("status.pastDue"), lead: t("status.pastDueLead") };
      break;
    default:
      status = { tone: "danger", icon: <XCircleIcon className="size-6 shrink-0" />, title: t("status.ended"), lead: t("status.endedLead") };
  }
  const tones = {
    ok: "border-success/40 bg-success-soft text-success",
    info: "border-accent/30 bg-accent-soft text-accent",
    warn: "border-warning/40 bg-warning-soft text-warning",
    danger: "border-danger/40 bg-danger-soft text-danger",
  };

  return (
    <div className="grid gap-8">
      <div className="grid max-w-2xl gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>

      {notice === "paid" && (
        <p role="status" className="flex max-w-2xl items-start gap-2 rounded-lg border border-success/40 bg-success-soft p-3 font-medium text-success">
          <CheckCircleIcon className="mt-0.5 size-5 shrink-0" />
          {t("paid")}
        </p>
      )}

      <section aria-labelledby="billing-status" className="grid max-w-2xl gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <div className={`flex items-start gap-3 rounded-lg border p-3 ${tones[status.tone]}`}>
          {status.icon}
          <div className="grid min-w-0 gap-0.5">
            <h2 id="billing-status" className="text-lg font-semibold">
              {status.title}
            </h2>
            {status.lead && <p className="font-medium">{status.lead}</p>}
          </div>
        </div>
        <p className="flex items-center gap-2 text-foreground">
          <UsersIcon className="size-5 shrink-0 text-muted" />
          {seats === null ? t("people", { taken }) : t("peopleOf", { taken, seats })}
        </p>
        {extra > 0 && <p className="-mt-2 pl-7 text-muted">{t("extraPeople", { count: extra })}</p>}
        {manages && configured && hasCustomer && (
          <div className="grid gap-2 border-t border-border pt-4">
            <p className="text-muted">{t("portalLead")}</p>
            <div>
              <PortalForm />
            </div>
          </div>
        )}
      </section>

      {!configured && (
        <p role="status" className="flex max-w-2xl items-start gap-2 rounded-lg border border-border bg-surface p-3 font-medium text-foreground">
          <AlertIcon className="mt-0.5 size-5 shrink-0 text-muted" />
          {t("notConfigured")}
        </p>
      )}
      {!manages && <p className="max-w-2xl text-muted">{t("askOwner")}</p>}

      <section aria-labelledby="billing-plans" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <h2 id="billing-plans" className="text-xl font-semibold">
              {t("plansTitle")}
            </h2>
            <p className="text-muted">{t(VAT_REGISTERED ? "plansLead" : "plansLeadNoVat")}</p>
          </div>
          <nav aria-label={t("intervalLabel")} className="grid w-full grid-cols-2 gap-1 rounded-lg border border-border bg-surface p-1 sm:w-auto">
            {(["month", "year"] as const).map((value) => (
              <Link
                key={value}
                href={`/app/billing?interval=${value}`}
                aria-current={interval === value ? "page" : undefined}
                className={`flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-center font-medium ${focusRing} ${
                  interval === value ? "bg-accent text-on-accent" : "text-foreground hover:bg-background"
                }`}
              >
                {interval === value && <CheckCircleIcon className="size-4 shrink-0" />}
                {t(value === "month" ? "monthly" : "yearly")}
              </Link>
            ))}
          </nav>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const current = paying?.plan === plan && (paying.interval ?? "month") === interval;
            const fits = planFits(plan, taken);
            const price = planPrice(plan, interval);
            return (
              <li
                key={plan}
                className={`flex flex-col gap-4 rounded-xl border bg-surface p-5 ${current ? "border-accent ring-1 ring-accent" : "border-border"}`}
              >
                <div className="grid gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold">{planName(plan)}</h3>
                    {current && (
                      <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-sm font-semibold text-accent">
                        <CheckCircleIcon className="size-4" />
                        {t("current")}
                      </span>
                    )}
                  </div>
                  <p className="text-muted">{plan === "solo" ? t("seatsSolo") : t("seats", { count: planSeats[plan] })}</p>
                </div>
                <div className="grid gap-0.5">
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">
                    {money(price)}
                    <span className="text-base font-normal text-muted"> / {t(interval === "month" ? "month" : "year")}</span>
                  </p>
                  <p className="text-sm text-muted">
                    {interval === "year" ? t("yearNote", { price: money(planPrice(plan, "month")) }) : t(VAT_REGISTERED ? "exVat" : "noVat")}
                  </p>
                  {plan === "bedrift" && (
                    <p className="text-sm text-muted">
                      {t("extraPerson", {
                        count: planSeats.bedrift,
                        price: `${money(extraPersonPrice(interval))} / ${t(interval === "month" ? "month" : "year")}`,
                      })}
                    </p>
                  )}
                </div>
                <div className="mt-auto grid gap-2">
                  {!fits && (
                    <p className="flex items-start gap-1.5 text-sm font-medium text-danger">
                      <AlertIcon className="mt-0.5 size-4 shrink-0" />
                      {t("tooSmall", { taken, seats: planSeats[plan] })}
                    </p>
                  )}
                  {manages && configured && fits && !current && (
                    <ChoosePlanForm
                      plan={plan}
                      interval={interval}
                      label={paying ? t("change", { plan: planName(plan) }) : t("choose", { plan: planName(plan) })}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="max-w-2xl text-sm text-muted">{state.kind === "trial" ? t("trialNote") : t("vatNote")}</p>
      </section>
    </div>
  );
}
