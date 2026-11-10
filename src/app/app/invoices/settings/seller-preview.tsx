import { getTranslations } from "next-intl/server";
import { BuildingIcon } from "@/components/icons";
import { formatPhone } from "@/lib/customers";
import { formatBankAccount, type InvoiceSettings } from "@/lib/invoice-settings";
import { formatOrgNumber } from "@/lib/org-number";

// The seller part of every invoice, as the saved settings will print it.
export async function SellerPreview({
  name,
  orgNumber,
  country,
  settings,
}: {
  name: string;
  orgNumber: string;
  country: string;
  settings: InvoiceSettings;
}) {
  const t = await getTranslations("InvoiceSettings");
  // The company's own details are data and are shown exactly as entered.
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-border p-4">
      <BuildingIcon className="mt-0.5 size-5 shrink-0 text-muted" />
      <address className="grid min-w-0 gap-0.5 not-italic [overflow-wrap:anywhere]">
        <span className="font-semibold">{name}</span>
        <span>{settings.street}</span>
        <span>
          {settings.postal_code} {settings.city}
        </span>
        <span className="tabular-nums">
          {t("orgLine", { number: formatOrgNumber(orgNumber, country) })}
          {settings.vat_registered && ` ${t("vatSuffix")}`}
        </span>
        {settings.in_business_register && <span>{t("businessRegister")}</span>}
        <span className="tabular-nums">{t("accountLine", { account: formatBankAccount(settings.bank_account) })}</span>
        <span>{t("termsLine", { days: settings.payment_days })}</span>
        {settings.email && <span>{settings.email}</span>}
        {settings.phone && <span className="tabular-nums">{formatPhone(settings.phone)}</span>}
        <span className="mt-2 text-sm text-muted tabular-nums">{t("firstLine", { number: settings.first_number })}</span>
      </address>
    </div>
  );
}
