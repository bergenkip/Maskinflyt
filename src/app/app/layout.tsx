import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/brand";
import { AppNav, SettingsLink } from "@/components/app-nav";
import { SignOutIcon } from "@/components/icons";
import { getCurrentMembership } from "@/lib/membership";
import { hasSecondStep } from "@/lib/mfa";
import { canSeeCustomers, canSeeJobs, canSeeVehicles, needsMfa } from "@/lib/roles";
import { getUserId } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  // The proxy already redirects signed-out visitors; this is a second check.
  if (!(await getUserId())) redirect("/login");
  // Owners and admins first confirm with a link e-mailed to them. The lookups
  // run side by side; each is cached for the page that renders next.
  const [membership, secondStep, t] = await Promise.all([getCurrentMembership(), hasSecondStep(), getTranslations("Nav")]);
  if (membership && needsMfa(membership.role) && !secondStep) redirect("/mfa");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-x-4 px-4 py-2 sm:px-6 lg:gap-x-1">
          <Brand href="/app" label={t("dashboard")} />
          {/* Phones and tablets: the menu is a tab bar at the bottom of the screen (see AppNav). */}
          <div className="lg:order-2 lg:ml-auto">
            <AppNav
              labels={{
                dashboard: t("dashboard"),
                jobs: t("jobs"),
                customers: t("customers"),
                vehicles: t("vehicles"),
                team: t("team"),
                settings: t("settings"),
                mainMenu: t("mainMenu"),
              }}
              showJobs={!!membership && canSeeJobs(membership.role)}
              showCustomers={!!membership && canSeeCustomers(membership.role)}
              showVehicles={!!membership && canSeeVehicles(membership.role)}
            />
          </div>
          <div className="flex items-center gap-1 lg:order-3">
            <SettingsLink label={t("settings")} />
            <form action={signOut}>
              <button
                type="submit"
                title={t("signOut")}
                className="flex min-h-11 items-center gap-2 rounded-lg px-3 font-medium text-muted hover:bg-accent-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <SignOutIcon />
                {/* Computers: icon only, so the header with the whole menu fits one row. */}
                <span className="lg:sr-only">{t("signOut")}</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      {/* The header reaches the screen edges; the content keeps clear of the notch in landscape. */}
      <div className="flex flex-1 flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 lg:pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}
