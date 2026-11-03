import { getFormatter, getTranslations } from "next-intl/server";
import { CheckCircleIcon, ClockIcon, PencilIcon } from "@/components/icons";
import { getMemberNames } from "@/lib/added-by";
import { splitMinutes, toTimeFormValues, type TimeFormValues } from "@/lib/job-time";
import type { JobStatus } from "@/lib/jobs";
import { createClient } from "@/lib/supabase/server";
import { ApproveTimeForm, CorrectTimeForm } from "./time-forms";

const sectionClass = "grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6";
const summaryClass =
  "flex min-h-11 cursor-pointer items-center gap-2 px-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// A working time with its price, as the database counted it.
export type Sheet = {
  started_at: string;
  ended_at: string;
  break_minutes: number;
  worked_minutes: number;
  evening_minutes: number;
  minimum_minutes: number;
  billed_minutes: number;
  hourly_rate: number | null;
  evening_rate: number | null;
  amount: number | null;
};
export type Approved = Sheet & { id: string; corrected: boolean; reason: string | null; approved_by: string | null; created_at: string };

type Props = {
  job: { id: string; status: JobStatus; starts_at: string; ends_at: string };
  organization: { id: string; timeZone: string; currency: string };
};

// The job's working time: what the driver's presses give, its approval by the
// office (or a correction with a reason), and the price, only to look at.
export async function JobTimeSection({ job, organization }: Props) {
  const supabase = await createClient();
  const [names, approvedResult, draftResult] = await Promise.all([
    getMemberNames(organization.id),
    supabase
      .from("job_times")
      .select(
        "id, started_at, ended_at, break_minutes, worked_minutes, evening_minutes, minimum_minutes, billed_minutes, hourly_rate, evening_rate, amount, corrected, reason, approved_by, created_at",
      )
      .eq("job_id", job.id)
      .order("created_at", { ascending: false }),
    job.status === "done" ? supabase.rpc("job_time_draft", { job: job.id }) : Promise.resolve({ data: [], error: null }),
  ]);
  return (
    <JobTimeView
      job={job}
      organization={organization}
      names={names}
      versions={(approvedResult.data ?? []) as Approved[]}
      draft={((draftResult.data ?? []) as Sheet[])[0]}
      failed={Boolean(approvedResult.error || draftResult.error)}
    />
  );
}

// The section itself, from the loaded data: approvals newest first.
export async function JobTimeView({
  job,
  organization,
  names,
  versions,
  draft,
  failed,
}: Props & { names: Map<string, string>; versions: Approved[]; draft?: Sheet; failed: boolean }) {
  const { timeZone, currency } = organization;
  const done = job.status === "done";
  const [t, format] = await Promise.all([getTranslations("JobTime"), getFormatter()]);
  const approved = versions[0];

  const money = (ore: number) => format.number(ore / 100, { style: "currency", currency });
  const duration = (total: number) => {
    const { hours, minutes } = splitMinutes(total);
    return hours === 0 ? t("minutes", { minutes }) : minutes === 0 ? t("hours", { hours }) : t("hoursMinutes", { hours, minutes });
  };
  const time = (iso: string) => format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone });
  const day = (iso: string) => format.dateTime(new Date(iso), { weekday: "short", day: "numeric", month: "long", timeZone });
  // A long month name: a short one is "05-06" in Lithuanian.
  const when = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone });
  const who = (id: string | null) => (id ? (names.get(id) ?? t("formerMember")) : t("formerMember"));
  // Without presses, the form starts from the planned time.
  const planned: TimeFormValues = toTimeFormValues({ started_at: job.starts_at, ended_at: job.ends_at, break_minutes: 0 }, timeZone);
  const current = approved ?? draft;

  const sheet = (s: Sheet) => {
    const rows: [string, string][] = [
      [t("time"), t("span", { day: day(s.started_at), start: time(s.started_at), end: time(s.ended_at) })],
      [t("breaks"), s.break_minutes === 0 ? t("noBreaks") : duration(s.break_minutes)],
      [t("worked"), duration(s.worked_minutes)],
    ];
    if (s.evening_minutes > 0) rows.push([t("evening"), duration(s.evening_minutes)]);
    rows.push([
      t("billed"),
      s.billed_minutes > s.worked_minutes ? t("billedMinimum", { time: duration(s.billed_minutes) }) : duration(s.billed_minutes),
    ]);
    if (s.hourly_rate !== null) rows.push([t("rate"), t("perHour", { amount: money(s.hourly_rate) })]);
    if (s.evening_minutes > 0 && s.evening_rate !== null) rows.push([t("eveningRate"), t("perHour", { amount: money(s.evening_rate) })]);
    return (
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-0.5 sm:contents">
            <dt className="text-sm text-muted sm:text-base">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
        <div className="grid gap-y-0.5 border-t border-border pt-2 sm:col-span-2 sm:grid-cols-subgrid">
          <dt className="font-semibold">{t("amount")}</dt>
          <dd className="text-lg font-semibold tabular-nums">{s.amount === null ? t("noPrice") : money(s.amount)}</dd>
        </div>
      </dl>
    );
  };

  return (
    <section aria-labelledby="time-title" className={sectionClass}>
      <div className="grid gap-1">
        <h2 id="time-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
        {/* The state is shown with an icon and with words, never by colour alone. */}
        {approved ? (
          <p className="flex items-start gap-1.5 font-medium text-success">
            <CheckCircleIcon className="mt-0.5 size-5 shrink-0" />
            {/* Person names are data and are shown exactly as entered. */}
            <span className="[overflow-wrap:anywhere]">
              {t(approved.corrected ? "correctedBy" : "approvedBy", { name: who(approved.approved_by), when: when(approved.created_at) })}
            </span>
          </p>
        ) : draft ? (
          <p className="flex items-start gap-1.5 font-medium text-warning">
            <ClockIcon className="mt-0.5 size-5 shrink-0" />
            {t("waiting")}
          </p>
        ) : (
          <p className="text-muted">{done ? t("noPresses") : t("notDone")}</p>
        )}
        {/* Reasons are data and are shown exactly as written. */}
        {approved?.reason && <p className="text-sm [overflow-wrap:anywhere]">{t("reasonShown", { reason: approved.reason })}</p>}
      </div>

      {failed && <p className="text-danger">{t("errors.unknown")}</p>}
      {current && sheet(current)}
      {current && <p className="text-sm text-muted">{t("lead")}</p>}

      {done && !approved && draft && <ApproveTimeForm job={job.id} values={toTimeFormValues(draft, timeZone)} />}
      {done && !approved && !draft && !failed && <CorrectTimeForm job={job.id} values={planned} submitLabel={t("approveEntered")} />}
      {done && current && (approved || draft) && (
        <details className="rounded-lg border border-border">
          <summary className={summaryClass}>
            <PencilIcon className="size-4" />
            {t("correct")}
          </summary>
          <div className="border-t border-border p-3">
            <CorrectTimeForm job={job.id} values={toTimeFormValues(current, timeZone)} submitLabel={t("saveCorrection")} />
          </div>
        </details>
      )}

      {versions.length > 1 && (
        <details className="rounded-lg border border-border">
          <summary className={summaryClass}>{t("history", { count: versions.length - 1 })}</summary>
          <ol className="grid gap-3 border-t border-border p-3">
            {versions.slice(1).map((v) => (
              <li key={v.id} className="grid gap-0.5 text-sm">
                <span className="font-medium [overflow-wrap:anywhere]">
                  {t(v.corrected ? "correctedBy" : "approvedBy", { name: who(v.approved_by), when: when(v.created_at) })}
                </span>
                <span className="tabular-nums">
                  {t("span", { day: day(v.started_at), start: time(v.started_at), end: time(v.ended_at) })} ·{" "}
                  {duration(v.billed_minutes)} · {v.amount === null ? t("noPrice") : money(v.amount)}
                </span>
                {v.reason && <span className="text-muted [overflow-wrap:anywhere]">{t("reasonShown", { reason: v.reason })}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
