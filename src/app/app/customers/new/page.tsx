import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentMembership } from "@/lib/membership";
import { canSeeCustomers } from "@/lib/roles";
import { BackLink } from "../back-link";
import { CustomerForm } from "../customer-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Customers");
  return { title: `${t("addTitle")} · Maskinflyt` };
}

export default async function NewCustomerPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeCustomers(membership.role)) redirect("/app");
  const t = await getTranslations("Customers");

  return (
    <div className="grid max-w-3xl gap-8">
      <div className="grid gap-2">
        <BackLink label={t("back")} />
        <h1 className="text-3xl font-semibold tracking-tight">{t("addTitle")}</h1>
        <p className="text-muted">{t("addLead")}</p>
      </div>
      <section aria-label={t("addTitle")} className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <CustomerForm />
      </section>
    </div>
  );
}
