import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NEW_CUSTOMER, toLocalParts } from "@/lib/jobs";
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
        ) : (
          <JobForm
            customers={options.customers}
            vehicles={options.vehicles}
            drivers={options.drivers}
            suggestions={options.suggestions}
            timeZone={organization.timeZone}
            // With no customers yet, the first one is added with the job.
            initial={{
              customerId: customerId || (options.customers.length === 0 ? NEW_CUSTOMER : ""),
              date: toLocalParts(new Date(), organization.timeZone).date,
            }}
          />
        )}
      </section>
    </div>
  );
}
