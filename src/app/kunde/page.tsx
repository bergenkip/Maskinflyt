import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MapPinIcon, SearchIcon, SendIcon } from "@/components/icons";
import { pagePath } from "@/lib/company-page";
import { getCustomerAccount, getMyCompanies, getMyRequests } from "@/lib/customer-account-server";
import { formatPhone } from "@/lib/customers";
import { DIRECTORY_PATH } from "@/lib/directory";
import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "./account-form";
import { RequestList } from "./request-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CustomerAccount");
  return { title: `${t("title")} · MaskinGo`, robots: { index: false, follow: false } };
}

const sectionClass = "grid gap-4 rounded-xl border border-border bg-surface p-4 sm:p-6";
const primary =
  "flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-fit";
const secondary =
  "flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 font-semibold text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// The customer's own page (stage 16a): their requests and what the companies
// answered, the companies they use most (to order again in one tap), and the
// details that fill in new requests. Companies' answers are data, shown as written.
export default async function CustomerPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login?next=/kunde");

  const [t, account] = await Promise.all([getTranslations("CustomerAccount"), getCustomerAccount()]);

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
          <RequestList requests={requests} />
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
