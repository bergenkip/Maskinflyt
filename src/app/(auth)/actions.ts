"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { setLinkSession } from "@/lib/supabase/link-session";
import { createClient } from "@/lib/supabase/server";
import { createLinkSender } from "@/lib/supabase/standalone";
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
  // The implicit flow puts the confirmation link's tokens in the URL fragment,
  // so the link works in any browser or on another device (PKCE would tie it
  // to this one, and the mail app often opens links somewhere else).
  const { data, error } = await createLinkSender().auth.signUp({
    email,
    password,
    options: {
      // Copied into the profile by a database trigger.
      data: { first_name: firstName, last_name: lastName, invite_token: invite },
      emailRedirectTo: origin ? `${origin}/confirm` : undefined,
    },
  });
  if (error) return { values: shown, error: mapAuthError(error.code) };

  // With e-mail confirmation on, there is no session until the link is opened.
  // The invitation was used up when the account was created, so its page would
  // now say the link is not valid: show the "check your e-mail" page instead.
  if (!data.session) {
    if (invite) redirect("/join/sent");
    return { values: shown, checkEmail: true };
  }

  // Without e-mail confirmation the account is signed in at once: keep that session in this browser's cookies.
  if (!(await setLinkSession(data.session.access_token, data.session.refresh_token))) {
    return { values: shown, error: "unknown" };
  }

  // A new company's default language may apply.
  if (invite) revalidatePath("/", "layout");
  redirect("/app");
}

// On /confirm: the confirmation link's tokens, taken from the URL fragment,
// sign the new account in here. True when they were valid.
export async function confirmSignUp(accessToken: string, refreshToken: string): Promise<boolean> {
  if (!getSupabaseEnv()) return false;
  if (!(await setLinkSession(accessToken, refreshToken))) return false;
  // A new company's default language may apply.
  revalidatePath("/", "layout");
  return true;
}
