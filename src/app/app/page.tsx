import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRightIcon, CheckCircleIcon, CircleIcon, ClockIcon, InboxIcon, TruckIcon, UsersIcon } from "@/components/icons";
import { getCurrentMembership } from "@/lib/membership";
import { formatOrgNumber } from "@/lib/org-number";
import { canSeeVehicles } from "@/lib/roles";
import { createClient, getUserId } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Dashboard");
  return { title: `${t("title")} · Maskinflyt` };
}

export default async function DashboardPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");

  const { organization, role } = membership;
  const isAdmin = role === "owner" || role === "admin";
  const showVehicles = canSeeVehicles(role);
  const supabase = await createClient();
  const userId = await getUserId();

  // Counts only (head: true returns no rows). RLS limits every query to this company;
  // invitations are visible to owners and admins only, vehicles not to drivers.
  const [t, tRoles, format, profile, members, invitations, vehicles, activeVehicles] = await Promise.all([
    getTranslations("Dashboard"),
    getTranslations("Roles"),
    getFormatter(),
    supabase.from("profiles").select("first_name").eq("id", userId ?? "").maybeSingle(),
    supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", organization.id),
    isAdmin
      ? supabase
          .from("invitations")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
      : null,
    showVehicles
      ? supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("organization_id", organization.id)
      : null,
    showVehicles
      ? supabase
          .from("vehicles")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id)
          .eq("active", true)
      : null,
  ]);

  // Names are data and are shown exactly as entered.
  const firstName = profile.data?.first_name?.trim();
  const memberCount = members.count ?? 0;
  const number = (value: number | null) => (value === null ? "–" : format.number(value));

  return (
    <div className="grid gap-5 sm:gap-6">
      <div className="grid gap-1">
        <p className="text-sm font-semibold tracking-wide text-accent uppercase">
          {firstName ? t("greeting", { name: firstName }) : t("title")}
        </p>
        {/* Company names are data and are shown exactly as entered. */}
        <h1 className="text-3xl font-semibold tracking-tight text-balance [overflow-wrap:anywhere]">
          {organization.name}
        </h1>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
          <span>{t("role", { role: tRoles(role) })}</span>
          {organization.orgNumber && (
            <span className="tabular-nums">{t("orgNumber", { number: formatOrgNumber(organization.orgNumber) })}</span>
          )}
        </p>
      </div>

      <section aria-labelledby="numbers-title" className="grid gap-3">
        <h2 id="numbers-title" className="sr-only">
          {t("numbersTitle")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          <li>
            <StatCard
              href="/app/team"
              tone="bg-success-soft text-success"
              icon={<UsersIcon className="size-6" />}
              value={members.error ? null : memberCount}
              format={number}
              label={t("membersLabel")}
              detail={invitations && !invitations.error ? t("openInvites", { count: invitations.count ?? 0 }) : undefined}
            />
          </li>
          {vehicles && (
            <li>
              <StatCard
                href="/app/vehicles"
                tone="bg-accent-soft text-accent"
                icon={<TruckIcon className="size-6" />}
                value={vehicles.error ? null : (vehicles.count ?? 0)}
                format={number}
                label={t("vehiclesLabel")}
                detail={
                  activeVehicles && !activeVehicles.error
                    ? t("vehiclesActive", { count: activeVehicles.count ?? 0 })
                    : undefined
                }
              />
            </li>
          )}
          <li>
            {/* Not a link: there is nothing to open yet. */}
            <div className="flex h-full items-start gap-3 rounded-2xl border border-dashed border-border p-4">
              <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface text-muted">
                <InboxIcon className="size-6" />
              </span>
              <div className="grid gap-1">
                <p className="font-semibold">{t("ordersLabel")}</p>
                <p className="flex items-center gap-1.5 text-sm text-muted">
                  <ClockIcon className="size-4" />
                  {t("empty")}
                </p>
              </div>
            </div>
          </li>
        </ul>
      </section>

      {isAdmin && (
        <section aria-labelledby="start-title" className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="grid gap-1">
            <h2 id="start-title" className="text-lg font-semibold">
              {t("startTitle")}
            </h2>
            <p className="text-muted">{t("startLead")}</p>
          </div>
          <ol className="grid gap-1">
            <Step done={(vehicles?.count ?? 0) > 0} href="/app/vehicles" label={t("stepVehicles")} status={t} />
            <Step done={memberCount > 1} href="/app/team" label={t("stepTeam")} status={t} />
            <Step later label={t("stepOrders")} status={t} />
          </ol>
        </section>
      )}
    </div>
  );
}

function StatCard(props: {
  href: string;
  tone: string;
  icon: ReactNode;
  value: number | null;
  format: (value: number | null) => string;
  label: string;
  detail?: string;
}) {
  return (
    <Link
      href={props.href}
      className="group flex h-full items-start gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-accent/60 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className={`flex size-11 items-center justify-center rounded-xl ${props.tone}`}>{props.icon}</span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-3xl leading-tight font-semibold tracking-tight tabular-nums">{props.format(props.value)}</span>
        <span className="font-medium">{props.label}</span>
        {props.detail && <span className="text-sm text-muted">{props.detail}</span>}
      </span>
      <ArrowRightIcon className="mt-1 size-5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
    </Link>
  );
}

function Step(props: {
  done?: boolean;
  later?: boolean;
  // Not needed to receive orders; said in words so nobody thinks it is required.
  optional?: boolean;
  href?: string;
  label: string;
  status: (key: "stepDone" | "stepTodo" | "stepLater" | "stepOptional") => string;
}) {
  // The state is shown with an icon and with words, never by colour alone.
  const state = props.later ? "stepLater" : props.done ? "stepDone" : props.optional ? "stepOptional" : "stepTodo";
  const icon = props.done ? (
    <CheckCircleIcon className="size-6 text-success" />
  ) : props.later ? (
    <ClockIcon className="size-6 text-muted" />
  ) : (
    <CircleIcon className="size-6 text-accent" />
  );
  const body = (
    <>
      {icon}
      <span className="grid min-w-0 flex-1">
        <span className={`font-medium ${props.done ? "text-muted line-through decoration-1" : ""}`}>{props.label}</span>
        <span className="text-sm text-muted">{props.status(state)}</span>
      </span>
    </>
  );

  return (
    <li>
      {props.href && !props.done ? (
        <Link
          href={props.href}
          className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {body}
          <ArrowRightIcon className="size-5 text-accent" />
        </Link>
      ) : (
        <div className="flex min-h-12 items-center gap-3 px-2 py-1.5">{body}</div>
      )}
    </li>
  );
}
