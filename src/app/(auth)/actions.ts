"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  type AuthErrorKey,
  type AuthFormState,
  isInviteToken,
  safeNextPath,
  validateCredentials,
} from "./validation";

function mapAuthError(code: string | undefined): AuthErrorKey {
  switch (code) {
    case "invalid_credentials":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "user_already_exists":
    case "email_exists":
      return "userExists";
    case "weak_password":
      return "weakPassword";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "rateLimited";
    default:
      return "unknown";
  }
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { values, fieldErrors } = validateCredentials(formData, "signIn");
  if (fieldErrors) return { values: { email: values.email }, fieldErrors };
  if (!getSupabaseEnv()) return { values: { email: values.email }, error: "unknown" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(values);
  if (error) return { values: { email: values.email }, error: mapAuthError(error.code) };

  // For example back to an invitation link that sent the person here.
  redirect(safeNextPath(formData.get("next")));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { values, fieldErrors } = validateCredentials(formData, "signUp");
  const { email, password, firstName, lastName } = values;
  const shown = { email, firstName, lastName };
  if (fieldErrors) return { values: shown, fieldErrors };
  if (!getSupabaseEnv()) return { values: shown, error: "unknown" };

  // Signing up from a personal invitation link: the database joins the company
  // when the account is created (see the accept_invite_at_signup migration).
  const inviteInput = formData.get("invite");
  const invite = isInviteToken(inviteInput) ? inviteInput : undefined;

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Copied into the profile by a database trigger.
      data: { first_name: firstName, last_name: lastName, invite_token: invite },
      emailRedirectTo: origin ? `${origin}/auth/callback?next=/app` : undefined,
    },
  });
  if (error) return { values: shown, error: mapAuthError(error.code) };

  // With e-mail confirmation on, there is no session until the link is opened.
  if (!data.session) return { values: shown, checkEmail: true };

  // A new company's default language may apply.
  if (invite) revalidatePath("/", "layout");
  redirect("/app");
}
