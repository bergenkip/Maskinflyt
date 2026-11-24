import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/brand";
import { SignOutIcon } from "@/components/icons";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/app/app/actions";

// The customer's own pages (stage 16a): MaskinGo's public look, with signing out.
export default async function CustomerLayout({ children }: LayoutProps<"/kunde">) {
  const t = await getTranslations("Nav");
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-x-3 px-4 py-2 sm:gap-x-4 sm:px-6">
          <Brand href="/kunde" label={t("home")} />
          <div className="flex items-center gap-x-1 sm:gap-x-3">
            <LanguageSwitcher />
            <ThemeToggle />
            <form action={signOut}>
              <button
                type="submit"
                title={t("signOut")}
                className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2 font-medium text-muted hover:bg-accent-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-3"
              >
                <SignOutIcon />
                <span className="max-sm:sr-only">{t("signOut")}</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-10 sm:px-6 sm:pt-8 sm:pb-16">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
