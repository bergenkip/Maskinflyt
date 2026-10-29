import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlusIcon } from "@/components/icons";
import {
  addDays,
  addMonths,
  calendarRange,
  calendarViews,
  minutesOnDay,
  parseDate,
  visibleHours,
  weekNumber,
  type CalendarView,
} from "@/lib/calendar";
import { toLocalParts, type JobStatus } from "@/lib/jobs";
import { getCurrentMembership } from "@/lib/membership";
import { canSeeJobs } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { StatusIcon } from "../status-badge";
import { JobsViewNav, segmentClass } from "../view-nav";
import { DayTimeline, type TimelineJob, type TimelineRow } from "./day-timeline";

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

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const itemTone: Record<JobStatus, string> = {
  new: "border-warning/60 bg-warning-soft",
  planned: "border-accent/50 bg-accent-soft",
  done: "border-success/50 bg-success-soft",
  cancelled: "border-border bg-surface",
};
// How many jobs a day of the month shows by name on a computer; the rest are counted.
const MONTH_CHIPS = 3;

export default async function CalendarPage({ searchParams }: PageProps<"/app/jobs/calendar">) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeJobs(membership.role)) redirect("/app");

  const { organization } = membership;
  const { timeZone } = organization;
  const params = await searchParams;
  const today = toLocalParts(new Date(), timeZone).date;
  const date = parseDate(params.date, today);
  const view: CalendarView = calendarViews.find((v) => v === params.view) ?? "month";
  const range = calendarRange(date, view, timeZone);

  const supabase = await createClient();
  const [t, tJobs, format, jobsResult, vehiclesResult, membersResult, mainResult] = await Promise.all([
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
      .limit(1000),
    supabase.from("vehicles").select("id, name, active").eq("organization_id", organization.id).order("name"),
    supabase.rpc("list_members", { org: organization.id }),
    supabase.from("memberships").select("user_id, main_vehicle_id").eq("organization_id", organization.id),
  ]);
  const failed = jobsResult.error ?? vehiclesResult.error ?? membersResult.error;
  const jobs = (jobsResult.data ?? []) as unknown as Row[];
  const people = new Map(((membersResult.data ?? []) as MemberRow[]).map((m) => [m.user_id, m.full_name ?? m.email]));
  const vehicles = (vehiclesResult.data ?? []) as Named[];
  const vehicleName = new Map(vehicles.map((v) => [v.id, v.name]));
  const driverOf = (job: Row) => (job.driver_id ? (people.get(job.driver_id) ?? null) : null);

  // Jobs that share some time with that day (a job ending at midnight is not on the next day).
  const jobsOn = (list: Row[], day: string) =>
    list.filter(
      (job) =>
        toLocalParts(new Date(job.starts_at), timeZone).date <= day &&
        toLocalParts(new Date(Date.parse(job.ends_at) - 1), timeZone).date >= day,
    );

  const here = (change: { date?: string; view?: CalendarView }) =>
    `/app/jobs/calendar?${new URLSearchParams({ date: change.date ?? date, view: change.view ?? view })}`;
  const newJob = (day: string, vehicleId?: string) =>
    `/app/jobs/new?${new URLSearchParams({ date: day, start: "07:00", ...(vehicleId ? { vehicle: vehicleId } : {}) })}`;

  const time = (iso: string) => format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone });
  const span = (job: Row) => tJobs("timeSpan", { start: time(job.starts_at), end: time(job.ends_at) });
  const status = (job: Row) => tJobs(`statuses.${job.status}`);
  // Customer names are data and are shown exactly as entered.
  const customer = (job: Row) => job.customers?.name ?? "";
  const noon = (day: string) => new Date(`${day}T12:00:00Z`);
  const dayName = (day: string) =>
    format.dateTime(noon(day), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  const step = (direction: 1 | -1) =>
    view === "month" ? addMonths(date, direction) : addDays(date, direction * (view === "week" ? 7 : 1));
  const stepLabels = {
    month: ["previousMonth", "nextMonth"],
    week: ["previousWeek", "nextWeek"],
    day: ["previousDay", "nextDay"],
  } as const;
  const heading =
    view === "month"
      ? format.dateTime(noon(date), { month: "long", year: "numeric", timeZone: "UTC" })
      : view === "week"
        ? t("weekHeading", {
            week: weekNumber(date),
            range: format.dateTimeRange(noon(range.days[0]), noon(range.days[6]), {
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            }),
          })
        : dayName(date);
  const shownToday = range.days.includes(today);

  // A job on a list (week view, phones): opens the job, which is also where it is edited.
  const jobItem = (job: Row, showMachine: boolean) => (
    <li key={job.id}>
      <Link
        href={`/app/jobs/${job.id}`}
        aria-label={t("editJob", { number: job.number, customer: customer(job), time: span(job), status: status(job) })}
        className={`flex min-h-11 items-start gap-2 rounded-lg border-l-4 px-2.5 py-2 ${itemTone[job.status]} ${focusRing}`}
      >
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex flex-wrap items-center gap-x-1.5 text-sm font-semibold tabular-nums">
            <StatusIcon status={job.status} />
            {span(job)}
          </span>
          {job.status !== "planned" && <span className="text-xs font-medium">{status(job)}</span>}
          <span title={customer(job)} className="line-clamp-2 text-sm font-medium break-words">
            {customer(job)}
          </span>
          {showMachine && (
            <span className="flex flex-wrap items-center gap-x-1 text-xs text-muted break-words">
              {job.vehicle_id ? (
                vehicleName.get(job.vehicle_id)
              ) : (
                <>
                  <AlertIcon className="size-4 text-warning" />
                  {tJobs("noVehicle")}
                </>
              )}
              {driverOf(job) && <span>· {driverOf(job)}</span>}
            </span>
          )}
        </span>
        <PencilIcon className="mt-0.5 size-4 text-muted" />
      </Link>
    </li>
  );

  // The day: a row per machine in use (switched-off ones only while they still have jobs),
  // with the people who drive it, and a last row for jobs still without a machine.
  const dayJobs = view === "day" ? jobsOn(jobs, date) : [];
  const unassigned = dayJobs.filter((job) => !job.vehicle_id);
  const busy = new Set(dayJobs.map((job) => job.vehicle_id));
  const mains = (mainResult.data ?? []) as { user_id: string; main_vehicle_id: string | null }[];
  const named = (names: (string | null | undefined)[]) => names.filter((name): name is string => !!name);
  const toTimeline = (job: Row): TimelineJob => ({
    id: job.id,
    number: job.number,
    starts_at: job.starts_at,
    ends_at: job.ends_at,
    status: job.status,
    customer: customer(job),
    driver: driverOf(job),
  });
  const timelineRows: TimelineRow[] = vehicles
    .filter((v) => v.active || busy.has(v.id))
    .map((v) => {
      const own = dayJobs.filter((job) => job.vehicle_id === v.id);
      const drivers = new Set([
        ...named(own.map(driverOf)),
        ...named(mains.filter((m) => m.main_vehicle_id === v.id).map((m) => people.get(m.user_id))),
      ]);
      return { id: v.id, name: v.name, drivers: [...drivers], jobs: own.map(toTimeline) };
    });
  if (unassigned.length > 0) {
    timelineRows.push({ id: "", name: tJobs("noVehicle"), drivers: [], jobs: unassigned.map(toTimeline) });
  }
  const hours = visibleHours(dayJobs.map((job) => minutesOnDay(job, date, timeZone)));

  return (
    // Wider than other pages on big screens, so a week and a day have room (centred, never past the screen).
    <div className="grid gap-6 xl:mx-[calc((100%_-_min(88rem,_100vw_-_3rem))_/_2)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid min-w-0 gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted">{t(view === "day" ? "leadDay" : "lead")}</p>
        </div>
        <Link
          href={newJob(view !== "day" && shownToday ? today : date)}
          className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 font-semibold text-on-accent hover:bg-accent/90 sm:w-auto ${focusRing}`}
        >
          <PlusIcon className="size-5" />
          {tJobs("addTitle")}
        </Link>
      </div>
      <JobsViewNav current="calendar" />

      {/* Which days, and how many at once. */}
      <div className="grid gap-3 md:flex md:flex-wrap md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Link
            href={here({ date: step(-1) })}
            aria-label={t(stepLabels[view][0])}
            className={`flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface hover:bg-accent-soft ${focusRing}`}
          >
            <ChevronLeftIcon />
          </Link>
          <Link
            href={here({ date: today })}
            aria-current={shownToday ? "date" : undefined}
            className={`flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 font-medium hover:bg-accent-soft ${focusRing}`}
          >
            {t("today")}
          </Link>
          <Link
            href={here({ date: step(1) })}
            aria-label={t(stepLabels[view][1])}
            className={`flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface hover:bg-accent-soft ${focusRing}`}
          >
            <ChevronRightIcon />
          </Link>
          <h2 className="ml-1 min-w-0 text-lg font-semibold first-letter:uppercase [overflow-wrap:anywhere]" aria-live="polite">
            {heading}
          </h2>
        </div>
        <nav aria-label={t("viewLabel")} className="flex rounded-xl bg-accent-soft/60 p-1">
          {calendarViews.map((value) => (
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
      </div>

      {failed ? (
        <p className="text-danger">{tJobs("errors.unknown")}</p>
      ) : view === "month" ? (
        <section aria-label={heading} className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="grid grid-cols-7 border-b border-border" aria-hidden="true">
            {range.days.slice(0, 7).map((day) => (
              <span
                key={day}
                className="px-1 py-2 text-center text-xs font-medium text-muted first-letter:uppercase md:px-2 md:text-left md:text-sm"
              >
                {format.dateTime(noon(day), { weekday: "short", timeZone: "UTC" })}
              </span>
            ))}
          </div>
          <ol className="grid grid-cols-7">
            {range.days.map((day) => {
              const own = jobsOn(jobs, day);
              const inMonth = day.slice(0, 7) === date.slice(0, 7);
              const waiting = own.some((job) => !job.vehicle_id || !job.driver_id);
              return (
                <li key={day} className="min-w-0 border-r border-b border-border/70 nth-[7n]:border-r-0">
                  <Link
                    href={here({ date: day, view: "day" })}
                    aria-label={t("dayJobs", { day: dayName(day), count: own.length })}
                    aria-current={day === today ? "date" : undefined}
                    className={`flex h-full min-h-16 flex-col gap-1 p-1 hover:bg-accent-soft/50 md:min-h-28 md:p-1.5 ${inMonth ? "" : "bg-background/60 text-muted"} ${focusRing}`}
                  >
                    <span
                      className={`flex size-7 items-center justify-center self-center rounded-full text-sm tabular-nums md:self-start ${day === today ? "bg-accent font-semibold text-on-accent" : "font-medium"}`}
                    >
                      {Number(day.slice(8))}
                    </span>
                    {own.length > 0 && (
                      <>
                        {/* Phones: a mark and how many (a warning sign while some job lacks a machine or driver). */}
                        <span className="flex items-center justify-center gap-1 text-xs font-semibold md:hidden">
                          {waiting ? (
                            <AlertIcon className="size-3.5 text-warning" />
                          ) : (
                            <span className="size-2 rounded-full bg-accent" />
                          )}
                          {own.length}
                        </span>
                        {/* Computers: the first jobs by time and customer. */}
                        <span className="hidden gap-1 md:grid">
                          {own.slice(0, MONTH_CHIPS).map((job) => (
                            <span
                              key={job.id}
                              className={`flex min-w-0 items-center gap-1 rounded border px-1 py-0.5 text-xs text-foreground ${itemTone[job.status]}`}
                            >
                              {job.vehicle_id ? (
                                <StatusIcon status={job.status} className="size-3.5" />
                              ) : (
                                <AlertIcon className="size-3.5 text-warning" />
                              )}
                              <span className="truncate">
                                <span className="font-semibold tabular-nums">{time(job.starts_at)}</span> {customer(job)}
                              </span>
                            </span>
                          ))}
                          {own.length > MONTH_CHIPS && (
                            <span className="px-1 text-xs font-medium text-muted">
                              {t("more", { count: own.length - MONTH_CHIPS })}
                            </span>
                          )}
                        </span>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ) : view === "week" ? (
        <ol aria-label={heading} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {range.days.map((day) => {
            const own = jobsOn(jobs, day);
            return (
              <li
                key={day}
                className={`flex min-w-0 flex-col gap-2 rounded-xl border bg-surface p-3 ${day === today ? "border-accent" : "border-border"}`}
              >
                <Link
                  href={here({ date: day, view: "day" })}
                  aria-label={t("openDay", { day: dayName(day) })}
                  className={`flex min-h-11 flex-wrap items-center justify-between gap-x-2 rounded-lg font-semibold hover:text-accent ${focusRing}`}
                >
                  <span className="first-letter:uppercase">
                    {format.dateTime(noon(day), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
                  </span>
                  {day === today && <span className="text-sm font-medium text-accent">{t("today")}</span>}
                </Link>
                {own.length === 0 ? (
                  <p className="text-sm text-muted">{t("noJobsDay")}</p>
                ) : (
                  <ul className="grid gap-2">{own.map((job) => jobItem(job, true))}</ul>
                )}
                <Link
                  href={newJob(day)}
                  aria-label={t("newJobOn", { day: dayName(day) })}
                  className={`mt-auto flex min-h-11 items-center justify-center rounded-lg border border-dashed border-border text-muted hover:border-accent hover:text-accent ${focusRing}`}
                >
                  <PlusIcon className="size-5" />
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <>
          {unassigned.length > 0 && (
            <section
              aria-labelledby="unassigned-title"
              className="grid max-w-3xl gap-3 rounded-xl border border-warning/50 bg-warning-soft p-4"
            >
              <h2 id="unassigned-title" className="flex items-center gap-2 font-semibold">
                <AlertIcon className="size-5 text-warning" />
                {t("withoutVehicle", { count: unassigned.length })}
              </h2>
              <ul className="grid gap-2">{unassigned.map((job) => jobItem(job, false))}</ul>
            </section>
          )}

          {timelineRows.length === 0 ? (
            <p className="max-w-3xl rounded-xl border border-dashed border-border p-4 text-muted">{t("noVehicles")}</p>
          ) : (
            <>
              {/* Phones: a card per machine, with that day's jobs in order. */}
              <ul className="grid gap-3 md:hidden">
                {timelineRows
                  .filter((row) => row.id)
                  .map((row) => {
                    const own = dayJobs.filter((job) => job.vehicle_id === row.id);
                    return (
                      <li key={row.id} className="grid gap-2 rounded-xl border border-border bg-surface p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="grid min-w-0">
                            <h3 className="font-semibold [overflow-wrap:anywhere]">{row.name}</h3>
                            {row.drivers.length > 0 && (
                              <p className="text-sm text-muted [overflow-wrap:anywhere]">{row.drivers.join(", ")}</p>
                            )}
                          </div>
                          <Link
                            href={newJob(date, row.id)}
                            aria-label={t("newJobFor", { name: row.name })}
                            className={`flex size-11 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-accent-soft ${focusRing}`}
                          >
                            <PlusIcon className="size-5" />
                          </Link>
                        </div>
                        {own.length === 0 ? (
                          <p className="text-sm text-muted">{t("free")}</p>
                        ) : (
                          <ul className="grid gap-2">{own.map((job) => jobItem(job, false))}</ul>
                        )}
                      </li>
                    );
                  })}
              </ul>

              {/* Tablets and computers: the timeline, where open jobs can be dragged. */}
              <div className="hidden md:block">
                <DayTimeline date={date} timeZone={timeZone} hours={hours} rows={timelineRows} label={heading} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
