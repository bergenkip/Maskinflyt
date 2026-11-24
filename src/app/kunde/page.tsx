import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  CircleIcon,
  MapPinIcon,
  SearchIcon,
  SendIcon,
  XCircleIcon,
} from "@/components/icons";
import { isService, pagePath } from "@/lib/company-page";
import { repeatPath } from "@/lib/customer-account";
import { getCustomerAccount, getMyCompanies, getMyRequests, type MyRequest } from "@/lib/customer-account-server";
import { formatPhone } from "@/lib/customers";
import { DIRECTORY_PATH } from "@/lib/directory";
import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "./account-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CustomerAccount");
  return { title: `${t("title")} · MaskinGo`, robots: { index: false, follow: false } };
}

const sectionClass = "grid gap-4 rounded-xl border border-border bg-surface p-4 sm:p-6";
const primary =
  "flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-fit";
const secondary =
  "flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 font-semibold text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// The request's state, or, once the company has planned a job from it, the job's.
const looks = {
  new: { icon: CircleIcon, tone: "text-warning" },
  accepted: { icon: CheckCircleIcon, tone: "text-success" },
  declined: { icon: XCircleIcon, tone: "text-muted" },
  planned: { icon: CalendarIcon, tone: "text-accent" },
  done: { icon: CheckCircleIcon, tone: "text-success" },
  cancelled: { icon: XCircleIcon, tone: "text-danger" },
} as const;

// The customer's own page (stage 16a): their requests and what the companies
// answered, the companies they use most (to order again in one tap), and the
// details that fill in new requests. Companies' answers are data, shown as written.
export default async function CustomerPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login?next=/kunde");

  const [t, tServices, format, account] = await Promise.all([
    getTranslations("CustomerAccount"),
    getTranslations("Services"),
    getFormatter(),
    getCustomerAccount(),
  ]);

  // Signed in without a customer account (for example a company member): offer one.
  if (!account) {
    return (
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t("startTitle")}</h1>
          <p className="text-muted">{t("startLead")}</p>
        </div>
        <section aria-label={t("startTitle")} className={sectionClass}>
          <AccountForm initial={{ phone: "", place: "" }} create />
        </section>
      </div>
    );
  }

  const [requests, companies] = await Promise.all([getMyRequests(), getMyCompanies()]);
  const timeZone = "Europe/Oslo";
  const sent = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "long", year: "numeric", timeZone });
  const wanted = (request: MyRequest) =>
    request.wanted_start
      ? t("wantedAt", {
          date: format.dateTime(new Date(request.wanted_start), { weekday: "long", day: "numeric", month: "long", timeZone }),
          time: format.dateTime(new Date(request.wanted_start), { hour: "2-digit", minute: "2-digit", timeZone }),
        })
      : request.wanted_date
        ? t("wantedOn", {
            date: format.dateTime(new Date(`${request.wanted_date}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
          })
        : null;
  // The planned time, in the company's own time zone: "Tuesday 1 December, 08:00–12:00".
  const plannedTime = (request: MyRequest) =>
    request.job_starts_at && request.job_ends_at
      ? format.dateTimeRange(new Date(request.job_starts_at), new Date(request.job_ends_at), {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: request.time_zone,
        })
      : null;
  const firstName = account.name.split(" ")[0];

  return (
    <div className="grid gap-8 *:min-w-0">
      <div className="grid gap-3">
        <h1 className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">
          {firstName ? t("greeting", { name: firstName }) : t("title")}
        </h1>
        <p className="text-muted">{t("lead")}</p>
        <Link href={DIRECTORY_PATH} className={primary}>
          <SearchIcon className="size-5" />
          {t("findCompany")}
        </Link>
      </div>

      {companies.length > 0 && (
        <section aria-labelledby="my-companies" className="grid gap-3">
          <h2 id="my-companies" className="text-xl font-semibold">
            {t("companiesTitle")}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {companies.map((company) => (
              <li key={company.slug} className="grid content-start gap-3 rounded-xl border border-border bg-surface p-4">
                <div className="grid gap-0.5">
                  <h3 className="font-semibold [overflow-wrap:anywhere]">
                    <Link
                      href={pagePath(company.slug)}
                      className="rounded underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {company.name}
                    </Link>
                  </h3>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                    {company.city && (
                      <span className="flex items-center gap-1">
                        <MapPinIcon className="size-4" />
                        {company.city}
                      </span>
                    )}
                    <span>{t("requestsCount", { count: company.requests })}</span>
                  </p>
                </div>
                <Link href={`${pagePath(company.slug)}#request`} className={secondary}>
                  <SendIcon className="size-5" />
                  {t("orderAgain")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="my-requests" className="grid gap-3">
        <h2 id="my-requests" className="text-xl font-semibold">
          {t("requestsTitle")}
        </h2>
        {!requests ? (
          <p className="text-danger">{t("errors.unknown")}</p>
        ) : requests.length === 0 ? (
          <div className="grid gap-3 rounded-xl border border-dashed border-border p-4">
            <p className="text-muted">{t("noRequests")}</p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {requests.map((request) => {
              const state = request.job_status ?? request.status;
              const { icon: StatusIcon, tone } = looks[state];
              const when = wanted(request);
              const planned = plannedTime(request);
              return (
                <li key={request.id}>
                  <article aria-labelledby={`req-${request.id}`} className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
                    <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <div className="grid min-w-0 gap-0.5">
                        <h3 id={`req-${request.id}`} className="font-semibold [overflow-wrap:anywhere]">
                          {request.company}
                        </h3>
                        <p className="text-sm text-muted">{t("sent", { date: sent(request.created_at) })}</p>
                      </div>
                      <span className={`flex shrink-0 items-center gap-1 text-sm font-medium ${tone}`}>
                        <StatusIcon className="size-4" />
                        {t(`statuses.${state}`)}
                      </span>
                    </header>
                    <p className="text-sm text-muted [overflow-wrap:anywhere]">
                      {[request.service && isService(request.service) ? tServices(request.service) : null, request.place, when]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="line-clamp-3 [overflow-wrap:anywhere] whitespace-pre-line">{request.description}</p>
                    {planned && (
                      <div
                        className={`grid gap-1 rounded-lg border p-3 ${request.job_status === "cancelled" ? "border-border bg-background" : "border-accent/40 bg-accent-soft"}`}
                      >
                        <p className="text-sm font-medium text-muted">
                          {t(request.job_status === "cancelled" ? "cancelledTime" : request.job_status === "done" ? "doneTime" : "plannedTime")}
                        </p>
                        <p
                          className={`flex items-start gap-2 font-semibold [overflow-wrap:anywhere] ${request.job_status === "cancelled" ? "text-muted line-through" : ""}`}
                        >
                          <CalendarIcon className="mt-0.5 size-5 shrink-0" />
                          {planned}
                        </p>
                        {request.job_status === "planned" && <p className="text-sm text-muted">{t("plannedHint")}</p>}
                        {request.job_status === "cancelled" && <p className="text-sm text-muted">{t("cancelledHint", { company: request.company })}</p>}
                      </div>
                    )}
                    {request.status === "accepted" && !request.job_status && (
                      <p className="text-sm text-muted">{t("acceptedHint", { company: request.company })}</p>
                    )}
                    {request.answer && (
                      <div className="grid gap-1 rounded-lg border border-border bg-background p-3">
                        <p className="text-sm font-medium text-muted">{t("answerFrom", { company: request.company })}</p>
                        <p className="[overflow-wrap:anywhere] whitespace-pre-line">{request.answer}</p>
                      </div>
                    )}
                    {request.slug && request.page_published && (
                      <Link href={repeatPath(request.slug, request.id)} className={`${secondary} sm:w-fit`}>
                        <ArrowRightIcon className="size-5" />
                        {t("sendAgain")}
                      </Link>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="my-details" className={sectionClass}>
        <div className="grid gap-1">
          <h2 id="my-details" className="text-xl font-semibold">
            {t("detailsTitle")}
          </h2>
          <p className="text-sm text-muted">{t("detailsLead")}</p>
        </div>
        <dl className="grid gap-1 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted">{t("name")}</dt>
            <dd className="font-medium [overflow-wrap:anywhere]">{account.name || "–"}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted">{t("email")}</dt>
            <dd className="font-medium break-all">{account.email}</dd>
          </div>
        </dl>
        <AccountForm initial={{ phone: account.phone ? formatPhone(account.phone) : "", place: account.place ?? "" }} />
      </section>
    </div>
  );
}
