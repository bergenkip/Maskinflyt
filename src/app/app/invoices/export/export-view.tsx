import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { FieldError } from "@/components/form";
import { ArrowRightIcon, DownloadIcon, NoteIcon } from "@/components/icons";
import {
  exportTotals,
  MAX_ZIP_DOCUMENTS,
  monthPeriod,
  type ExportDocument,
  type ExportRow,
  type Period,
  type PeriodError,
} from "@/lib/invoice-export";

// The documents listed on the page; the files hold them all.
const LISTED = 50;

const sectionClass = "grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6";
const buttonClass =
  "flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// The page from the loaded documents (kept apart so it can be shown without a database).
export async function InvoiceExportView({
  organization,
  shown,
  error,
  period,
  result,
}: {
  organization: { currency: string; timeZone: string };
  shown: Period;
  error: PeriodError | null;
  period: Period | null;
  result: { documents: ExportDocument[]; numbers: Map<string, number>; rows: ExportRow[] } | null;
}) {
  const [t, format] = await Promise.all([getTranslations("InvoiceExport"), getFormatter()]);
  const money = (ore: number) => format.number(ore / 100, { style: "currency", currency: organization.currency });
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const query = period ? `from=${period.from}&to=${period.to}` : "";
  const quick = [
    { label: t("thisMonth"), period: monthPeriod(organization.timeZone) },
    { label: t("lastMonth"), period: monthPeriod(organization.timeZone, 1) },
  ];

  const documents = result?.documents ?? [];
  const totals = exportTotals(result?.rows ?? []);
  const creditNotes = documents.filter((document) => document.kind === "credit_note").length;
  const numbers = result?.numbers ?? new Map<string, number>();

  return (
    <div className="grid max-w-2xl gap-8">
      <div className="grid gap-2">
        <Link
          href="/app/invoices"
          className="-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-full px-2 font-medium text-link hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowRightIcon className="size-5 rotate-180" />
          {t("back")}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>

      <section aria-labelledby="period-title" className={sectionClass}>
        <h2 id="period-title" className="text-lg font-semibold">
          {t("periodTitle")}
        </h2>
        <form method="get" className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["from", "to"] as const).map((name) => (
              <div key={name} className="grid content-start gap-1.5">
                <label htmlFor={`export-${name}`} className="font-medium">
                  {t(name)}
                </label>
                <input
                  id={`export-${name}`}
                  name={name}
                  type="date"
                  required
                  defaultValue={shown[name]}
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? "export-error" : undefined}
                  className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-danger"
                />
              </div>
            ))}
          </div>
          {error && <FieldError id="export-error">{t(`errors.${error}`)}</FieldError>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={`${buttonClass} w-full bg-accent text-on-accent hover:bg-accent/90 sm:w-auto`}>
              {t("show")}
            </button>
            {quick.map((option) => (
              <Link
                key={option.label}
                href={`/app/invoices/export?from=${option.period.from}&to=${option.period.to}`}
                className="flex min-h-11 items-center rounded-full px-3 font-medium text-link hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {option.label}
              </Link>
            ))}
          </div>
        </form>
      </section>

      {period && !result && <p className="text-danger">{t("error")}</p>}

      {period && result && (
        <section aria-labelledby="result-title" className={sectionClass}>
          <div className="grid gap-1">
            <h2 id="result-title" className="text-lg font-semibold">
              {t("resultTitle", { from: day(period.from), to: day(period.to) })}
            </h2>
            <p className="text-muted">
              {documents.length === 0
                ? t("empty")
                : t("counts", { invoices: documents.length - creditNotes, creditNotes })}
            </p>
          </div>

          {documents.length > 0 && (
            <>
              <dl className="grid gap-2 sm:grid-cols-3">
                {(["net", "vat", "total"] as const).map((key) => (
                  <div key={key} className="flex items-baseline justify-between gap-3 rounded-lg border border-border px-3 py-2 sm:grid sm:gap-0.5 sm:py-3">
                    <dt className="text-sm text-muted">{t(key)}</dt>
                    <dd className="font-semibold tabular-nums">{money(totals[key])}</dd>
                  </div>
                ))}
              </dl>

              <div className="grid gap-3">
                <div className="grid gap-1">
                  <a href={`/app/invoices/export/csv?${query}`} download className={`${buttonClass} bg-accent text-on-accent hover:bg-accent/90 sm:justify-self-start`}>
                    <DownloadIcon className="size-5" />
                    {t("downloadCsv")}
                  </a>
                  <p className="text-sm text-muted">{t("csvHint")}</p>
                </div>
                <div className="grid gap-1">
                  {documents.length > MAX_ZIP_DOCUMENTS ? (
                    <p className="flex items-start gap-2 text-sm font-medium text-warning">
                      <NoteIcon className="mt-0.5 size-4" />
                      {t("zipTooMany", { max: MAX_ZIP_DOCUMENTS })}
                    </p>
                  ) : (
                    <>
                      <a
                        href={`/app/invoices/export/zip?${query}`}
                        download
                        className={`${buttonClass} border border-border bg-surface hover:bg-background sm:justify-self-start`}
                      >
                        <DownloadIcon className="size-5" />
                        {t("downloadZip")}
                      </a>
                      <p className="text-sm text-muted">{t("zipHint")}</p>
                    </>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <h3 className="font-semibold">{t("listTitle")}</h3>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {documents.slice(0, LISTED).map((document) => (
                    <li key={document.id} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 p-3">
                      <span className="grid min-w-0 gap-0.5">
                        <span className="font-medium">
                          {document.kind === "credit_note"
                            ? t("creditNote", { number: document.number, invoice: numbers.get(document.credits ?? "") ?? "?" })
                            : t("invoice", { number: document.number })}
                        </span>
                        <span className="text-sm text-muted [overflow-wrap:anywhere]">
                          {day(document.issue_date)} · {document.buyer.name}
                        </span>
                      </span>
                      <span className="text-right font-semibold whitespace-nowrap tabular-nums">{money(document.total)}</span>
                    </li>
                  ))}
                </ul>
                {documents.length > LISTED && <p className="text-sm text-muted">{t("more", { count: documents.length - LISTED })}</p>}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
