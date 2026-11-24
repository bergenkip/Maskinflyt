import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NEW_CUSTOMER, toLocalParts } from "@/lib/jobs";
import { getCurrentMembership } from "@/lib/membership";
import { canSeeJobs } from "@/lib/roles";
import { FormAlert } from "@/components/form";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "../back-link";
import { JobForm } from "../job-forms";
import { getJobOptions } from "../options";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Jobs");
  return { title: `${t("addTitle")} · MaskinGo` };
}

export default async function NewJobPage({ searchParams }: PageProps<"/app/jobs/new">) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeJobs(membership)) redirect("/app");

  const { organization } = membership;
  const { customer, date, start, vehicle, driver, request, email } = await searchParams;
  const supabase = await createClient();
  const [t, tRequests, options, fromRequest] = await Promise.all([
    getTranslations("Jobs"),
    getTranslations("JobRequests"),
    getJobOptions(organization.id),
    // From an accepted request: its customer, place, day and description (RLS: this company's only).
    typeof request === "string" && /^[0-9a-f-]{36}$/i.test(request)
      ? supabase
          .from("job_requests")
          .select("name, customer_id, place, wanted_date, wanted_start, description")
          .eq("id", request)
          .eq("status", "accepted")
          .maybeSingle()
      : null,
  ]);
  const accepted = fromRequest?.data as
    | {
        name: string;
        customer_id: string | null;
        place: string;
        wanted_date: string | null;
        wanted_start: string | null;
        description: string;
      }
    | null
    | undefined;
  // From a customer's page or a request: that customer is already chosen.
  const wantedCustomer = accepted?.customer_id ?? customer;
  const customerId =
    typeof wantedCustomer === "string" && options.customers.some((c) => c.id === wantedCustomer) ? wantedCustomer : "";
  // From the calendar: the free slot that was tapped. Anything not on the lists is ignored.
  const pick = (value: unknown, list: { id: string }[]) =>
    typeof value === "string" && list.some((item) => item.id === value) ? value : "";
  const driverId = pick(driver, options.drivers);
  const vehicleId = pick(vehicle, options.vehicles) || (driverId ? (options.suggestions[driverId]?.vehicleId ?? "") : "");
  // A time the customer picked gives the day and the start, read in the company's time zone.
  const picked = accepted?.wanted_start ? toLocalParts(new Date(accepted.wanted_start), organization.timeZone) : null;
  const wantedDate = picked?.date ?? accepted?.wanted_date ?? date;
  const startDate =
    typeof wantedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(wantedDate) && !Number.isNaN(Date.parse(wantedDate)) ? wantedDate : "";
  const wantedStart = picked?.time ?? start;
  const startTime = typeof wantedStart === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(wantedStart) ? wantedStart : "";

  return (
    <div className="grid max-w-3xl gap-8">
      <div className="grid gap-2">
        <BackLink label={t("back")} />
        <h1 className="text-3xl font-semibold tracking-tight">{t("addTitle")}</h1>
        <p className="text-muted">{t("addLead")}</p>
      </div>
      {accepted && (
        <div className="grid gap-2" aria-live="polite">
          {email === "sent" && <FormAlert kind="success">{tRequests("emailSent")}</FormAlert>}
          {email === "failed" && <FormAlert kind="error">{tRequests("emailFailed")}</FormAlert>}
          {/* The customer's name is data and is shown exactly as written. */}
          <p className="font-medium [overflow-wrap:anywhere]">{t("fromRequest", { name: accepted.name })}</p>
        </div>
      )}
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
              date: startDate || toLocalParts(new Date(), organization.timeZone).date,
              startTime,
              vehicleId,
              driverId,
              ...(accepted ? { address: accepted.place, description: accepted.description } : {}),
            }}
          />
        )}
      </section>
    </div>
  );
}
