import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { AlertIcon, CheckCircleIcon, NoteIcon, PencilIcon, PlusIcon } from "@/components/icons";
import { invoiceTotals, toLineFormValues, type DraftLine, type InvoiceMark } from "@/lib/invoice";
import type { JobStatus } from "@/lib/jobs";
import { createClient } from "@/lib/supabase/server";
import { MarkSentForm, UnmarkSentForm } from "./invoice-forms";
import { LineForm, RemoveLineForm } from "./line-forms";

const sectionClass = "grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6";
const summaryClass =
  "flex min-h-11 cursor-pointer items-center gap-2 px-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const linkClass =
  "rounded-sm font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export type BillTo = {
  id: string;
  name: string;
  org_number: string | null;
  email: string | null;
  invoice_email: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
};

type Props = {
  job: { id: string; status: JobStatus; customer_id: string; vehicle_id: string | null };
  organization: { currency: string; timeZone: string };
  // The mark "sent", when the invoice is sent from the accounting system.
  mark: InvoiceMark | null;
};

// The invoice draft of a job: who it goes to, the approved working time, the
// extra lines the office adds, and the totals with VAT. Only a draft: nothing
// is numbered or sent, and every extra line can be changed or removed.
export async function InvoiceSection({ job, organization, mark }: Props) {
  const supabase = await createClient();
  const [draftResult, customerResult, vehicleResult] = await Promise.all([
    supabase.rpc("invoice_draft", { job: job.id }),
    supabase
      .from("customers")
      .select("id, name, org_number, email, invoice_email, street, postal_code, city")
      .eq("id", job.customer_id)
      .maybeSingle(),
    job.vehicle_id
      ? supabase.from("vehicles").select("name").eq("id", job.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  return (
    <InvoiceView
      job={job}
      organization={organization}
      mark={mark}
      lines={(draftResult.data ?? []) as DraftLine[]}
      customer={customerResult.data as BillTo | null}
      vehicleName={(vehicleResult.data as { name: string } | null)?.name ?? null}
      failed={Boolean(draftResult.error || customerResult.error)}
    />
  );
}

// The section itself, from the loaded data.
export async function InvoiceView({
  job,
  organization,
  mark,
  lines,
  customer,
  vehicleName,
  failed,
}: Props & { lines: DraftLine[]; customer: BillTo | null; vehicleName: string | null; failed: boolean }) {
  const [t, format, locale] = await Promise.all([getTranslations("Invoice"), getFormatter(), getLocale()]);
  const separator = locale === "en" ? "." : ",";
  const cancelled = job.status === "cancelled";
  // A sent invoice is locked: nothing is changed or added any more.
  const locked = cancelled || mark !== null;
  const when = (iso: string) =>
    format.dateTime(new Date(iso), { day: "numeric", month: "long", year: "numeric", timeZone: organization.timeZone });
  const money = (ore: number) => format.number(ore / 100, { style: "currency", currency: organization.currency });
  const number = (value: number) => format.number(Number(value), { maximumFractionDigits: 2 });
  const hasTime = lines.some((line) => line.kind !== "line");
  const totals = invoiceTotals(lines);
  const sendTo = customer?.invoice_email ?? customer?.email ?? null;
  const address = customer && [customer.street, [customer.postal_code, customer.city].filter(Boolean).join(" ")].filter(Boolean);

  const title = (line: DraftLine) =>
    line.kind === "line"
      ? line.description
      : t(line.kind === "time" ? "timeLine" : "eveningLine", { vehicle: vehicleName ?? t("noVehicle") });
  const detail = (line: DraftLine) =>
    t("lineDetail", {
      quantity: line.kind === "line" ? number(line.quantity) : t("hours", { hours: number(line.quantity) }),
      unit: line.kind === "line" && line.unit ? ` ${line.unit}` : "",
      price: money(line.unit_price),
      rate: line.vat_rate,
    });

  return (
    <section aria-labelledby="invoice-title" className={sectionClass}>
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="invoice-title" className="text-lg font-semibold">
            {t("title")}
          </h2>
          {/* The state is shown with an icon and with words, never by colour alone. */}
          {mark ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-sm font-medium text-success">
              <CheckCircleIcon className="size-4" />
              {t("sentBadge")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
              <NoteIcon className="size-4" />
              {t("draftBadge")}
            </span>
          )}
        </div>
        {/* Invoice numbers are data and are shown exactly as written. */}
        <p className="text-sm text-muted [overflow-wrap:anywhere]">
          {cancelled
            ? t("cancelled")
            : mark
              ? t(mark.reference ? "sentLeadNumber" : "sentLead", { when: when(mark.sent_at), number: mark.reference ?? "" })
              : t("lead")}
        </p>
      </div>

      {failed && <p className="text-danger">{t("errors.unknown")}</p>}

      {customer && (
        <div className="grid gap-1 rounded-lg border border-border p-4">
          <p className="text-sm text-muted">{t("billTo")}</p>
          {/* Customer details are data and are shown exactly as entered. */}
          <p className="font-semibold [overflow-wrap:anywhere]">{customer.name}</p>
          {customer.org_number && <p className="tabular-nums">{t("orgNumber", { number: customer.org_number })}</p>}
          {address && address.length > 0 && <p className="[overflow-wrap:anywhere]">{address.join(", ")}</p>}
          {sendTo ? (
            <p className="[overflow-wrap:anywhere]">{t("sendTo", { email: sendTo })}</p>
          ) : (
            <p className="flex items-start gap-1.5 font-medium text-warning">
              <AlertIcon className="mt-0.5 size-5 shrink-0" />
              <span>
                {t("noEmail")}{" "}
                <Link href={`/app/customers/${customer.id}`} className={linkClass}>
                  {t("openCustomer")}
                </Link>
              </span>
            </p>
          )}
        </div>
      )}

      {!hasTime && !cancelled && <p className="text-muted">{t(job.status === "done" ? "timeNotApproved" : "timeLater")}</p>}

      {lines.length > 0 && (
        <ul className="grid divide-y divide-border border-y border-border">
          {lines.map((line, i) => (
            <li key={line.line_id ?? `${line.kind}-${i}`} className="grid gap-2 py-3">
              <div className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-0.5">
                {/* Line descriptions are data and are shown exactly as written. */}
                <p className="font-medium [overflow-wrap:anywhere]">{title(line)}</p>
                <p className="row-span-2 font-semibold tabular-nums">{money(line.amount)}</p>
                <p className="text-sm text-muted tabular-nums [overflow-wrap:anywhere]">{detail(line)}</p>
              </div>
              {line.kind === "line" && line.line_id && !locked && (
                <details className="rounded-lg border border-border">
                  <summary className={summaryClass}>
                    <PencilIcon className="size-4" />
                    {t("change")}
                  </summary>
                  <div className="grid gap-4 border-t border-border p-3">
                    <LineForm job={job.id} line={line.line_id} values={toLineFormValues(line, separator)} />
                    <RemoveLineForm job={job.id} line={line.line_id} />
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasTime && !locked && <p className="text-sm text-muted">{t("timeFromApproval")}</p>}

      {!locked && (
        <details className="rounded-lg border border-border" open={lines.length === 0 || undefined}>
          <summary className={summaryClass}>
            <PlusIcon className="size-4" />
            {t("addLine")}
          </summary>
          <div className="border-t border-border p-3">
            <LineForm job={job.id} />
          </div>
        </details>
      )}

      {lines.length > 0 && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
          <dt>{t("net")}</dt>
          <dd className="text-right font-medium tabular-nums">{money(totals.net)}</dd>
          {totals.vat.map((row) => (
            <div key={row.rate} className="contents">
              <dt className="text-muted">{t("vatLine", { rate: row.rate, base: money(row.base) })}</dt>
              <dd className="text-right font-medium tabular-nums">{money(row.vat)}</dd>
            </div>
          ))}
          <div className="col-span-2 grid grid-cols-subgrid items-baseline border-t border-border pt-2">
            <dt className="font-semibold">{t("total")}</dt>
            <dd className="text-right text-lg font-semibold tabular-nums">{money(totals.total)}</dd>
          </div>
        </dl>
      )}

      {/* Sent from the accounting system, then marked here; MaskinGo sends nothing. */}
      {!mark && hasTime && job.status === "done" && (
        <div className="grid gap-3 border-t border-border pt-4">
          <div className="grid gap-1">
            <h3 className="font-semibold">{t("markTitle")}</h3>
            <p className="text-sm text-muted">{t("markLead")}</p>
          </div>
          <MarkSentForm job={job.id} />
        </div>
      )}
      {mark && (
        <details className="rounded-lg border border-border">
          <summary className={summaryClass}>{t("unmarkTitle")}</summary>
          <div className="grid gap-3 border-t border-border p-3">
            <p className="text-sm text-muted">{t("unmarkLead")}</p>
            <UnmarkSentForm job={job.id} />
          </div>
        </details>
      )}
    </section>
  );
}
