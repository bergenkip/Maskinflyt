import { getFormatter, getTranslations } from "next-intl/server";
import { AlertIcon, CheckCircleIcon, MailIcon } from "@/components/icons";
import { noticeNeeded, type CustomerNotice } from "@/lib/job-notice";
import { createClient } from "@/lib/supabase/server";
import { NoticeForm } from "./notice-form";

// Stage 16c: on a job planned from a customer's request, what the customer was
// last told by e-mail, and a button when the job has changed since: a new time,
// a cancellation, or a time never sent. Nothing goes out without the tap.
export async function CustomerNoticeSection({
  job,
  timeZone,
}: {
  job: { id: string; request_id: string; status: string; starts_at: string; ends_at: string };
  timeZone: string;
}) {
  const supabase = await createClient();
  const [{ data: request }, { data: notice }] = await Promise.all([
    supabase.from("job_requests").select("name, email").eq("id", job.request_id).maybeSingle(),
    supabase.from("job_customer_notices").select("starts_at, ends_at, cancelled, sent_at").eq("job_id", job.id).maybeSingle(),
  ]);
  const customer = request as { name: string; email: string | null } | null;
  if (!customer) return null;
  return <NoticeBox job={job} customer={customer} told={notice as CustomerNotice | null} timeZone={timeZone} />;
}

export async function NoticeBox({
  job,
  customer,
  told,
  timeZone,
}: {
  job: { id: string; status: string; starts_at: string; ends_at: string };
  customer: { name: string; email: string | null };
  told: CustomerNotice | null;
  timeZone: string;
}) {
  const [t, format] = await Promise.all([getTranslations("Jobs"), getFormatter()]);
  const kind = noticeNeeded(job, told);
  // A finished job, with nothing ever sent, needs no box.
  if (job.status === "done" && !told) return null;

  const span = (starts: string, ends: string) =>
    format.dateTimeRange(new Date(starts), new Date(ends), {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
  const sentAt = told
    ? format.dateTime(new Date(told.sent_at), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone })
    : "";
  const state = !kind
    ? told?.cancelled
      ? t("noticeToldCancelled", { time: sentAt })
      : t("noticeTold", { time: sentAt })
    : kind === "cancelled"
      ? t("noticeCancelled")
      : kind === "changed"
        ? t("noticeChanged", { time: span(told!.starts_at, told!.ends_at) })
        : told?.cancelled
          ? t("noticeBack")
          : t("noticeNever");

  return (
    <section aria-labelledby="notice-title" className="grid gap-3 rounded-xl border border-border bg-surface p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 id="notice-title" className="text-xl font-semibold">
          {t("noticeTitle")}
        </h2>
        {/* The customer's name and address are data and are shown exactly as written. */}
        <p className="flex items-start gap-2 text-sm text-muted [overflow-wrap:anywhere]">
          <MailIcon className="mt-0.5 size-4 shrink-0" />
          {customer.email ? t("noticeTo", { name: customer.name, email: customer.email }) : t("noticeNoEmail", { name: customer.name })}
        </p>
      </div>
      <p className={`flex items-start gap-2 font-medium ${kind ? "text-warning" : "text-success"}`}>
        {kind ? <AlertIcon className="mt-0.5 size-5 shrink-0" /> : <CheckCircleIcon className="mt-0.5 size-5 shrink-0" />}
        <span className="text-foreground [overflow-wrap:anywhere]">{state}</span>
      </p>
      {kind && customer.email && <NoticeForm job={job.id} kind={kind} />}
    </section>
  );
}
