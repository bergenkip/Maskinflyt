import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRightIcon, CalendarIcon, CheckCircleIcon, TruckIcon } from "@/components/icons";
import { BusyMeter, busyPercent, hoursNumber } from "@/components/workload-facts";
import { addDays, addMonths, weekNumber, weekStart } from "@/lib/calendar";
import { fromLocalParts } from "@/lib/jobs";
import { createClient } from "@/lib/supabase/server";
import { daysBetween, minutesOn, workload, type Load, type LoadJob } from "@/lib/workload";
import { loadWorkingTime } from "@/lib/workload-data";

type Period = "today" | "week" | "month";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// Owners and admins: how much work today, this week and this month holds, what is done
// and what was invoiced, and the month's hours day by day (Li, 2026-11-25).
// Everything is counted from the jobs and invoices already there; RLS keeps them to the company.
export async function WorkloadOverview(props: {
  organizationId: string;
  timeZone: string;
  currency: string;
  today: string;
  activeMachines: number;
}) {
  const { organizationId, timeZone, today } = props;
  const monthFirst = `${today.slice(0, 7)}-01`;
  const monthLast = addDays(addMonths(monthFirst, 1), -1);
  const weekFirst = weekStart(today);
  const weekLast = addDays(weekFirst, 6);
  const first = weekFirst < monthFirst ? weekFirst : monthFirst;
  const last = weekLast > monthLast ? weekLast : monthLast;
  const midnight = (day: string) => fromLocalParts(day, "00:00", timeZone) ?? fromLocalParts(day, "01:00", timeZone)!;

  const supabase = await createClient();
  const [t, format, jobsResult, invoicesResult, working] = await Promise.all([
    getTranslations("Workload"),
    getFormatter(),
    supabase
      .from("jobs")
      .select("starts_at, ends_at, status, vehicle_id")
      .eq("organization_id", organizationId)
      .neq("status", "cancelled")
      .lt("starts_at", midnight(addDays(last, 1)).toISOString())
      .gt("ends_at", midnight(first).toISOString())
      .limit(5000),
    // Invoices and credit notes (negative) by issue date: what was invoiced, without VAT.
    supabase
      .from("invoices")
      .select("net, issue_date")
      .eq("organization_id", organizationId)
      .gte("issue_date", first)
      .lte("issue_date", last)
      .limit(5000),
    loadWorkingTime(supabase, organizationId, first, last),
  ]);
  if (jobsResult.error) return <p className="text-danger">{t("failed")}</p>;

  const jobs = (jobsResult.data ?? []) as LoadJob[];
  const invoices = (invoicesResult.data ?? []) as { net: number; issue_date: string }[];
  const options = {
    timeZone,
    activeMachines: props.activeMachines,
    // Without the working hours, how busy is left out rather than guessed.
    week: working.failed ? [] : working.week,
    daysOff: working.daysOff,
  };
  const noon = (day: string) => new Date(`${day}T12:00:00Z`);

  const periods: { key: Period; days: string[]; title: string; when: string; href: string }[] = [
    {
      key: "today",
      days: [today],
      title: t("today"),
      when: format.dateTime(noon(today), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
      href: `/app/jobs/calendar?date=${today}&view=day`,
    },
    {
      key: "week",
      days: daysBetween(weekFirst, weekLast),
      title: t("week"),
      when: t("weekNumber", { week: weekNumber(today) }),
      href: `/app/jobs/calendar?date=${today}&view=week`,
    },
    {
      key: "month",
      days: daysBetween(monthFirst, monthLast),
      title: t("month"),
      when: format.dateTime(noon(today), { month: "long", year: "numeric", timeZone: "UTC" }),
      href: `/app/jobs/calendar?date=${today}&view=month`,
    },
  ];
  // Øre, added as whole numbers; shown in the company's currency.
  const invoiced = (days: string[]) =>
    invoices.filter((row) => row.issue_date >= days[0] && row.issue_date <= days[days.length - 1]).reduce((sum, row) => sum + row.net, 0);
  const money = (ore: number) =>
    format.number(ore / 100, { style: "currency", currency: props.currency, maximumFractionDigits: 0 });

  const monthDays = daysBetween(monthFirst, monthLast);
  const perDay = monthDays.map((day) => ({
    day,
    minutes: jobs.reduce((sum, job) => sum + minutesOn(job, day, timeZone), 0),
  }));
  const busiest = Math.max(0, ...perDay.map((d) => d.minutes));
  // The scale: the busiest day, but at least an hour so a quiet month has no giant bars.
  const most = Math.max(60, busiest);
  const dayLabel = (day: string) => format.dateTime(noon(day), { weekday: "short", day: "numeric", timeZone: "UTC" });

  return (
    <section aria-labelledby="work-title" className="grid gap-3">
      <h2 id="work-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <ul className="grid gap-3 md:grid-cols-3">
        {periods.map((period) => (
          <li key={period.key}>
            <PeriodCard
              title={period.title}
              when={period.when}
              href={period.href}
              load={workload(jobs, period.days, options)}
              invoiced={invoicesResult.error ? null : money(invoiced(period.days))}
            />
          </li>
        ))}
      </ul>

      {/* The month day by day: one bar per day, height = hours of work. */}
      <figure className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <figcaption className="grid gap-0.5">
          <span className="font-semibold">{t("chartTitle", { month: periods[2].when })}</span>
          <span className="text-sm text-muted">{t("chartLead", { hours: hoursNumber(format, busiest) })}</span>
        </figcaption>
        <div aria-hidden="true" className="grid gap-1">
          <div className="flex h-28 items-end gap-0.5 border-b border-border sm:h-32">
            {perDay.map(({ day, minutes }) => (
              <span
                key={day}
                title={`${dayLabel(day)}: ${t("hours", { hours: hoursNumber(format, minutes) })}`}
                className="group relative flex h-full min-w-0 flex-1 items-end"
              >
                <span
                  className={`w-full rounded-t ${day === today ? "bg-accent" : day < today ? "bg-accent/45" : "bg-accent/25"} ${minutes > 0 ? "min-h-1" : ""}`}
                  style={{ height: `${(minutes / most) * 100}%` }}
                />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium whitespace-nowrap shadow-md group-hover:block">
                  {dayLabel(day)}: {t("hours", { hours: hoursNumber(format, minutes) })}
                </span>
              </span>
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted tabular-nums">
            <span>{Number(monthFirst.slice(8))}.</span>
            <span>{Number(monthLast.slice(8)) >= 15 ? "15." : ""}</span>
            <span>{Number(monthLast.slice(8))}.</span>
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-accent" aria-hidden="true" />
            {t("chartToday")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-accent/45" aria-hidden="true" />
            {t("chartPast")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-accent/25" aria-hidden="true" />
            {t("chartAhead")}
          </span>
        </p>
        {/* The same numbers as a table, for screen readers. */}
        <table className="sr-only">
          <caption>{t("chartTitle", { month: periods[2].when })}</caption>
          <thead>
            <tr>
              <th scope="col">{t("chartDay")}</th>
              <th scope="col">{t("chartHours")}</th>
            </tr>
          </thead>
          <tbody>
            {perDay.map(({ day, minutes }) => (
              <tr key={day}>
                <th scope="row">{dayLabel(day)}</th>
                <td>{t("hours", { hours: hoursNumber(format, minutes) })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </section>
  );
}

async function PeriodCard(props: { title: string; when: string; href: string; load: Load; invoiced: string | null }) {
  const [t, format] = await Promise.all([getTranslations("Workload"), getFormatter()]);
  const { load } = props;
  return (
    <Link
      href={props.href}
      className={`group flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-accent/60 hover:shadow-md ${focusRing}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="grid min-w-0">
          <span className="font-semibold">{props.title}</span>
          <span className="text-sm text-muted first-letter:uppercase">{props.when}</span>
        </span>
        <ArrowRightIcon className="mt-0.5 size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-link" />
      </span>
      <span className="grid gap-0.5">
        <span className="text-3xl leading-tight font-semibold tracking-tight tabular-nums">
          {t("hours", { hours: hoursNumber(format, load.minutes) })}
        </span>
        <span className="text-sm text-muted">{t("hoursLabel")}</span>
      </span>
      <span className="grid gap-1.5 text-sm">
        <span className="flex items-center gap-2">
          <CalendarIcon className="size-4 shrink-0 text-muted" />
          {t("jobs", { count: load.jobs })}
        </span>
        <span className="flex items-center gap-2">
          <CheckCircleIcon className="size-4 shrink-0 text-success" />
          {t("done", { done: load.done, count: load.jobs })}
        </span>
        <span className="flex items-center gap-2">
          <TruckIcon className="size-4 shrink-0 text-muted" />
          {t("machines", { count: load.machines })}
        </span>
        {load.busy !== null && (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <BusyMeter busy={load.busy} className="w-16" />
            {t("busy", { percent: busyPercent(format, load.busy) })}
          </span>
        )}
      </span>
      {props.invoiced !== null && (
        <span className="mt-auto flex flex-wrap items-baseline justify-between gap-x-2 border-t border-border pt-3 text-sm">
          <span className="text-muted">{t("invoiced")}</span>
          <span className="font-semibold tabular-nums">{props.invoiced}</span>
        </span>
      )}
    </Link>
  );
}
