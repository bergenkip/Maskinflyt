import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "@/components/icons";
import { toLocalParts } from "@/lib/jobs";
import { getCurrentMembership } from "@/lib/membership";
import { canSeeJobs } from "@/lib/roles";
import { BackLink } from "../back-link";
import { JobForm } from "../job-forms";
import { getJobOptions } from "../options";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Jobs");
  return { title: `${t("addTitle")} · Maskinflyt` };
}

export default async function NewJobPage({ searchParams }: PageProps<"/app/jobs/new">) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeJobs(membership.role)) redirect("/app");

  const { organization } = membership;
  const { customer } = await searchParams;
  const [t, options] = await Promise.all([getTranslations("Jobs"), getJobOptions(organization.id)]);
  // From a customer's page: that customer is already chosen.
  const customerId = typeof customer === "string" && options.customers.some((c) => c.id === customer) ? customer : "";

  return (
    <div className="grid max-w-3xl gap-8">
      <div className="grid gap-2">
        <BackLink label={t("back")} />
        <h1 className="text-3xl font-semibold tracking-tight">{t("addTitle")}</h1>
        <p className="text-muted">{t("addLead")}</p>
      </div>
      <section aria-label={t("addTitle")} className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6">
        {options.error ? (
          <p className="text-danger">{t("errors.unknown")}</p>
        ) : options.customers.length === 0 ? (
          <div className="grid gap-3">
            <p className="text-muted">{t("noCustomers")}</p>
            <Link
              href="/app/customers/new"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-fit"
            >
              <PlusIcon className="size-5" />
              {t("newCustomer")}
            </Link>
          </div>
        ) : (
          <JobForm
            customers={options.customers}
            vehicles={options.vehicles}
            drivers={options.drivers}
            timeZone={organization.timeZone}
            initial={{ customerId, date: toLocalParts(new Date(), organization.timeZone).date }}
          />
        )}
      </section>
    </div>
  );
}
