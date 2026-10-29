import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  ArrowRightIcon,
  BuildingIcon,
  PauseCircleIcon,
  PlusIcon,
  SearchIcon,
  UserIcon,
} from "@/components/icons";
import { customerColumns, formatPhone, searchPattern, type Customer } from "@/lib/customers";
import { getAddedBy } from "@/lib/added-by";
import { getCurrentMembership } from "@/lib/membership";
import { formatOrgNumber } from "@/lib/org-number";
import { canSeeCustomers } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Customers");
  return { title: `${t("title")} · Maskinflyt` };
}

export default async function CustomersPage({ searchParams }: PageProps<"/app/customers">) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeCustomers(membership.role)) redirect("/app");

  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 100) : "";
  const pattern = searchPattern(query);

  const { organization } = membership;
  const supabase = await createClient();
  // Active first, then by name. The search column is lower-case text (see the migration).
  let request = supabase
    .from("customers")
    .select(customerColumns)
    .eq("organization_id", organization.id)
    .order("active", { ascending: false })
    .order("name");
  if (pattern) request = request.ilike("search", pattern);
  const [t, addedBy, result] = await Promise.all([getTranslations("Customers"), getAddedBy(organization.id), request]);
  const customers = (result.data ?? []) as Customer[];

  return (
    <div className="grid max-w-3xl gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid min-w-0 gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          {/* Company names are data and are shown exactly as entered. */}
          <p className="text-muted [overflow-wrap:anywhere]">{t("lead", { company: organization.name })}</p>
        </div>
        <Link
          href="/app/customers/new"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
        >
          <PlusIcon className="size-5" />
          {t("addTitle")}
        </Link>
      </div>

      <section aria-labelledby="list-title" className="grid gap-4">
        <h2 id="list-title" className="sr-only">
          {t("listTitle")}
        </h2>
        <form role="search" action="/app/customers" className="flex gap-2">
          <label htmlFor="customer-search" className="sr-only">
            {t("searchLabel")}
          </label>
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
            <input
              id="customer-search"
              name="q"
              type="search"
              defaultValue={query}
              maxLength={100}
              autoComplete="off"
              placeholder={t("searchPlaceholder")}
              className="min-h-11 w-full rounded-lg border border-border bg-surface pr-3 pl-10 text-base text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
          </div>
          <button
            type="submit"
            className="min-h-11 shrink-0 rounded-lg border border-border px-4 font-medium hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t("search")}
          </button>
        </form>

        {!result.error && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-sm text-muted" aria-live="polite">
              {pattern ? t("found", { count: customers.length }) : t("count", { count: customers.length })}
            </p>
            {pattern && (
              <Link
                href="/app/customers"
                className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {t("clearSearch")}
              </Link>
            )}
          </div>
        )}

        {result.error ? (
          <p className="text-danger">{t("errors.unknown")}</p>
        ) : customers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-muted">
            {pattern ? t("noMatches") : t("empty")}
          </p>
        ) : (
          <ul className="grid gap-3">
            {customers.map((customer) => {
              const KindIcon = customer.kind === "company" ? BuildingIcon : UserIcon;
              const details = [
                customer.kind === "company"
                  ? customer.org_number
                    ? t("orgNumberShort", { number: formatOrgNumber(customer.org_number) })
                    : t("kinds.company")
                  : t("kinds.private"),
                customer.phone && formatPhone(customer.phone),
                customer.city,
              ].filter(Boolean);
              return (
                <li key={customer.id}>
                  <Link
                    href={`/app/customers/${customer.id}`}
                    className="group flex items-start gap-3 rounded-xl border border-border bg-surface p-4 hover:border-accent/60 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <span
                      className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${customer.active ? "bg-accent-soft text-accent" : "border border-border text-muted"}`}
                    >
                      <KindIcon className="size-6" />
                    </span>
                    <span className="grid min-w-0 flex-1 gap-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        {/* Customer names are data and are shown exactly as entered. */}
                        <span className="font-semibold [overflow-wrap:anywhere]">{customer.name}</span>
                        {/* The state is shown with an icon and with words, never by colour alone. */}
                        {!customer.active && (
                          <span className="flex items-center gap-1 text-sm font-medium text-muted">
                            <PauseCircleIcon className="size-4" />
                            {t("inactive")}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted tabular-nums [overflow-wrap:anywhere]">
                        {details.map((detail) => (
                          <span key={String(detail)}>{detail}</span>
                        ))}
                      </span>
                      {customer.contact_name && (
                        <span className="text-sm [overflow-wrap:anywhere]">{customer.contact_name}</span>
                      )}
                      {/* Person names are data and are shown exactly as entered. */}
                      <span className="text-sm text-muted [overflow-wrap:anywhere]">{addedBy(customer)}</span>
                    </span>
                    <ArrowRightIcon className="mt-3 size-5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
