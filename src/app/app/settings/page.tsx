import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient, getUserId } from "@/lib/supabase/server";
import { LanguageForm } from "./language-form";
import { NameForm } from "./name-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Settings");
  return { title: `${t("title")} · Maskinflyt` };
}

const sectionClass = "grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6";

export default async function SettingsPage() {
  const t = await getTranslations("Settings");
  const locale = await getLocale();
  const userId = await getUserId();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId ?? "")
    .maybeSingle();

  return (
    <div className="grid max-w-xl gap-8">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <section aria-labelledby="name-title" className={sectionClass}>
        <div className="grid gap-1">
          <h2 id="name-title" className="text-lg font-semibold">
            {t("nameTitle")}
          </h2>
          <p className="text-muted">{t("nameLead")}</p>
        </div>
        <NameForm firstName={profile?.first_name ?? ""} lastName={profile?.last_name ?? ""} />
      </section>
      <section aria-labelledby="language-title" className={sectionClass}>
        <div className="grid gap-1">
          <h2 id="language-title" className="text-lg font-semibold">
            {t("languageTitle")}
          </h2>
          <p className="text-muted">{t("languageLead")}</p>
        </div>
        <LanguageForm current={locale} />
      </section>
    </div>
  );
}
