"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  validateInvoiceSettings,
  type InvoiceSettingsFieldError,
  type InvoiceSettingsValues,
} from "@/lib/invoice-settings";
import { getCurrentMembership } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";

// public.save_invoice_settings decides who may save (owners and admins, with
// the second step) and checks every field again; this action checks the form
// first and translates the database's answers.

export type InvoiceSettingsState = {
  values?: InvoiceSettingsValues;
  fieldErrors?: Partial<Record<keyof InvoiceSettingsValues, InvoiceSettingsFieldError>>;
  error?: "notAllowed" | "unknown";
  savedAt?: number;
};

const hintFields: Record<string, [keyof InvoiceSettingsValues, InvoiceSettingsFieldError]> = {
  invalid_org_number: ["orgNumber", "orgNumberInvalid"],
  org_number_taken: ["orgNumber", "orgNumberTaken"],
  invalid_street: ["street", "streetInvalid"],
  invalid_postal_code: ["postalCode", "postalCodeInvalid"],
  invalid_city: ["city", "cityInvalid"],
  invalid_bank_account: ["bankAccount", "bankAccountInvalid"],
  invalid_payment_days: ["paymentDays", "paymentDaysInvalid"],
  invalid_email: ["email", "emailInvalid"],
  invalid_phone: ["phone", "phoneInvalid"],
  invalid_first_number: ["firstNumber", "firstNumberInvalid"],
  first_number_locked: ["firstNumber", "firstNumberLocked"],
};

export async function saveInvoiceSettings(_prev: InvoiceSettingsState, formData: FormData): Promise<InvoiceSettingsState> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("organizations")
    .select("country")
    .eq("id", membership.organization.id)
    .maybeSingle();
  const { values, fieldErrors, fields } = validateInvoiceSettings(formData, company?.country ?? "NO");
  if (!fields) return { values, fieldErrors };

  const { error } = await supabase.rpc("save_invoice_settings", {
    org: membership.organization.id,
    org_number: fields.org_number,
    street: fields.street,
    postal_code: fields.postal_code,
    city: fields.city,
    vat_registered: fields.vat_registered,
    in_business_register: fields.in_business_register,
    bank_account: fields.bank_account,
    payment_days: fields.payment_days,
    email: fields.email,
    phone: fields.phone,
    first_number: fields.first_number,
  });
  if (error) {
    const field = error.hint ? hintFields[error.hint] : undefined;
    if (field) return { values, fieldErrors: { [field[0]]: field[1] } };
    if (error.code === "42501") return { values, error: "notAllowed" };
    return { values, error: "unknown" };
  }

  revalidatePath("/app", "layout");
  return { values, savedAt: Date.now() };
}
