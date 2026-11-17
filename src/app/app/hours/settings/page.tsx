import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRightIcon } from "@/components/icons";
import { decimalHours, ruleColumns, toHourRules, type HourRules } from "@/lib/hours";
import { canEditInvoiceSettings } from "@/lib/invoice-settings";
import { getCurrentMembership } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";
import { HourSettingsForm } from "../hours-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("HourSettings");
  return { title: `${t("title")} · MaskinGo` };
}

// The company's overtime rules and the accountant's e-mail. Owners and admins.
export default async function HourSettingsPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canEditInvoiceSettings(membership.role)) redirect("/app/hours");

  const supabase = await createClient();
  const [t, locale, { data }] = await Promise.all([
    getTranslations("HourSettings"),
    getLocale(),
    supabase
      .from("hour_settings")
      .select(`${ruleColumns}, accountant_email`)
      .eq("organization_id", membership.organization.id)
      .maybeSingle(),
  ]);
  const saved = data as (Partial<HourRules> & { accountant_email: string | null }) | null;
  const rules = toHourRules(saved);
  // "7.5" → "7,5" where the comma is the decimal sign.
  const decimal = (minutes: number) => String(decimalHours(minutes)).replace(".", locale === "en" ? "." : ",");

  return (
    <div className="grid max-w-2xl gap-8">
      <div className="grid gap-2">
        <Link
          href="/app/hours"
          className="-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-2 font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowRightIcon className="size-5 rotate-180" />
          {t("back")}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      <section aria-label={t("title")} className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <HourSettingsForm
          initial={{
            mode: rules.overtime_mode,
            after: decimal(rules.overtime_after),
            percent: String(rules.overtime_percent),
            after2: rules.overtime2_after === null ? "" : decimal(rules.overtime2_after),
            percent2: rules.overtime2_percent === null ? "" : String(rules.overtime2_percent),
            from: rules.overtime_from ?? "",
            to: rules.overtime_to ?? "",
            from2: rules.overtime2_from ?? "",
            to2: rules.overtime2_to ?? "",
            email: saved?.accountant_email ?? "",
          }}
        />
      </section>
    </div>
  );
}
