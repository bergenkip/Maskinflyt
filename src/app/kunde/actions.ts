"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateCustomerAccount, type CustomerAccountFieldError, type CustomerAccountValues } from "@/lib/customer-account";
import { createClient } from "@/lib/supabase/server";

export type AccountState = {
  values?: CustomerAccountValues;
  fieldErrors?: Partial<Record<keyof CustomerAccountValues, CustomerAccountFieldError>>;
  error?: "unknown";
  saved?: boolean;
  at?: number;
};

// The customer's details that fill in new requests (stage 16a). Also makes the
// account for someone signed in without one (for example a company member).
export async function saveCustomerAccount(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const { values, fieldErrors, fields } = validateCustomerAccount(formData);
  if (!fields) return { values, fieldErrors };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login?next=/kunde");
  const { error } = await supabase.rpc("save_customer_account", fields);
  if (error) {
    if (error.hint === "invalid_phone") return { values, fieldErrors: { phone: "phoneInvalid" } };
    if (error.hint === "invalid_place") return { values, fieldErrors: { place: "placeTooLong" } };
    return { values, error: "unknown" };
  }
  revalidatePath("/kunde");
  return { values, saved: true, at: Date.now() };
}
