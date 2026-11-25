import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { AlertIcon, ArrowRightIcon, CheckCircleIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, NoteIcon, TruckIcon } from "@/components/icons";
import { shiftMonth } from "@/lib/hour-jobs";
import { decimalHours } from "@/lib/hours";

export type SheetSummary = {
  id: string;
  name: string;
  periodFrom: string;
  periodTo: string;
  status: "draft" | "submitted";
  workedMinutes: number;
  // Null when the jobs could not be loaded.
  jobCount: number | null;
};

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const monthButton = `flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-background ${focusRing}`;

// The month's sheets, one card each (kept apart from the page so it can be shown without a database).
export async function AllSheetsView({ month, sheets, failed }: { month: string; sheets: SheetSummary[]; failed: boolean }) {
  const [t, tHours, format] = await Promise.all([getTranslations("HourSheetsAll"), getTranslations("Hours"), getFormatter()]);
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" });
  const monthName = (value: string) => format.dateTime(new Date(`${value}-15T12:00:00Z`), { month: "long", year: "numeric", timeZone: "UTC" });
  const hours = (minutes: number) => format.number(decimalHours(minutes), { maximumFractionDigits: 2 });

  return (
    <div className="grid max-w-2xl gap-8">
      <div className="grid gap-2">
        <Link
          href="/app/hours"
          className={`-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-full px-2 font-medium text-link hover:bg-accent-soft ${focusRing}`}
        >
          <ArrowRightIcon className="size-5 rotate-180" />
          {t("back")}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>

      <nav aria-label={monthName(month)} className="flex items-center justify-between gap-3">
        <Link href={`/app/hours/all?month=${shiftMonth(month, -1)}`} aria-label={t("prev")} className={monthButton}>
          <ChevronLeftIcon className="size-5" />
        </Link>
        <h2 className="text-center text-lg font-semibold first-letter:uppercase" aria-live="polite">
          {monthName(month)}
        </h2>
        <Link href={`/app/hours/all?month=${shiftMonth(month, 1)}`} aria-label={t("next")} className={monthButton}>
          <ChevronRightIcon className="size-5" />
        </Link>
      </nav>

      {failed ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-soft p-3 font-medium text-danger">
          <AlertIcon className="mt-0.5 size-5 shrink-0" />
          {tHours("submitErrors.unknown")}
        </p>
      ) : sheets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-muted">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3">
          {sheets.map((sheet) => {
            const submitted = sheet.status === "submitted";
            const State = submitted ? CheckCircleIcon : NoteIcon;
            return (
              <li key={sheet.id}>
                <Link
                  href={`/app/hours/${sheet.id}`}
                  className={`group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-accent/60 hover:shadow-md ${focusRing}`}
                >
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="font-semibold [overflow-wrap:anywhere]">{sheet.name}</span>
                    <span className="text-sm text-muted">{tHours("period", { from: day(sheet.periodFrom), to: day(sheet.periodTo) })}</span>
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className={`flex items-center gap-1.5 font-medium ${submitted ? "text-success" : "text-warning"}`}>
                        <State className="size-4" />
                        {tHours(`status.${sheet.status}`)}
                      </span>
                      <span className="flex items-center gap-1.5 text-muted tabular-nums">
                        <ClockIcon className="size-4" />
                        {tHours("hoursTotal", { hours: hours(sheet.workedMinutes) })}
                      </span>
                      {sheet.jobCount !== null && (
                        <span className="flex items-center gap-1.5 text-muted tabular-nums">
                          <TruckIcon className="size-4" />
                          {t("jobs", { count: sheet.jobCount })}
                        </span>
                      )}
                    </span>
                  </span>
                  <ArrowRightIcon className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-link" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
