import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRightIcon } from "@/components/icons";
import { formatPhone } from "@/lib/customers";
import {
  canEditInvoiceSettings,
  formatBankAccount,
  invoiceSettingsColumns,
  type InvoiceSettings,
  type InvoiceSettingsValues,
} from "@/lib/invoice-settings";
import { getCurrentMembership } from "@/lib/membership";
import { formatOrgNumber } from "@/lib/org-number";
import { canSeeInvoices } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { SellerPreview } from "./seller-preview";
import { InvoiceSettingsForm } from "./settings-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("InvoiceSettings");
  return { title: `${t("title")} · MaskinGo` };
}

const sectionClass = "grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6";

// What the company's own invoices say about the company (stage 12a). Those
// who invoice read it; owners and admins change it.
export default async function InvoiceSettingsPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeInvoices(membership)) redirect("/app");
  const { organization } = membership;

  const t = await getTranslations("InvoiceSettings");
  const supabase = await createClient();
  const [{ data: company }, { data }] = await Promise.all([
    supabase.from("organizations").select("country").eq("id", organization.id).maybeSingle(),
    supabase.from("invoice_settings").select(invoiceSettingsColumns).eq("organization_id", organization.id).maybeSingle(),
  ]);
  const settings = data as InvoiceSettings | null;
  const country = company?.country ?? "NO";
  const editable = canEditInvoiceSettings(membership.role);

  const initial: InvoiceSettingsValues = {
    orgNumber: organization.orgNumber ? formatOrgNumber(organization.orgNumber, country) : "",
    street: settings?.street ?? "",
    postalCode: settings?.postal_code ?? "",
    city: settings?.city ?? "",
    vatRegistered: settings?.vat_registered ?? true,
    inBusinessRegister: settings?.in_business_register ?? true,
    bankAccount: settings ? formatBankAccount(settings.bank_account) : "",
    paymentDays: String(settings?.payment_days ?? 14),
    email: settings?.email ?? "",
    phone: settings?.phone ? formatPhone(settings.phone) : "",
    firstNumber: String(settings?.first_number ?? 1),
  };

  return (
    <div className="grid max-w-2xl gap-8">
      <div className="grid gap-2">
        <Link
          href="/app/invoices"
          className="-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-2 font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowRightIcon className="size-5 rotate-180" />
          {t("back")}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
        <p className="text-sm text-muted">{t("notYet")}</p>
      </div>

      {settings && organization.orgNumber ? (
        <section aria-labelledby="preview-title" className={sectionClass}>
          <div className="grid gap-1">
            <h2 id="preview-title" className="text-lg font-semibold">
              {t("previewTitle")}
            </h2>
            <p className="text-muted">{t("previewLead")}</p>
          </div>
          <SellerPreview name={organization.name} orgNumber={organization.orgNumber} country={country} settings={settings} />
        </section>
      ) : (
        !editable && <p className="rounded-xl border border-dashed border-border p-4 text-muted">{t("missing")}</p>
      )}

      {editable ? (
        <section aria-labelledby="settings-title" className={sectionClass}>
          <h2 id="settings-title" className="text-lg font-semibold">
            {t("title")}
          </h2>
          <InvoiceSettingsForm initial={initial} />
        </section>
      ) : (
        <p className="text-sm text-muted">{t("readOnly")}</p>
      )}
    </div>
  );
}
