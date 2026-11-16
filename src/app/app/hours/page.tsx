import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRightIcon, CheckCircleIcon, ClockIcon, SettingsIcon } from "@/components/icons";
import { defaultHourRules, decimalHours, type HourRules } from "@/lib/hours";
import { sheetColumns, type SheetRow } from "@/lib/hours-server";
import { monthPeriod } from "@/lib/invoice-export";
import { canEditInvoiceSettings } from "@/lib/invoice-settings";
import { getCurrentMembership } from "@/lib/membership";
import { createClient, getUserId } from "@/lib/supabase/server";
import { NewSheetForm } from "./hours-forms";
import { rulesText } from "./rules";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Hours");
  return { title: `${t("title")} · MaskinGo` };
}

const sectionClass = "grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6";

// Stage 13a: the employee's own hours sheets for the pay. Everyone keeps their own.
export default async function HoursPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  const { organization } = membership;

  const supabase = await createClient();
  const userId = await getUserId();
  const [t, tSettings, format, { data: sheets }, { data: settings }] = await Promise.all([
    getTranslations("Hours"),
    getTranslations("HourSettings"),
    getFormatter(),
    supabase.from("hour_sheets").select(sheetColumns).eq("organization_id", organization.id).eq("user_id", userId).order("period_from", { ascending: false }),
    supabase.from("hour_settings").select("overtime_after, overtime_percent, overtime2_after, overtime2_percent").eq("organization_id", organization.id).maybeSingle(),
  ]);
  const rules = (settings as HourRules | null) ?? defaultHourRules;
  const own = (sheets ?? []) as SheetRow[];
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const number = (value: number) => format.number(value, { maximumFractionDigits: 2 });
  // A new sheet suggests this month, or the next free one after the newest sheet.
  const month = monthPeriod(organization.timeZone);
  const taken = own.some((sheet) => sheet.period_from <= month.to && sheet.period_to >= month.from);
  const suggested = taken ? monthPeriod(organization.timeZone, -1) : month;

  return (
    <div className="grid max-w-2xl gap-8">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>

      <div className="grid gap-2 rounded-xl border border-border bg-surface p-4">
        <p className="flex items-start gap-2 font-medium">
          <ClockIcon className="mt-0.5 size-5 text-muted" />
          {rulesText(t, rules, number)}
        </p>
        {canEditInvoiceSettings(membership.role) && (
          <Link
            href="/app/hours/settings"
            className={`-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-2 font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
          >
            <SettingsIcon className="size-5" />
            {tSettings("title")}
          </Link>
        )}
      </div>

      <section aria-labelledby="new-sheet-title" className={sectionClass}>
        <h2 id="new-sheet-title" className="text-lg font-semibold">
          {t("newTitle")}
        </h2>
        <NewSheetForm from={suggested.from} to={suggested.to} />
      </section>

      <section aria-labelledby="sheets-title" className="grid gap-3">
        <h2 id="sheets-title" className="text-lg font-semibold">
          {t("listTitle")}
        </h2>
        {own.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-muted">{t("empty")}</p>
        ) : (
          <ul className="grid gap-3">
            {own.map((sheet) => {
              const submitted = sheet.status === "submitted";
              const State = submitted ? CheckCircleIcon : ClockIcon;
              return (
                <li key={sheet.id}>
                  <Link
                    href={`/app/hours/${sheet.id}`}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-accent/60 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <span className="grid min-w-0 flex-1 gap-1">
                      <span className="font-semibold">{t("period", { from: day(sheet.period_from), to: day(sheet.period_to) })}</span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className={`flex items-center gap-1.5 font-medium ${submitted ? "text-success" : "text-warning"}`}>
                          <State className="size-4" />
                          {t(`status.${sheet.status}`)}
                        </span>
                        {submitted && sheet.worked_minutes !== null && (
                          <span className="text-muted tabular-nums">{t("hoursTotal", { hours: number(decimalHours(sheet.worked_minutes)) })}</span>
                        )}
                      </span>
                    </span>
                    <ArrowRightIcon className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
