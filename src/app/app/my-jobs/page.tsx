import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ClockIcon, MapPinIcon, PhoneIcon, TruckIcon } from "@/components/icons";
import { addDays } from "@/lib/calendar";
import { fromLocalParts, toLocalParts, type JobStatus } from "@/lib/jobs";
import { getCurrentMembership } from "@/lib/membership";
import { mapHref, phoneHref, type JobEventKind, type JobProgress } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";
import { ProgressBadge, progressIcon } from "../jobs/progress-badge";
import { NoteForm, StepButtons } from "./job-steps";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("MyJobs");
  return { title: `${t("title")} · Maskinflyt` };
}

type MyJob = {
  id: string;
  number: number;
  starts_at: string;
  ends_at: string;
  status: JobStatus;
  progress: JobProgress | null;
  progress_at: string | null;
  address: string;
  site_contact: string | null;
  description: string | null;
  time_note: string | null;
  customer_name: string;
  vehicle_name: string | null;
};
type EventRow = { job_id: string; kind: JobEventKind; note: string | null; created_at: string };

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const linkButton = `flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 font-semibold text-accent hover:bg-accent-soft ${focusRing}`;

// The driver's phone view: today's and tomorrow's jobs (and any started and not
// finished), with the address, whom to call and big buttons for each step.
// Anyone given a job sees it here, also an owner who drives.
export default async function MyJobsPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");

  const { organization } = membership;
  const { timeZone } = organization;
  const today = toLocalParts(new Date(), timeZone).date;
  const tomorrow = addDays(today, 1);
  const midnight = (day: string) => fromLocalParts(day, "00:00", timeZone) ?? fromLocalParts(day, "01:00", timeZone)!;

  const supabase = await createClient();
  const [t, tJobs, format, result] = await Promise.all([
    getTranslations("MyJobs"),
    getTranslations("Jobs"),
    getFormatter(),
    supabase.rpc("my_jobs", {
      org: organization.id,
      from_at: midnight(today).toISOString(),
      to_at: midnight(addDays(today, 2)).toISOString(),
    }),
  ]);
  const jobs = (result.data ?? []) as MyJob[];
  // Steps and notes of these jobs; the database shows a driver only their own.
  const { data: eventRows } =
    jobs.length > 0
      ? await supabase
          .from("job_events")
          .select("job_id, kind, note, created_at")
          .in(
            "job_id",
            jobs.map((job) => job.id),
          )
          .order("created_at")
      : { data: [] };
  const events = (eventRows ?? []) as EventRow[];

  const time = (iso: string) => format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone });
  const span = (job: MyJob) => tJobs("timeSpan", { start: time(job.starts_at), end: time(job.ends_at) });
  const progressLabel = (job: MyJob) =>
    job.progress
      ? t("progressAt", { step: t(`progress.${job.progress}`), time: time(job.progress_at ?? job.starts_at) })
      : t("progress.none");
  // A job started earlier and still going belongs to today.
  const groups = [
    { day: today, title: t("today"), jobs: jobs.filter((job) => toLocalParts(new Date(job.starts_at), timeZone).date <= today) },
    { day: tomorrow, title: t("tomorrow"), jobs: jobs.filter((job) => toLocalParts(new Date(job.starts_at), timeZone).date === tomorrow) },
  ];
  const dayName = (day: string) =>
    format.dateTime(new Date(`${day}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <div className="grid max-w-2xl gap-6">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      {result.error && <p className="text-danger">{tJobs("errors.unknown")}</p>}

      {groups.map((group) => (
        <section key={group.day} aria-labelledby={`day-${group.day}`} className="grid gap-3">
          <h2 id={`day-${group.day}`} className="text-xl font-semibold">
            {group.title} <span className="font-normal text-muted first-letter:uppercase">· {dayName(group.day)}</span>
          </h2>
          {group.jobs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-muted">{t("noJobs")}</p>
          ) : (
            <ul className="grid gap-4">
              {group.jobs.map((job) => {
                const phone = phoneHref(job.site_contact);
                const own = events.filter((event) => event.job_id === job.id);
                const open = job.status === "new" || job.status === "planned";
                return (
                  <li key={job.id}>
                    {/* Customer names, addresses and notes are data and are shown exactly as entered. */}
                    <article
                      aria-labelledby={`job-${job.id}`}
                      className="grid gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5"
                    >
                      <header className="grid gap-1">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <p className="flex items-center gap-1.5 text-lg font-semibold tabular-nums">
                            <ClockIcon className="size-5 text-muted" />
                            {span(job)}
                          </p>
                          <ProgressBadge progress={job.progress} label={progressLabel(job)} />
                        </div>
                        <h3 id={`job-${job.id}`} className="text-xl font-semibold [overflow-wrap:anywhere]">
                          {job.customer_name}
                        </h3>
                        <p className="text-sm text-muted">
                          {tJobs("numberShort", { number: job.number })}
                          {job.time_note && <> · {job.time_note}</>}
                        </p>
                      </header>

                      <dl className="grid gap-3">
                        <div className="grid gap-2">
                          <dt className="flex items-center gap-1.5 text-sm font-medium text-muted">
                            <MapPinIcon className="size-4" />
                            {tJobs("address")}
                          </dt>
                          <dd className="grid gap-2">
                            <span className="text-lg [overflow-wrap:anywhere]">{job.address}</span>
                            <a href={mapHref(job.address)} target="_blank" rel="noopener noreferrer" className={`${linkButton} sm:justify-self-start`}>
                              <MapPinIcon className="size-5" />
                              {t("openMap")}
                            </a>
                          </dd>
                        </div>
                        {job.site_contact && (
                          <div className="grid gap-2">
                            <dt className="flex items-center gap-1.5 text-sm font-medium text-muted">
                              <PhoneIcon className="size-4" />
                              {tJobs("siteContact")}
                            </dt>
                            <dd className="grid gap-2">
                              <span className="[overflow-wrap:anywhere]">{job.site_contact}</span>
                              {phone && (
                                <a href={phone} className={`${linkButton} sm:justify-self-start`}>
                                  <PhoneIcon className="size-5" />
                                  {t("call")}
                                </a>
                              )}
                            </dd>
                          </div>
                        )}
                        <div className="grid gap-1">
                          <dt className="flex items-center gap-1.5 text-sm font-medium text-muted">
                            <TruckIcon className="size-4" />
                            {tJobs("vehicle")}
                          </dt>
                          <dd className="[overflow-wrap:anywhere]">{job.vehicle_name ?? tJobs("noVehicle")}</dd>
                        </div>
                        {job.description && (
                          <div className="grid gap-1">
                            <dt className="text-sm font-medium text-muted">{tJobs("description")}</dt>
                            <dd className="whitespace-pre-line [overflow-wrap:anywhere]">{job.description}</dd>
                          </div>
                        )}
                      </dl>

                      {open ? (
                        <StepButtons job={job.id} progress={job.progress} />
                      ) : (
                        <p className="font-medium text-success">{t(job.progress === "finished" ? "finishedNote" : "closedNote")}</p>
                      )}

                      {own.length > 0 && (
                        <details className="group rounded-lg border border-border">
                          <summary className={`flex min-h-11 cursor-pointer items-center px-3 font-medium ${focusRing}`}>
                            {t("history", { count: own.length })}
                          </summary>
                          <ol className="grid gap-2 border-t border-border p-3">
                            {own.map((event, i) => {
                              const Icon = progressIcon[event.kind];
                              return (
                                <li key={i} className="flex items-start gap-2 text-sm">
                                  <Icon className="mt-0.5 size-4 text-muted" />
                                  <span className="font-semibold tabular-nums">{time(event.created_at)}</span>
                                  <span className="min-w-0 [overflow-wrap:anywhere]">
                                    {t(`events.${event.kind}`)}
                                    {event.note && <>: {event.note}</>}
                                  </span>
                                </li>
                              );
                            })}
                          </ol>
                        </details>
                      )}

                      {job.status !== "cancelled" && (
                        <details className="rounded-lg border border-border">
                          <summary className={`flex min-h-11 cursor-pointer items-center px-3 font-medium ${focusRing}`}>
                            {t("addNote")}
                          </summary>
                          <div className="border-t border-border p-3">
                            <NoteForm job={job.id} />
                          </div>
                        </details>
                      )}
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
