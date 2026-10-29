import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "@/components/icons";
import {
  addDays,
  calendarRange,
  minutesOnDay,
  parseDate,
  visibleHours,
  weekNumber,
  type CalendarGroup,
  type CalendarView,
} from "@/lib/calendar";
import { toLocalParts, type JobStatus } from "@/lib/jobs";
import { getCurrentMembership } from "@/lib/membership";
import { canSeeJobs } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge, StatusIcon } from "../status-badge";
import { JobsViewNav, segmentClass } from "../view-nav";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Calendar");
  return { title: `${t("title")} · Maskinflyt` };
}

type Row = {
  id: string;
  number: number;
  address: string;
  starts_at: string;
  ends_at: string;
  status: JobStatus;
  vehicle_id: string | null;
  driver_id: string | null;
  customers: { name: string } | null;
};
type Named = { id: string; name: string; active: boolean };
type MemberRow = { user_id: string; email: string; full_name: string | null };
type Resource = { id: string; name: string };

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const barTone: Record<JobStatus, string> = {
  new: "border-warning/60 bg-warning-soft",
  planned: "border-accent/50 bg-accent-soft",
  done: "border-success/50 bg-success-soft",
  cancelled: "border-border bg-surface",
};

// Puts overlapping jobs of one row on separate lanes, so a double booking shows as two bars.
function lanes<T extends { start: number; end: number }>(items: T[]): (T & { lane: number })[] {
  const ends: number[] = [];
  return [...items]
    .sort((a, b) => a.start - b.start)
    .map((item) => {
      let lane = ends.findIndex((end) => end <= item.start);
      if (lane === -1) lane = ends.length;
      ends[lane] = item.end;
      return { ...item, lane };
    });
}

export default async function CalendarPage({ searchParams }: PageProps<"/app/jobs/calendar">) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeJobs(membership.role)) redirect("/app");

  const { organization } = membership;
  const { timeZone } = organization;
  const params = await searchParams;
  const today = toLocalParts(new Date(), timeZone).date;
  const date = parseDate(params.date, today);
  const view: CalendarView = params.view === "week" ? "week" : "day";
  const by: CalendarGroup = params.by === "driver" ? "driver" : "vehicle";
  const range = calendarRange(date, view, timeZone);

  const supabase = await createClient();
  const [t, tJobs, format, jobsResult, vehiclesResult, membersResult] = await Promise.all([
    getTranslations("Calendar"),
    getTranslations("Jobs"),
    getFormatter(),
    // Every job that shares any time with the days shown; cancelled ones stay on the list only.
    supabase
      .from("jobs")
      .select("id, number, address, starts_at, ends_at, status, vehicle_id, driver_id, customers(name)")
      .eq("organization_id", organization.id)
      .neq("status", "cancelled")
      .lt("starts_at", range.to.toISOString())
      .gt("ends_at", range.from.toISOString())
      .order("starts_at")
      .limit(500),
    supabase.from("vehicles").select("id, name, active").eq("organization_id", organization.id).order("name"),
    supabase.rpc("list_members", { org: organization.id }),
  ]);
  const failed = jobsResult.error ?? vehiclesResult.error ?? membersResult.error;
  const jobs = (jobsResult.data ?? []) as unknown as Row[];
  const people = ((membersResult.data ?? []) as MemberRow[]).map((m) => ({ id: m.user_id, name: m.full_name ?? m.email }));
  const keyOf = (job: Row) => (by === "vehicle" ? job.vehicle_id : job.driver_id);
  const busy = new Set(jobs.map(keyOf));
  // Machines in use, and switched-off ones only while they still have jobs here.
  const resources: Resource[] =
    by === "vehicle"
      ? ((vehiclesResult.data ?? []) as Named[]).filter((v) => v.active || busy.has(v.id)).map(({ id, name }) => ({ id, name }))
      : people;
  const unassigned = jobs.filter((job) => !keyOf(job));
  const jobsOf = (resource: Resource) => jobs.filter((job) => keyOf(job) === resource.id);
  // Jobs that share some time with that day (a job ending at midnight is not on the next day).
  const jobsOn = (list: Row[], day: string) =>
    list.filter(
      (job) =>
        toLocalParts(new Date(job.starts_at), timeZone).date <= day &&
        toLocalParts(new Date(Date.parse(job.ends_at) - 1), timeZone).date >= day,
    );

  // Addresses of this page with other choices, and of a new job with the slot filled in.
  const here = (change: { date?: string; view?: CalendarView; by?: CalendarGroup }) => {
    const next = new URLSearchParams({ date: change.date ?? date, view: change.view ?? view, by: change.by ?? by });
    return `/app/jobs/calendar?${next}`;
  };
  const newJob = (day: string, resource?: Resource, hour?: number) => {
    const next = new URLSearchParams({ date: day });
    if (hour !== undefined) next.set("start", `${String(hour).padStart(2, "0")}:00`);
    if (resource) next.set(by, resource.id);
    return `/app/jobs/new?${next}`;
  };

  const time = (iso: string) => format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone });
  const span = (job: Row) => tJobs("timeSpan", { start: time(job.starts_at), end: time(job.ends_at) });
  const status = (job: Row) => tJobs(`statuses.${job.status}`);
  const dayName = (day: string, style: "long" | "short") =>
    format.dateTime(new Date(`${day}T12:00:00Z`), {
      weekday: style,
      day: "numeric",
      month: style === "long" ? "long" : "short",
      timeZone: "UTC",
    });
  const step = view === "week" ? 7 : 1;
  const heading =
    view === "week"
      ? t("weekHeading", {
          week: weekNumber(date),
          range: format.dateTimeRange(new Date(`${range.days[0]}T12:00:00Z`), new Date(`${range.days[6]}T12:00:00Z`), {
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          }),
        })
      : dayName(date, "long");
  // Customer names are data and are shown exactly as entered.
  const jobLabel = (job: Row) =>
    t("jobLabel", { number: job.number, customer: job.customers?.name ?? "", time: span(job), status: status(job) });

  // The day timeline (tablets and computers).
  const spans = jobs.map((job) => minutesOnDay(job, date, timeZone));
  const hours = visibleHours(view === "day" ? spans : []);
  const hourList = Array.from({ length: hours.to - hours.from }, (_, i) => hours.from + i);
  const percent = (minutes: number) => ((minutes - hours.from * 60) / ((hours.to - hours.from) * 60)) * 100;

  return (
    <div className="grid gap-6">
      <div className="flex max-w-3xl flex-wrap items-end justify-between gap-4">
        <div className="grid min-w-0 gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted">{t("lead")}</p>
        </div>
        <Link
          href={newJob(date)}
          className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 font-semibold text-on-accent hover:bg-accent/90 sm:w-auto ${focusRing}`}
        >
          <PlusIcon className="size-5" />
          {tJobs("addTitle")}
        </Link>
      </div>
      <JobsViewNav current="calendar" />

      {/* Which days, and grouped how. */}
      <div className="grid gap-3 lg:flex lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Link
            href={here({ date: addDays(date, -step) })}
            aria-label={t(view === "week" ? "previousWeek" : "previousDay")}
            className={`flex size-11 items-center justify-center rounded-lg border border-border bg-surface hover:bg-accent-soft ${focusRing}`}
          >
            <ChevronLeftIcon />
          </Link>
          <Link
            href={here({ date: today })}
            aria-current={range.days.includes(today) ? "date" : undefined}
            className={`flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 font-medium hover:bg-accent-soft ${focusRing}`}
          >
            {t("today")}
          </Link>
          <Link
            href={here({ date: addDays(date, step) })}
            aria-label={t(view === "week" ? "nextWeek" : "nextDay")}
            className={`flex size-11 items-center justify-center rounded-lg border border-border bg-surface hover:bg-accent-soft ${focusRing}`}
          >
            <ChevronRightIcon />
          </Link>
          <h2 className="ml-1 min-w-0 text-lg font-semibold first-letter:uppercase [overflow-wrap:anywhere]" aria-live="polite">
            {heading}
          </h2>
        </div>
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <nav aria-label={t("viewLabel")} className="flex rounded-xl bg-accent-soft/60 p-1">
            {(["day", "week"] as const).map((value) => (
              <Link
                key={value}
                href={here({ view: value })}
                aria-current={view === value ? "page" : undefined}
                className={`${segmentClass} flex-1 justify-center`}
              >
                {t(value)}
              </Link>
            ))}
          </nav>
          <nav aria-label={t("groupLabel")} className="flex rounded-xl bg-accent-soft/60 p-1">
            {(["vehicle", "driver"] as const).map((value) => (
              <Link
                key={value}
                href={here({ by: value })}
                aria-current={by === value ? "page" : undefined}
                className={`${segmentClass} flex-1 justify-center`}
              >
                {t(value === "vehicle" ? "byVehicle" : "byDriver")}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {failed ? (
        <p className="text-danger">{tJobs("errors.unknown")}</p>
      ) : (
        <>
          {unassigned.length > 0 && (
            <section aria-labelledby="unassigned-title" className="grid max-w-3xl gap-3 rounded-xl border border-warning/50 bg-warning-soft p-4">
              <h2 id="unassigned-title" className="flex items-center gap-2 font-semibold">
                <AlertIcon className="size-5 text-warning" />
                {t(by === "vehicle" ? "withoutVehicle" : "withoutDriver", { count: unassigned.length })}
              </h2>
              <ul className="grid gap-2">
                {unassigned.map((job) => (
                  <li key={job.id}>
                    <Link
                      href={`/app/jobs/${job.id}`}
                      className={`flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-border bg-surface px-3 py-2 hover:border-accent/60 ${focusRing}`}
                    >
                      <span className="grid min-w-0 gap-0.5">
                        <span className="font-medium [overflow-wrap:anywhere]">{job.customers?.name}</span>
                        <span className="text-sm text-muted tabular-nums">
                          {view === "week" && `${dayName(toLocalParts(new Date(job.starts_at), timeZone).date, "short")} · `}
                          {span(job)}
                        </span>
                      </span>
                      <StatusBadge status={job.status} label={status(job)} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {resources.length === 0 ? (
            <p className="max-w-3xl rounded-xl border border-dashed border-border p-4 text-muted">
              {t(by === "vehicle" ? "noVehicles" : "noPeople")}
            </p>
          ) : view === "day" ? (
            <>
              {/* Phones: a card per machine or person, with that day's jobs in order. */}
              <ul className="grid gap-3 md:hidden">
                {resources.map((resource) => {
                  const own = jobsOn(jobsOf(resource), date);
                  return (
                    <li key={resource.id} className="grid gap-2 rounded-xl border border-border bg-surface p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="min-w-0 font-semibold [overflow-wrap:anywhere]">{resource.name}</h3>
                        <Link
                          href={newJob(date, resource, 7)}
                          aria-label={t("newJobFor", { name: resource.name })}
                          className={`flex size-11 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-accent-soft ${focusRing}`}
                        >
                          <PlusIcon className="size-5" />
                        </Link>
                      </div>
                      {own.length === 0 ? (
                        <p className="text-sm text-muted">{t("free")}</p>
                      ) : (
                        <ul className="grid gap-2">
                          {own.map((job) => (
                            <li key={job.id}>
                              <Link
                                href={`/app/jobs/${job.id}`}
                                className={`grid min-h-11 gap-0.5 rounded-lg border-l-4 px-3 py-2 ${barTone[job.status]} ${focusRing}`}
                              >
                                <span className="flex flex-wrap items-center justify-between gap-x-3 text-sm font-semibold tabular-nums">
                                  {span(job)}
                                  <StatusBadge status={job.status} label={status(job)} />
                                </span>
                                <span className="font-medium [overflow-wrap:anywhere]">{job.customers?.name}</span>
                                <span className="text-sm text-muted [overflow-wrap:anywhere]">{job.address}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Tablets and computers: a timeline per machine or person. Scrolls inside itself if narrow. */}
              <section aria-label={heading} className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
                <div style={{ minWidth: `${12 + hourList.length * 3.5}rem` }}>
                  <div className="grid grid-cols-[12rem_1fr] border-b border-border">
                    <span className="px-3 py-2 text-sm font-medium text-muted">{t(by === "vehicle" ? "byVehicle" : "byDriver")}</span>
                    <div className="relative h-9" aria-hidden="true">
                      {hourList.map((hour) => (
                        <span
                          key={hour}
                          className="absolute top-2 -translate-x-1/2 text-xs text-muted tabular-nums first:translate-x-0"
                          style={{ left: `${percent(hour * 60)}%` }}
                        >
                          {String(hour).padStart(2, "0")}
                        </span>
                      ))}
                    </div>
                  </div>
                  {resources.map((resource) => {
                    const placed = lanes(jobsOn(jobsOf(resource), date).map((job) => ({ job, ...minutesOnDay(job, date, timeZone) })));
                    const laneCount = Math.max(1, ...placed.map((p) => p.lane + 1));
                    return (
                      <div
                        key={resource.id}
                        role="group"
                        aria-label={resource.name}
                        className="grid grid-cols-[12rem_1fr] border-b border-border last:border-b-0"
                      >
                        <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                          <span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{resource.name}</span>
                          <Link
                            href={newJob(date, resource, 7)}
                            aria-label={t("newJobFor", { name: resource.name })}
                            className={`flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-accent-soft hover:text-accent ${focusRing}`}
                          >
                            <PlusIcon className="size-5" />
                          </Link>
                        </div>
                        <div className="relative" style={{ height: `${laneCount * 3.25 + 0.5}rem` }}>
                          {/* Each free hour starts a new job there (the + button does the same by keyboard). */}
                          {hourList.map((hour) => (
                            <Link
                              key={hour}
                              href={newJob(date, resource, hour)}
                              tabIndex={-1}
                              aria-hidden="true"
                              title={t("newJobAt", { name: resource.name, time: `${String(hour).padStart(2, "0")}:00` })}
                              className="absolute inset-y-0 border-l border-border/60 hover:bg-accent-soft/50"
                              style={{ left: `${percent(hour * 60)}%`, width: `${percent((hour + 1) * 60) - percent(hour * 60)}%` }}
                            />
                          ))}
                          {placed.map(({ job, start, end, lane }) => (
                            <Link
                              key={job.id}
                              href={`/app/jobs/${job.id}`}
                              aria-label={jobLabel(job)}
                              title={jobLabel(job)}
                              className={`absolute flex h-11 min-w-11 items-center gap-1.5 overflow-hidden rounded-lg border px-2 text-left text-sm shadow-sm hover:shadow-md ${barTone[job.status]} ${focusRing}`}
                              style={{
                                left: `${percent(Math.max(start, hours.from * 60))}%`,
                                width: `${percent(Math.min(end, hours.to * 60)) - percent(Math.max(start, hours.from * 60))}%`,
                                top: `${lane * 3.25 + 0.25}rem`,
                              }}
                            >
                              <StatusIcon status={job.status} />
                              <span className="grid min-w-0 leading-tight">
                                <span className="truncate font-semibold tabular-nums">
                                  {span(job)}
                                  {job.status !== "planned" && <span className="font-normal"> · {status(job)}</span>}
                                </span>
                                <span className="truncate">{job.customers?.name}</span>
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          ) : (
            <>
              {/* Phones: the week day by day. */}
              <ul className="grid gap-3 md:hidden">
                {range.days.map((day) => {
                  const own = jobsOn(jobs.filter((job) => keyOf(job)), day);
                  return (
                    <li key={day} className={`grid gap-2 rounded-xl border bg-surface p-4 ${day === today ? "border-accent" : "border-border"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold first-letter:uppercase">
                          {dayName(day, "long")}
                          {day === today && <span className="ml-2 text-sm font-medium text-accent">{t("today")}</span>}
                        </h3>
                        <Link
                          href={here({ date: day, view: "day" })}
                          aria-label={t("openDay", { day: dayName(day, "long") })}
                          className={`flex size-11 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-accent-soft ${focusRing}`}
                        >
                          <ChevronRightIcon className="size-5" />
                        </Link>
                      </div>
                      {own.length === 0 ? (
                        <p className="text-sm text-muted">{t("noJobsDay")}</p>
                      ) : (
                        <ul className="grid gap-2">
                          {own.map((job) => (
                            <li key={job.id}>
                              <Link
                                href={`/app/jobs/${job.id}`}
                                className={`grid min-h-11 gap-0.5 rounded-lg border-l-4 px-3 py-2 ${barTone[job.status]} ${focusRing}`}
                              >
                                <span className="flex flex-wrap items-center justify-between gap-x-3 text-sm font-semibold tabular-nums">
                                  {span(job)}
                                  <StatusBadge status={job.status} label={status(job)} />
                                </span>
                                <span className="font-medium [overflow-wrap:anywhere]">{job.customers?.name}</span>
                                <span className="text-sm text-muted [overflow-wrap:anywhere]">
                                  {resources.find((r) => r.id === keyOf(job))?.name}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Tablets and computers: machines or people down, days across. Scrolls inside itself if narrow. */}
              <section aria-label={heading} className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
                <table className="w-full min-w-[60rem] table-fixed border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="w-48 px-3 py-2 text-left font-medium text-muted">
                        {t(by === "vehicle" ? "byVehicle" : "byDriver")}
                      </th>
                      {range.days.map((day) => (
                        <th key={day} scope="col" className={`px-2 py-2 text-left font-medium ${day === today ? "text-accent" : "text-muted"}`}>
                          <Link href={here({ date: day, view: "day" })} className={`rounded-sm first-letter:uppercase hover:underline ${focusRing}`}>
                            {dayName(day, "short")}
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resources.map((resource) => (
                      <tr key={resource.id} className="border-b border-border align-top last:border-b-0">
                        <th scope="row" className="px-3 py-2 text-left font-medium [overflow-wrap:anywhere]">
                          {resource.name}
                        </th>
                        {range.days.map((day) => (
                          <td key={day} className={`border-l border-border/60 p-1.5 ${day === today ? "bg-accent-soft/30" : ""}`}>
                            <div className="grid gap-1.5">
                              {jobsOn(jobsOf(resource), day).map((job) => (
                                <Link
                                  key={job.id}
                                  href={`/app/jobs/${job.id}`}
                                  aria-label={jobLabel(job)}
                                  title={jobLabel(job)}
                                  className={`flex min-h-11 items-start gap-1.5 rounded-md border px-1.5 py-1 hover:shadow-md ${barTone[job.status]} ${focusRing}`}
                                >
                                  <StatusIcon status={job.status} className="mt-0.5 size-4" />
                                  <span className="grid min-w-0 leading-tight">
                                    <span className="font-semibold tabular-nums">{time(job.starts_at)}</span>
                                    <span className="truncate">{job.customers?.name}</span>
                                    {job.status !== "planned" && <span className="truncate text-xs">{status(job)}</span>}
                                  </span>
                                </Link>
                              ))}
                              <Link
                                href={newJob(day, resource, 7)}
                                aria-label={t("newJobOn", { name: resource.name, day: dayName(day, "long") })}
                                className={`flex min-h-11 items-center justify-center rounded-md text-muted opacity-60 hover:bg-accent-soft hover:text-accent hover:opacity-100 focus-visible:opacity-100 ${focusRing}`}
                              >
                                <PlusIcon className="size-4" />
                              </Link>
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
