import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRightIcon, CalendarIcon, CheckCircleIcon, CircleIcon, XCircleIcon } from "@/components/icons";
import { isService } from "@/lib/company-page";
import { repeatPath } from "@/lib/customer-account";
import type { MyRequest } from "@/lib/customer-account-server";

const secondary =
  "flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 font-semibold text-link hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// The request's state, or, once the company has planned a job from it, the job's.
const looks = {
  new: { icon: CircleIcon, tone: "text-warning" },
  accepted: { icon: CheckCircleIcon, tone: "text-success" },
  declined: { icon: XCircleIcon, tone: "text-muted" },
  planned: { icon: CalendarIcon, tone: "text-link" },
  done: { icon: CheckCircleIcon, tone: "text-success" },
  cancelled: { icon: XCircleIcon, tone: "text-danger" },
} as const;

// The customer's requests on /kunde: the status, what the company answered,
// and the planned time of the job (stage 16b). Companies' words are data, shown as written.
export async function RequestList({ requests }: { requests: MyRequest[] }) {
  const [t, tServices, format] = await Promise.all([getTranslations("CustomerAccount"), getTranslations("Services"), getFormatter()]);
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
  return (
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
                  className={`grid gap-1 rounded-lg border p-3 ${request.job_status === "planned" ? "border-accent/40 bg-accent-soft" : "border-border bg-background"}`}
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
  );
}
