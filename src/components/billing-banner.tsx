import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertIcon, ArrowRightIcon, ClockIcon } from "@/components/icons";
import { needsAttention, type BillingState } from "@/lib/billing";

// A line above every app page. Owners and admins see the last week of the
// trial and trouble with the payment (stage 14a); everyone sees when the
// company can only read (stage 14b), and only those who pay get the link.
export async function BillingBanner({ state, readOnly, manages }: { state: BillingState; readOnly: boolean; manages: boolean }) {
  if (!readOnly && !(manages && needsAttention(state))) return null;
  const t = await getTranslations("Billing.banner");
  const locked = readOnly || state.kind === "trialEnded" || state.kind === "ended";
  const warning = !locked && state.kind === "trial";
  const text = locked
    ? manages
      ? t("readOnly")
      : t("readOnlyMember")
    : state.kind === "trial"
      ? t("trial", { days: state.daysLeft })
      : t("pastDue");
  return (
    <div
      role="status"
      className={`border-b ${warning ? "border-warning/40 bg-warning-soft text-warning" : "border-danger/40 bg-danger-soft text-danger"} pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]`}
    >
      <div
        className={`mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 sm:px-6 ${manages ? "py-1.5" : "py-3"}`}
      >
        <p className="flex items-start gap-2 font-medium">
          {warning ? <ClockIcon className="mt-0.5 size-5 shrink-0" /> : <AlertIcon className="mt-0.5 size-5 shrink-0" />}
          {text}
        </p>
        {manages && (
          <Link
            href="/app/billing"
            className="-mx-2 flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            {state.kind === "pastDue" ? t("fix") : t("action")}
            <ArrowRightIcon className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
