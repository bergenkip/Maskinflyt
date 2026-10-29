import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { FormAlert } from "@/components/form";
import { getAddedBy } from "@/lib/added-by";
import { jobColumns, toJobFormValues, type Job } from "@/lib/jobs";
import { getCurrentMembership } from "@/lib/membership";
import type { JobEventKind, JobProgress } from "@/lib/progress";
import { canSeeJobs } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "../back-link";
import { JobForm, JobStatusForm } from "../job-forms";
import { getJobOptions } from "../options";
import { ProgressBadge, progressIcon } from "../progress-badge";
import { StatusBadge } from "../status-badge";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sectionClass = "grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6";

type JobRow = Job & { customers: { name: string } | null; progress: JobProgress | null; progress_at: string | null };
type EventRow = { kind: JobEventKind; note: string | null; created_at: string };

async function getJob(id: string) {
  if (!uuid.test(id)) return null;
  const supabase = await createClient();
  // RLS returns nothing for another company's job: it is "not found" here too.
  const { data } = await supabase.from("jobs").select(`${jobColumns}, progress, progress_at, customers(name)`).eq("id", id).maybeSingle();
  return data as unknown as JobRow | null;
}

export async function generateMetadata({ params }: PageProps<"/app/jobs/[id]">): Promise<Metadata> {
  const [t, job] = await Promise.all([getTranslations("Jobs"), getJob((await params).id)]);
  return { title: `${job ? t("jobTitle", { number: job.number }) : t("title")} · Maskinflyt` };
}

export default async function JobPage({ params, searchParams }: PageProps<"/app/jobs/[id]">) {
  const { id } = await params;
  const { added } = await searchParams;
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeJobs(membership.role)) redirect("/app");

  const { organization } = membership;
  const job = await getJob(id);
  if (!job) notFound();
  const supabase = await createClient();
  const [t, tMy, format, addedBy, options, eventsResult] = await Promise.all([
    getTranslations("Jobs"),
    getTranslations("MyJobs"),
    getFormatter(),
    getAddedBy(organization.id),
    getJobOptions(organization.id, { customerId: job.customer_id, vehicleId: job.vehicle_id }),
    supabase.from("job_events").select("kind, note, created_at").eq("job_id", job.id).order("created_at"),
  ]);
  const events = (eventsResult.data ?? []) as EventRow[];
  const when = (iso: string) =>
    format.dateTime(new Date(iso), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: organization.timeZone });
  const money = (ore: number) => format.number(ore / 100, { style: "currency", currency: organization.currency });
  const price =
    job.vehicle_id === null
      ? t("priceNoMachine")
      : job.hourly_rate === null
        ? t("priceNone")
        : t(job.customer_rate ? "priceCustomer" : "priceUsual", { amount: money(job.hourly_rate) });

  return (
    <div className="grid max-w-3xl gap-8">
      <div className="grid gap-2">
        <BackLink label={t("back")} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-semibold tracking-wide text-accent uppercase">{t("jobTitle", { number: job.number })}</p>
          <StatusBadge status={job.status} label={t(`statuses.${job.status}`)} size="md" />
        </div>
        {/* Customer names are data and are shown exactly as entered. */}
        <h1 className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">
          <Link
            href={`/app/customers/${job.customer_id}`}
            className="rounded-sm underline decoration-border decoration-2 underline-offset-4 hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {job.customers?.name}
          </Link>
        </h1>
        {/* Person names are data and are shown exactly as entered. */}
        <p className="text-sm text-muted [overflow-wrap:anywhere]">{addedBy(job)}</p>
      </div>

      {added === "1" && <FormAlert kind="success">{t("added", { number: job.number })}</FormAlert>}

      <section aria-labelledby="details-title" className={sectionClass}>
        <h2 id="details-title" className="text-lg font-semibold">
          {t("detailsTitle")}
        </h2>
        {options.error ? (
          <p className="text-danger">{t("errors.unknown")}</p>
        ) : (
          <JobForm
            customers={options.customers}
            vehicles={options.vehicles}
            drivers={options.drivers}
            suggestions={options.suggestions}
            timeZone={organization.timeZone}
            job={{ id: job.id, values: toJobFormValues(job, organization.timeZone) }}
          />
        )}
      </section>

      <section aria-labelledby="price-title" className={sectionClass}>
        <div className="grid gap-1">
          <h2 id="price-title" className="text-lg font-semibold">
            {t("priceTitle")}
          </h2>
          <p className="font-medium tabular-nums">{price}</p>
          <p className="text-sm text-muted">{t("priceLead")}</p>
        </div>
      </section>

      {/* What the driver reported from the phone, step by step, with notes from the site. */}
      <section aria-labelledby="progress-title" className={sectionClass}>
        <div className="grid gap-1">
          <h2 id="progress-title" className="text-lg font-semibold">
            {tMy("officeTitle")}
          </h2>
          <ProgressBadge
            progress={job.progress}
            label={
              job.progress
                ? tMy("progressAt", { step: tMy(`progress.${job.progress}`), time: when(job.progress_at ?? job.starts_at) })
                : tMy("progress.none")
            }
          />
        </div>
        {events.length === 0 ? (
          <p className="text-muted">{tMy("officeEmpty")}</p>
        ) : (
          <ol className="grid gap-2">
            {events.map((event, i) => {
              const Icon = progressIcon[event.kind];
              return (
                <li key={i} className="flex items-start gap-2">
                  <Icon className="mt-0.5 size-4 text-muted" />
                  <span className="shrink-0 font-semibold tabular-nums">{when(event.created_at)}</span>
                  {/* Notes are data and are shown exactly as written. */}
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {tMy(`events.${event.kind}`)}
                    {event.note && <>: {event.note}</>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="status-title" className={sectionClass}>
        <div className="grid gap-1">
          <h2 id="status-title" className="text-lg font-semibold">
            {t("statusTitle")}
          </h2>
          <StatusBadge status={job.status} label={t(`statuses.${job.status}`)} size="md" />
          <p className="text-muted">{t(`statusLead.${job.status}`)}</p>
        </div>
        <JobStatusForm id={job.id} status={job.status} />
      </section>
    </div>
  );
}
