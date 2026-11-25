import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRightIcon, GlobeIcon, InboxIcon } from "@/components/icons";
import { getCurrentMembership } from "@/lib/membership";
import { canSeeJobs } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "../back-link";
import { RequestCard, type JobRequestRow } from "./request-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("JobRequests");
  return { title: `${t("title")} · MaskinGo` };
}

// Requests customers sent from the company page (stage 15b), newest first.
// The office reads them here; answering them in the app comes next.
export default async function JobRequestsPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeJobs(membership)) redirect("/app");

  const { organization, role } = membership;
  const isAdmin = role === "owner" || role === "admin";
  const supabase = await createClient();
  const [t, format, result, page] = await Promise.all([
    getTranslations("JobRequests"),
    getFormatter(),
    supabase
      .from("job_requests")
      .select("id, status, name, phone, email, place, wanted_date, wanted_start, service, description, created_at, answer, customer_id, handled_at, user_id, jobs(id, number)")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("company_pages").select("published").eq("organization_id", organization.id).maybeSingle(),
  ]);
  const requests = (result.data ?? []) as JobRequestRow[];
  const published = (page.data as { published: boolean } | null)?.published === true;
  const { timeZone } = organization;
  const received = (iso: string) =>
    format.dateTime(new Date(iso), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone });
  // A wanted day is a calendar date, not an instant: read at noon UTC so it never shifts.
  const day = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  // A picked time is an instant: show its day and clock time in the company's time zone.
  const wantedLine = (request: JobRequestRow) =>
    request.wanted_start
      ? t("wantedAt", {
          date: format.dateTime(new Date(request.wanted_start), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone }),
          time: format.dateTime(new Date(request.wanted_start), { hour: "2-digit", minute: "2-digit", timeZone }),
        })
      : request.wanted_date
        ? t("wantedOn", { date: day(request.wanted_date) })
        : null;
  const newCount = requests.filter((request) => request.status === "new").length;

  return (
    <div className="grid max-w-3xl gap-6">
      <BackLink label={t("back")} />
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>

      {result.error ? (
        <p className="text-danger">{t("error")}</p>
      ) : requests.length === 0 ? (
        <div className="grid gap-3 rounded-xl border border-dashed border-border p-4">
          <p className="flex items-start gap-2 text-muted">
            <InboxIcon className="mt-0.5 size-5 shrink-0" />
            {published ? t("emptyPublished") : t("emptyNoPage")}
          </p>
          {!published && isAdmin && (
            <Link
              href="/app/public-page"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 font-semibold text-link hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-fit"
            >
              <GlobeIcon className="size-5" />
              {t("setUpPage")}
              <ArrowRightIcon className="size-5" />
            </Link>
          )}
        </div>
      ) : (
        <section aria-labelledby="requests-title" className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="requests-title" className="text-lg font-semibold">
              {t("listTitle")}
            </h2>
            <p className="text-sm text-muted">{t("count", { count: requests.length, unanswered: newCount })}</p>
          </div>
          <ul className="grid gap-3">
            {requests.map((request) => (
              <li key={request.id}>
                <RequestCard
                  request={request}
                  received={received(request.created_at)}
                  wanted={wantedLine(request)}
                  answered={request.handled_at ? received(request.handled_at) : null}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
