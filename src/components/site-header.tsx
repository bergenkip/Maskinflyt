import Link from "next/link";
import { useTranslations } from "next-intl";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";

// Header for pages visible without signing in. Sticky and full width like the
// app header, so Safari colours the strip above it with the same colour.
export function SiteHeader({ showLogin = true }: { showLogin?: boolean }) {
  const t = useTranslations("Nav");

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <Brand href="/" label={t("home")} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <LanguageSwitcher />
          {showLogin && (
            <Link
              href="/login"
              className="flex min-h-11 items-center rounded-lg px-3 font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {t("login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
