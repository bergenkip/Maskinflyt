import { getTranslations } from "next-intl/server";
import {
  CalendarIcon,
  CheckCircleIcon,
  CircleIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  TruckIcon,
  XCircleIcon,
} from "@/components/icons";
import { isService } from "@/lib/company-page";
import { formatPhone } from "@/lib/customers";
import type { JobRequestStatus } from "@/lib/job-requests";

export type JobRequestRow = {
  id: string;
  status: JobRequestStatus;
  name: string;
  phone: string | null;
  email: string | null;
  place: string;
  wanted_date: string | null;
  service: string | null;
  description: string;
  created_at: string;
};

const looks: Record<JobRequestStatus, { icon: typeof CircleIcon; tone: string }> = {
  new: { icon: CircleIcon, tone: "text-warning" },
  accepted: { icon: CheckCircleIcon, tone: "text-success" },
  declined: { icon: XCircleIcon, tone: "text-muted" },
};

const contactClass =
  "flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 font-semibold text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// One request: who, where, when and what, with links to call or write back.
// The status is shown with an icon and words. What the customer wrote is data
// and is shown exactly as written.
export async function RequestCard({ request, received, wanted }: { request: JobRequestRow; received: string; wanted: string | null }) {
  const [t, tServices] = await Promise.all([getTranslations("JobRequests"), getTranslations("Services")]);
  const { icon: StatusIcon, tone } = looks[request.status];
  return (
    <article aria-labelledby={`request-${request.id}`} className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="grid min-w-0 gap-0.5">
          <h3 id={`request-${request.id}`} className="font-semibold [overflow-wrap:anywhere]">
            {request.name}
          </h3>
          <p className="text-sm text-muted">{t("received", { time: received })}</p>
        </div>
        <span className={`flex shrink-0 items-center gap-1 text-sm font-medium ${tone}`}>
          <StatusIcon className="size-4" />
          {t(`statuses.${request.status}`)}
        </span>
      </header>

      <dl className="grid gap-1.5 text-sm">
        <div className="flex items-start gap-2">
          <dt className="sr-only">{t("place")}</dt>
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted" />
          <dd className="[overflow-wrap:anywhere]">{request.place}</dd>
        </div>
        {wanted && (
          <div className="flex items-start gap-2">
            <dt className="sr-only">{t("wantedDate")}</dt>
            <CalendarIcon className="mt-0.5 size-4 shrink-0 text-muted" />
            <dd>{t("wantedOn", { date: wanted })}</dd>
          </div>
        )}
        {request.service && isService(request.service) && (
          <div className="flex items-start gap-2">
            <dt className="sr-only">{t("service")}</dt>
            <TruckIcon className="mt-0.5 size-4 shrink-0 text-muted" />
            <dd>{tServices(request.service)}</dd>
          </div>
        )}
      </dl>

      <p className="[overflow-wrap:anywhere] whitespace-pre-line">{request.description}</p>

      {(request.phone || request.email) && (
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          {request.phone && (
            <a href={`tel:${request.phone}`} className={contactClass}>
              <PhoneIcon className="size-5 shrink-0" />
              {formatPhone(request.phone)}
            </a>
          )}
          {request.email && (
            <a href={`mailto:${request.email}`} className={contactClass}>
              <MailIcon className="size-5 shrink-0" />
              <span className="min-w-0 break-all">{request.email}</span>
            </a>
          )}
        </div>
      )}
    </article>
  );
}
