import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertIcon, ArrowRightIcon, ClockIcon } from "@/components/icons";
import { needsAttention, type BillingState } from "@/lib/billing";

// A line above every app page for owners and admins: the last week of the
// trial, or trouble with the payment (stage 14a).
export async function BillingBanner({ state }: { state: BillingState }) {
  if (!needsAttention(state)) return null;
  const t = await getTranslations("Billing.banner");
  const warning = state.kind === "trial";
  const text =
    state.kind === "trial"
      ? t("trial", { days: state.daysLeft })
      : state.kind === "pastDue"
        ? t("pastDue")
        : state.kind === "ended"
          ? t("ended")
          : t("trialEnded");
  return (
    <div
      role="status"
      className={`border-b ${warning ? "border-warning/40 bg-warning-soft text-warning" : "border-danger/40 bg-danger-soft text-danger"} pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]`}
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 sm:px-6">
        <p className="flex items-center gap-2 font-medium">
          {warning ? <ClockIcon className="size-5 shrink-0" /> : <AlertIcon className="size-5 shrink-0" />}
          {text}
        </p>
        <Link
          href="/app/billing"
          className="-mx-2 flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          {state.kind === "pastDue" ? t("fix") : t("action")}
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>
    </div>
  );
}
