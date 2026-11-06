import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRightIcon, CheckCircleIcon, ClockIcon, NoteIcon } from "@/components/icons";
import type { QueueRow, QueueState } from "@/lib/invoice";

// The sent list is the newest first; older ones stay on their jobs.
const SENT_SHOWN = 30;

const groups: { state: QueueState; icon: typeof ClockIcon; tone: string; anchor: string }[] = [
  { state: "time", icon: ClockIcon, tone: "text-warning", anchor: "time-title" },
  { state: "ready", icon: NoteIcon, tone: "text-accent", anchor: "invoice-title" },
  { state: "sent", icon: CheckCircleIcon, tone: "text-success", anchor: "invoice-title" },
];

// The invoicing list from the loaded rows, in three groups.
export async function InvoiceQueueView({
  rows,
  organization,
  failed,
}: {
  rows: QueueRow[];
  organization: { currency: string; timeZone: string };
  failed: boolean;
}) {
  const [t, tJobs, format] = await Promise.all([getTranslations("Invoices"), getTranslations("Jobs"), getFormatter()]);
  const money = (ore: number) => format.number(ore / 100, { style: "currency", currency: organization.currency });
  const day = (iso: string) =>
    format.dateTime(new Date(iso), { day: "numeric", month: "long", year: "numeric", timeZone: organization.timeZone });

  return (
    <div className="grid max-w-3xl gap-8">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      {failed && <p className="text-danger">{t("error")}</p>}

      {groups.map(({ state, icon: Icon, tone, anchor }) => {
        const all = rows.filter((row) => row.state === state);
        const shown = state === "sent" ? all.slice(0, SENT_SHOWN) : all;
        return (
          <section key={state} aria-labelledby={`invoices-${state}`} className="grid gap-3">
            <h2 id={`invoices-${state}`} className="flex items-center gap-2 text-lg font-semibold">
              <Icon className={`size-5 ${tone}`} />
              {t(`groups.${state}`, { count: all.length })}
            </h2>
            {shown.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-muted">{t(`empty.${state}`)}</p>
            ) : (
              <ul className="grid gap-3">
                {shown.map((row) => (
                  <li key={row.job_id}>
                    <Link
                      href={`/app/jobs/${row.job_id}#${anchor}`}
                      className="group flex items-start gap-3 rounded-xl border border-border bg-surface p-4 hover:border-accent/60 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          {/* Customer names are data and are shown exactly as entered. */}
                          <span className="font-semibold [overflow-wrap:anywhere]">{row.customer}</span>
                          {row.total !== null && <span className="font-semibold tabular-nums">{money(row.total)}</span>}
                        </span>
                        <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted tabular-nums">
                          <span>{tJobs("numberShort", { number: row.number })}</span>
                          <span>{t("finished", { day: day(row.ends_at) })}</span>
                          {/* Invoice numbers are data and are shown exactly as written. */}
                          {row.sent_at && (
                            <span className="[overflow-wrap:anywhere]">
                              {t(row.reference ? "sentNumber" : "sent", { day: day(row.sent_at), number: row.reference ?? "" })}
                            </span>
                          )}
                        </span>
                        <span className={`flex items-center gap-1.5 text-sm font-medium ${tone}`}>
                          <Icon className="size-4" />
                          {t(`action.${state}`)}
                        </span>
                      </span>
                      <ArrowRightIcon className="mt-1 size-5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {all.length > shown.length && <p className="text-sm text-muted">{t("moreSent", { count: all.length - shown.length })}</p>}
          </section>
        );
      })}

      {/* Integrations with other systems are made on request. */}
      <aside aria-labelledby="other-systems" className="grid gap-1 rounded-xl border border-border bg-accent-soft/50 p-4">
        <h2 id="other-systems" className="font-semibold">
          {t("otherSystemsTitle")}
        </h2>
        <p className="text-sm">{t("otherSystems")}</p>
      </aside>
    </div>
  );
}
