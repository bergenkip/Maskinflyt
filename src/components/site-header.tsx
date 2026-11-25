import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/brand";
import { SearchIcon, UserIcon } from "@/components/icons";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCustomerAccount } from "@/lib/customer-account-server";
import { DIRECTORY_PATH } from "@/lib/directory";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getUserId } from "@/lib/supabase/server";

// Header for pages visible without signing in. Sticky and full width like the
// app header, so Safari colours the strip above it with the same colour.
// Signed in, the corner leads back to the person's own pages instead of "Sign in":
// a customer to /kunde, everyone else to the app. The sign-in pages (showLogin false)
// show neither: on /reset-password the e-mailed link has just signed the person in,
// and a prefetched link to /app there raced the form's own redirect to /app.
export async function SiteHeader({ showLogin = true }: { showLogin?: boolean }) {
  const t = await getTranslations("Nav");
  const userId = showLogin && getSupabaseEnv() ? await getUserId() : null;
  const home = userId ? ((await getCustomerAccount()) ? "/kunde" : "/app") : null;

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-x-3 px-4 py-2 sm:gap-x-4 sm:px-6">
        <Brand href="/" label={t("home")} />
        <div className="flex items-center gap-x-1 sm:gap-x-3">
          {/* The catalog, from every public page. Phones have no room for it here: the home page
              shows the search right under the title, and every page links to it in the footer. */}
          <Link
            href={DIRECTORY_PATH}
            className="hidden min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 font-medium whitespace-nowrap text-foreground hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex sm:px-3"
          >
            <SearchIcon className="size-5 shrink-0" />
            <span className="sr-only lg:not-sr-only">{t("directory")}</span>
          </Link>
          <LanguageSwitcher />
          <ThemeToggle />
          {home ? (
            <Link
              href={home}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 font-medium whitespace-nowrap sm:px-3 text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {/* Phones show the person icon only, so long words ("Mano paskyra") never push the page sideways. */}
              <UserIcon className="size-5 shrink-0 sm:hidden" />
              <span className="sr-only sm:not-sr-only">{t("myAccount")}</span>
            </Link>
          ) : showLogin && (
            <Link
              href="/login"
              className="flex min-h-11 items-center rounded-lg px-2 font-medium whitespace-nowrap sm:px-3 text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {t("login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
