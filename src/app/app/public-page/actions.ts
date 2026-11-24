"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pagePath, validateCompanyPage, type CompanyPageFieldError, type CompanyPageValues } from "@/lib/company-page";
import { getCurrentMembership } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";

// public.save_company_page decides who may save (owners and admins, with the
// second step) and checks every field again; this action checks the form first
// and translates the database's answers.

export type CompanyPageState = {
  values?: CompanyPageValues;
  fieldErrors?: Partial<Record<keyof CompanyPageValues, CompanyPageFieldError>>;
  error?: "notAllowed" | "readOnly" | "unknown";
  savedAt?: number;
};

const hintFields: Record<string, [keyof CompanyPageValues, CompanyPageFieldError]> = {
  invalid_slug: ["slug", "slugInvalid"],
  slug_taken: ["slug", "slugTaken"],
  invalid_description: ["description", "descriptionTooLong"],
  invalid_services: ["services", "servicesRequired"],
  invalid_city: ["city", "cityTooLong"],
  invalid_area: ["area", "areaTooLong"],
  invalid_phone: ["phone", "phoneInvalid"],
  invalid_email: ["email", "emailInvalid"],
  invalid_website: ["website", "websiteInvalid"],
  incomplete: ["description", "descriptionRequired"],
};

export async function saveCompanyPage(_prev: CompanyPageState, formData: FormData): Promise<CompanyPageState> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");

  const { values, fieldErrors, fields } = validateCompanyPage(formData);
  if (!fields) return { values, fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_company_page", { org: membership.organization.id, ...fields });
  if (error) {
    if (error.hint === "mfa_required") redirect("/mfa");
    const field = error.hint ? hintFields[error.hint] : undefined;
    if (field) return { values, fieldErrors: { [field[0]]: field[1] } };
    if (error.hint === "read_only") return { values, error: "readOnly" };
    if (error.code === "42501") return { values, error: "notAllowed" };
    return { values, error: "unknown" };
  }

  revalidatePath("/app/public-page");
  revalidatePath(pagePath(fields.page_slug));
  return { values, savedAt: Date.now() };
}
