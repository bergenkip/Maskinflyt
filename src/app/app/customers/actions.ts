"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateCustomer, type CustomerFieldError, type CustomerFormValues } from "@/lib/customers";
import { getCurrentMembership } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";
import { parseMoneyToOre } from "@/lib/vehicles";

// RLS decides who may add or change a customer (owners, admins, dispatchers)
// and a customer's prices (owners and admins, with the second step); these
// actions only check the form and translate errors.

export type CustomerFormState = {
  values?: CustomerFormValues;
  fieldErrors?: Partial<Record<keyof CustomerFormValues, CustomerFieldError | "orgNumberTaken">>;
  error?: "notAllowed" | "unknown";
  savedAt?: number;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapError(values: CustomerFormValues, error: { code?: string }): CustomerFormState {
  // The unique index on (organization_id, org_number).
  if (error.code === "23505") return { values, fieldErrors: { orgNumber: "orgNumberTaken" } };
  // Row-level security said no (wrong role, or another company's customer).
  if (error.code === "42501") return { values, error: "notAllowed" };
  return { values, error: "unknown" };
}

export async function addCustomer(_prev: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const { values, fieldErrors, fields } = validateCustomer(formData);
  if (!fields) return { values, fieldErrors };

  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ ...fields, organization_id: membership.organization.id })
    .select("id")
    .single();
  if (error) return mapError(values, error);

  revalidatePath("/app/customers", "layout");
  // On to the new customer's page, where prices can be set.
  redirect(`/app/customers/${data.id}?added=1`);
}

export async function updateCustomer(_prev: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const id = String(formData.get("id") ?? "");
  const { values, fieldErrors, fields } = validateCustomer(formData);
  if (!fields) return { values, fieldErrors };
  if (!uuid.test(id)) return { values, error: "unknown" };

  const supabase = await createClient();
  // RLS hides rows the person may not change, so no row back means not allowed.
  const { data, error } = await supabase.from("customers").update(fields).eq("id", id).select("id");
  if (error) return mapError(values, error);
  if (!data || data.length === 0) return { values, error: "notAllowed" };

  revalidatePath("/app/customers", "layout");
  return { values, savedAt: Date.now() };
}

export type CustomerStatusState = { error?: "notAllowed" | "unknown" };

export async function setCustomerActive(_prev: CustomerStatusState, formData: FormData): Promise<CustomerStatusState> {
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!uuid.test(id)) return { error: "unknown" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").update({ active }).eq("id", id).select("id");
  if (error) return { error: error.code === "42501" ? "notAllowed" : "unknown" };
  if (!data || data.length === 0) return { error: "notAllowed" };

  revalidatePath("/app/customers", "layout");
  return {};
}

export type CustomerRateState = {
  value?: string;
  error?: "rateInvalid" | "notAllowed" | "unknown";
  savedAt?: number;
};

// One machine's price for one customer. Empty removes the customer's own price,
// so the machine's usual rate applies again.
export async function setCustomerRate(_prev: CustomerRateState, formData: FormData): Promise<CustomerRateState> {
  const customerId = String(formData.get("customerId") ?? "");
  const vehicleId = String(formData.get("vehicleId") ?? "");
  const value = String(formData.get("rate") ?? "").trim();
  if (!uuid.test(customerId) || !uuid.test(vehicleId)) return { value, error: "unknown" };
  const rate = parseMoneyToOre(value);
  if (rate === undefined) return { value, error: "rateInvalid" };

  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");

  const supabase = await createClient();
  const match = { customer_id: customerId, vehicle_id: vehicleId };
  let error: { code?: string } | null = null;
  if (rate === null) {
    ({ error } = await supabase.from("customer_rates").delete().match(match));
  } else {
    // Change the price if there is one; otherwise add it.
    const updated = await supabase.from("customer_rates").update({ hourly_rate: rate }).match(match).select("id");
    error = updated.error;
    if (!error && (!updated.data || updated.data.length === 0)) {
      ({ error } = await supabase
        .from("customer_rates")
        .insert({ ...match, hourly_rate: rate, organization_id: membership.organization.id }));
    }
  }
  if (error) return { value, error: error.code === "42501" ? "notAllowed" : "unknown" };

  revalidatePath("/app/customers", "layout");
  return { value, savedAt: Date.now() };
}
