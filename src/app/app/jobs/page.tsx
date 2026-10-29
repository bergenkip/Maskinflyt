import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRightIcon, MapPinIcon, PlusIcon, TruckIcon, UserIcon } from "@/components/icons";
import { toLocalParts, type JobStatus } from "@/lib/jobs";
import type { JobProgress } from "@/lib/progress";
import { getCurrentMembership } from "@/lib/membership";
import { canSeeJobs } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { ProgressBadge } from "./progress-badge";
import { StatusBadge } from "./status-badge";
import { JobsViewNav } from "./view-nav";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Jobs");
  return { title: `${t("title")} · Maskinflyt` };
}

type Row = {
  id: string;
  number: number;
  address: string;
  starts_at: string;
  ends_at: string;
  status: JobStatus;
  progress: JobProgress | null;
  progress_at: string | null;
  driver_id: string | null;
  customers: { name: string } | null;
  vehicles: { name: string } | null;
};
type MemberRow = { user_id: string; email: string; full_name: string | null };

const filterClass =
  "flex min-h-11 items-center rounded-lg px-4 font-medium text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[current=page]:bg-surface aria-[current=page]:text-foreground aria-[current=page]:shadow-sm";

export default async function JobsPage({ searchParams }: PageProps<"/app/jobs">) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeJobs(membership.role)) redirect("/app");

  const { organization } = membership;
  const { show } = await searchParams;
  const past = show === "past";
  const now = new Date();
  const supabase = await createClient();
  // Upcoming: from the earliest still running, in time order. Earlier: newest first.
  const request = supabase
    .from("jobs")
    .select("id, number, address, starts_at, ends_at, status, progress, progress_at, driver_id, customers(name), vehicles(name)")
    .eq("organization_id", organization.id);
  const [t, tMy, format, result, members] = await Promise.all([
    getTranslations("Jobs"),
    getTranslations("MyJobs"),
    getFormatter(),
    past
      ? request.lt("ends_at", now.toISOString()).order("starts_at", { ascending: false }).limit(100)
      : request.gte("ends_at", now.toISOString()).order("starts_at").limit(200),
    supabase.rpc("list_members", { org: organization.id }),
  ]);
  const jobs = (result.data ?? []) as unknown as Row[];
  const people = new Map(((members.data ?? []) as MemberRow[]).map((m) => [m.user_id, m.full_name ?? m.email]));

  // Grouped by the company's local day.
  const { timeZone } = organization;
  const today = toLocalParts(now, timeZone).date;
  const tomorrow = toLocalParts(new Date(now.getTime() + 24 * 60 * 60 * 1000), timeZone).date;
  const days = new Map<string, Row[]>();
  for (const job of jobs) {
    const day = toLocalParts(new Date(job.starts_at), timeZone).date;
    days.set(day, [...(days.get(day) ?? []), job]);
  }
  const dayTitle = (day: string, first: Row) => {
    const date = format.dateTime(new Date(first.starts_at), { weekday: "long", day: "numeric", month: "long", timeZone });
    if (day === today) return `${t("today")} · ${date}`;
    if (day === tomorrow) return `${t("tomorrow")} · ${date}`;
    return date;
  };
  const time = (iso: string) => format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone });

  return (
    <div className="grid max-w-3xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid min-w-0 gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          {/* Company names are data and are shown exactly as entered. */}
          <p className="text-muted [overflow-wrap:anywhere]">{t("lead", { company: organization.name })}</p>
        </div>
        <Link
          href="/app/jobs/new"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
        >
          <PlusIcon className="size-5" />
          {t("addTitle")}
        </Link>
      </div>
      <JobsViewNav current="list" />

      <section aria-labelledby="list-title" className="grid gap-4">
        <h2 id="list-title" className="sr-only">
          {t("listTitle")}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label={t("show")} className="flex rounded-xl bg-accent-soft/60 p-1">
            <Link href="/app/jobs" aria-current={past ? undefined : "page"} className={filterClass}>
              {t("upcoming")}
            </Link>
            <Link href="/app/jobs?show=past" aria-current={past ? "page" : undefined} className={filterClass}>
              {t("past")}
            </Link>
          </nav>
          {!result.error && <p className="text-sm text-muted">{t("count", { count: jobs.length })}</p>}
        </div>

        {result.error ? (
          <p className="text-danger">{t("errors.unknown")}</p>
        ) : jobs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-muted">
            {past ? t("emptyPast") : t("emptyUpcoming")}
          </p>
        ) : (
          <div className="grid gap-6">
            {[...days].map(([day, dayJobs]) => (
              <section key={day} aria-labelledby={`day-${day}`} className="grid gap-3">
                <h3 id={`day-${day}`} className="text-sm font-semibold tracking-wide text-muted uppercase">
                  {dayTitle(day, dayJobs[0])}
                </h3>
                <ul className="grid gap-3">
                  {dayJobs.map((job) => (
                    <li key={job.id}>
                      <Link
                        href={`/app/jobs/${job.id}`}
                        className={`group flex items-start gap-3 rounded-xl border border-border bg-surface p-4 hover:border-accent/60 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${job.status === "cancelled" ? "opacity-75" : ""}`}
                      >
                        <span className="grid w-14 shrink-0 gap-0.5 pt-0.5 text-sm font-semibold tabular-nums sm:w-16 sm:text-base">
                          <span>{time(job.starts_at)}</span>
                          {/* The end is expected, not promised. */}
                          <span className="font-normal text-muted" aria-hidden="true">
                            {t("aboutTime", { time: time(job.ends_at) })}
                          </span>
                          <span className="sr-only">{t("untilAbout", { time: time(job.ends_at) })}</span>
                        </span>
                        <span className="grid min-w-0 flex-1 gap-1">
                          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            {/* Customer names and addresses are data and are shown exactly as entered. */}
                            <span
                              className={`font-semibold [overflow-wrap:anywhere] ${job.status === "cancelled" ? "line-through decoration-1" : ""}`}
                            >
                              {job.customers?.name}
                            </span>
                            <StatusBadge status={job.status} label={t(`statuses.${job.status}`)} />
                          </span>
                          <span className="flex items-start gap-1.5 text-sm [overflow-wrap:anywhere]">
                            <MapPinIcon className="mt-0.5 size-4 text-muted" />
                            {job.address}
                          </span>
                          <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted">
                            <span className="flex items-center gap-1.5 [overflow-wrap:anywhere]">
                              <TruckIcon className="size-4" />
                              {job.vehicles?.name ?? t("noVehicle")}
                            </span>
                            <span className="flex items-center gap-1.5 [overflow-wrap:anywhere]">
                              <UserIcon className="size-4" />
                              {(job.driver_id && people.get(job.driver_id)) ?? t("noDriver")}
                            </span>
                            <span className="tabular-nums">{t("numberShort", { number: job.number })}</span>
                          </span>
                          {/* What the driver last reported from the phone. */}
                          {job.progress && job.status !== "cancelled" && (
                            <ProgressBadge
                              progress={job.progress}
                              label={tMy("progressAt", {
                                step: tMy(`progress.${job.progress}`),
                                time: time(job.progress_at ?? job.starts_at),
                              })}
                            />
                          )}
                        </span>
                        <ArrowRightIcon className="mt-1 size-5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
