"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "@/i18n/locale";
import { isOrgCountry, isValidOrgNumber, normalizeOrgNumber, type OrgCountry } from "@/lib/org-number";
import { cleanName, isInviteToken, isValidName } from "@/app/(auth)/validation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type OnboardingState = {
  values?: { name: string; orgNumber: string; country: OrgCountry };
  fieldErrors?: {
    name?: "nameRequired" | "nameTaken";
    orgNumber?: "orgNumberInvalid" | "orgNumberFormat" | "orgNumberTaken";
  };
  error?: "alreadyMember" | "unknown";
};

export async function createOrganization(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  const orgNumber = normalizeOrgNumber(String(formData.get("orgNumber") ?? ""));
  const countryInput = formData.get("country");
  const country: OrgCountry = isOrgCountry(countryInput) ? countryInput : "NO";
  const values = { name, orgNumber, country };
  // Only Norway has a check-digit rule; elsewhere we check letters and digits.
  const orgNumberInvalid = country === "NO" ? "orgNumberInvalid" : "orgNumberFormat";

  const fieldErrors: NonNullable<OnboardingState["fieldErrors"]> = {};
  if (name.length === 0 || name.length > 200) fieldErrors.name = "nameRequired";
  if (orgNumber && !isValidOrgNumber(orgNumber, country)) fieldErrors.orgNumber = orgNumberInvalid;
  if (Object.keys(fieldErrors).length > 0) return { values, fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", {
    org_name: name,
    org_number: orgNumber || null,
    org_country: country,
  });

  if (error) {
    if (error.hint === "already_member") return { values, error: "alreadyMember" };
    if (error.hint === "org_name_taken") return { values, fieldErrors: { name: "nameTaken" } };
    if (error.hint === "org_number_taken") return { values, fieldErrors: { orgNumber: "orgNumberTaken" } };
    if (error.hint === "invalid_org_number") return { values, fieldErrors: { orgNumber: orgNumberInvalid } };
    if (error.hint === "invalid_name") return { values, fieldErrors: { name: "nameRequired" } };
    return { values, error: "unknown" };
  }

  // The company's default language may now apply, so re-render the whole page including <html lang>.
  revalidatePath("/", "layout");
  redirect("/app");
}

export type LanguageState = { status?: "saved" | "error" };

export async function saveLanguage(_prev: LanguageState, formData: FormData): Promise<LanguageState> {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return { status: "error" };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { error } = await supabase.from("profiles").update({ locale }).eq("id", userId);
  if (error) return { status: "error" };

  // Keep this device in sync, so the sign-in page uses the same language later.
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
  return { status: "saved" };
}

export type AcceptState = { error?: "notFound" | "alreadyMember" | "unknown" };

export async function acceptInvitation(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const token = formData.get("token");
  if (!isInviteToken(token)) return { error: "notFound" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation", { token });
  if (error) {
    if (error.hint === "not_found") return { error: "notFound" };
    if (error.hint === "already_member") return { error: "alreadyMember" };
    return { error: "unknown" };
  }

  // The new company's default language may now apply, as after creating a company.
  revalidatePath("/", "layout");
  redirect("/app");
}

export type NameState = {
  values?: { firstName: string; lastName: string };
  fieldErrors?: { firstName?: "firstNameRequired"; lastName?: "lastNameRequired" };
  status?: "saved" | "error";
};

export async function saveName(_prev: NameState, formData: FormData): Promise<NameState> {
  const firstName = cleanName(formData.get("firstName"));
  const lastName = cleanName(formData.get("lastName"));
  const values = { firstName, lastName };
  const fieldErrors: NonNullable<NameState["fieldErrors"]> = {};
  if (!isValidName(firstName)) fieldErrors.firstName = "firstNameRequired";
  if (!isValidName(lastName)) fieldErrors.lastName = "lastNameRequired";
  if (Object.keys(fieldErrors).length > 0) return { values, fieldErrors };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { error } = await supabase.from("profiles").update({ first_name: firstName, last_name: lastName }).eq("id", userId);
  if (error) return { values, status: "error" };

  revalidatePath("/app", "layout");
  return { values, status: "saved" };
}
