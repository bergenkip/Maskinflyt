import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { AlertIcon, ArrowRightIcon, CheckCircleIcon, NoteIcon } from "@/components/icons";
import { decimalHours, defaultHourRules, sheetTotals, splitDay, type HourRules, type SheetDay } from "@/lib/hours";
import { dayColumns, sheetColumns, type SheetRow } from "@/lib/hours-server";
import { getCurrentMembership } from "@/lib/membership";
import { createClient, getUserId } from "@/lib/supabase/server";
import { deleteSheet, removeDay } from "../actions";
import { DayForm, ResendSheetForm, SubmitSheetForm } from "../hours-forms";
import { rulesText } from "../rules";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Hours");
  return { title: `${t("title")} · MaskinGo` };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sectionClass = "grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6";
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// One hours sheet: filled in day by day, then confirmed and e-mailed.
export default async function HourSheetPage({ params }: PageProps<"/app/hours/[id]">) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  const { id } = await params;
  if (!uuid.test(id)) notFound();

  const supabase = await createClient();
  const [{ data }, { data: days }, { data: settings }, userId] = await Promise.all([
    supabase.from("hour_sheets").select(sheetColumns).eq("id", id).maybeSingle(),
    supabase.from("hour_sheet_days").select(dayColumns).eq("sheet_id", id).order("day"),
    supabase
      .from("hour_settings")
      .select("overtime_after, overtime_percent, overtime2_after, overtime2_percent, accountant_email")
      .eq("organization_id", membership.organization.id)
      .maybeSingle(),
    getUserId(),
  ]);
  const sheet = data as SheetRow | null;
  if (!sheet || sheet.organization_id !== membership.organization.id) notFound();
  const own = sheet.user_id === userId;
  const submitted = sheet.status === "submitted";
  const rows = (days ?? []) as SheetDay[];

  const [t, format] = await Promise.all([getTranslations("Hours"), getFormatter()]);
  // A confirmed sheet keeps the rules it was confirmed with.
  const rules: HourRules = submitted
    ? {
        overtime_after: sheet.overtime_after ?? 480,
        overtime_percent: sheet.overtime_percent ?? 50,
        overtime2_after: sheet.overtime2_after,
        overtime2_percent: sheet.overtime2_percent,
      }
    : ((settings as HourRules | null) ?? defaultHourRules);
  const accountantEmail = (settings as { accountant_email: string | null } | null)?.accountant_email ?? null;
  const number = (value: number) => format.number(value, { maximumFractionDigits: 2 });
  const hours = (minutes: number) => format.number(decimalHours(minutes), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = (iso: string, weekday = false) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), { weekday: weekday ? "short" : undefined, day: "numeric", month: "short", year: weekday ? undefined : "numeric", timeZone: "UTC" });
  const totals = sheetTotals(rows, rules);
  const levels = [
    { key: "normal" as const, label: t("normal") },
    { key: "overtime" as const, label: t("overtime", { percent: rules.overtime_percent }) },
    ...(rules.overtime2_after !== null && rules.overtime2_percent !== null
      ? [{ key: "overtime2" as const, label: t("overtime", { percent: rules.overtime2_percent }) }]
      : []),
  ];
  // The first day not yet written, for the form.
  const written = new Set(rows.map((row) => row.day));
  let firstDay = sheet.period_from;
  while (written.has(firstDay) && firstDay < sheet.period_to) {
    const next = new Date(`${firstDay}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    firstDay = next.toISOString().slice(0, 10);
  }
  const editable = own && !submitted;

  return (
    <div className="grid max-w-2xl gap-8">
      <div className="grid gap-2">
        <Link
          href="/app/hours"
          className={`-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-2 font-medium text-accent hover:bg-accent-soft ${focusRing}`}
        >
          <ArrowRightIcon className="size-5 rotate-180" />
          {t("back")}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{t("period", { from: day(sheet.period_from), to: day(sheet.period_to) })}</h1>
        {sheet.employee_name && !own && <p className="font-medium">{sheet.employee_name}</p>}
        <p className={`flex items-center gap-1.5 font-medium ${submitted ? "text-success" : "text-warning"}`}>
          {submitted ? <CheckCircleIcon className="size-5" /> : <NoteIcon className="size-5" />}
          {submitted && sheet.submitted_at
            ? t("confirmedAt", {
                time: format.dateTime(new Date(sheet.submitted_at), { dateStyle: "medium", timeStyle: "short", timeZone: membership.organization.timeZone }),
              })
            : t("status.draft")}
        </p>
        <p className="text-sm text-muted">{rulesText(t, rules, number)}</p>
      </div>

      {submitted && (
        <section aria-label={t("openPdf")} className={sectionClass}>
          <a
            href={`/app/hours/${sheet.id}/pdf`}
            target="_blank"
            rel="noopener"
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 font-semibold hover:bg-background sm:justify-self-start ${focusRing}`}
          >
            <NoteIcon className="size-5" />
            {t("openPdf")}
          </a>
          {sheet.email_status && (
            <p className={`flex items-start gap-2 font-medium ${sheet.email_status === "sent" ? "text-success" : "text-warning"}`}>
              {sheet.email_status === "sent" ? <CheckCircleIcon className="mt-0.5 size-5" /> : <AlertIcon className="mt-0.5 size-5" />}
              <span className="[overflow-wrap:anywhere]">{t(`email.${sheet.email_status}`, { email: sheet.email_to ?? "" })}</span>
            </p>
          )}
          {own && sheet.email_status !== "sent" && (sheet.email_status === "failed" || accountantEmail) && <ResendSheetForm sheet={sheet.id} />}
        </section>
      )}

      {editable && (
        <section aria-labelledby="day-title" className={sectionClass}>
          <h2 id="day-title" className="text-lg font-semibold">
            {t("dayTitle")}
          </h2>
          <DayForm sheet={sheet.id} from={sheet.period_from} to={sheet.period_to} firstDay={firstDay} />
        </section>
      )}

      <section aria-labelledby="days-title" className="grid gap-3">
        <h2 id="days-title" className="text-lg font-semibold">
          {t("daysTitle", { count: rows.length })}
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-muted">{t("noDays")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {rows.map((row) => {
              const split = splitDay(row.worked_minutes, rules);
              return (
                <li key={row.day} className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 p-4">
                  <span className="grid min-w-0 gap-0.5">
                    <span className="font-semibold capitalize">{day(row.day, true)}</span>
                    <span className="text-sm text-muted tabular-nums">
                      {row.starts.slice(0, 5)}–{row.ends.slice(0, 5)}
                      {row.break_minutes > 0 && ` · ${t("breakShort", { minutes: row.break_minutes })}`}
                    </span>
                    {split.overtime + split.overtime2 > 0 && (
                      <span className="text-sm text-muted tabular-nums">
                        {levels
                          .filter((level) => split[level.key] > 0)
                          .map((level) => `${level.label}: ${hours(split[level.key])}`)
                          .join(" · ")}
                      </span>
                    )}
                    {row.note && <span className="text-sm [overflow-wrap:anywhere]">{row.note}</span>}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="font-semibold tabular-nums">{t("hoursTotal", { hours: hours(row.worked_minutes) })}</span>
                    {editable && (
                      <form action={removeDay}>
                        <input type="hidden" name="sheet" value={sheet.id} />
                        <input type="hidden" name="day" value={row.day} />
                        <button
                          type="submit"
                          aria-label={t("remove", { day: day(row.day) })}
                          title={t("remove", { day: day(row.day) })}
                          className={`flex size-11 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger ${focusRing}`}
                        >
                          <span aria-hidden="true" className="text-xl leading-none">×</span>
                        </button>
                      </form>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {rows.length > 0 && (
          <dl className="grid gap-2 sm:grid-cols-2">
            {[{ key: "worked" as const, label: t("total") }, ...levels].map((level) => (
              <div key={level.key} className="flex items-baseline justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <dt className="text-sm text-muted">{level.label}</dt>
                <dd className="font-semibold tabular-nums">{t("hoursTotal", { hours: hours(totals[level.key]) })}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {editable && (
        <section aria-labelledby="confirm-title" className={sectionClass}>
          <div className="grid gap-1">
            <h2 id="confirm-title" className="text-lg font-semibold">
              {t("confirmTitle")}
            </h2>
            <p className="text-muted">{accountantEmail ? t("confirmLead") : t("confirmLeadNoEmail")}</p>
          </div>
          <SubmitSheetForm sheet={sheet.id} count={rows.length} hours={hours(totals.worked)} />
        </section>
      )}

      {editable && (
        <details className="group rounded-xl border border-border bg-surface">
          <summary className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-5 py-3 font-semibold ${focusRing}`}>
            {t("deleteTitle")}
            <ArrowRightIcon className="size-5 rotate-90 text-muted transition-transform group-open:-rotate-90" />
          </summary>
          <form action={deleteSheet} className="grid gap-3 px-5 pb-5">
            <input type="hidden" name="sheet" value={sheet.id} />
            <p className="text-sm text-muted">{t("deleteHint")}</p>
            <button
              type="submit"
              className={`flex min-h-11 items-center justify-center rounded-lg border border-danger/40 px-4 font-semibold text-danger hover:bg-danger-soft sm:justify-self-start ${focusRing}`}
            >
              {t("delete")}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
