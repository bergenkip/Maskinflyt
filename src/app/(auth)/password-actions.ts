"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { setLinkSession } from "@/lib/supabase/link-session";
import { createClient } from "@/lib/supabase/server";
import { createLinkSender } from "@/lib/supabase/standalone";
import { EMAIL_PATTERN, MIN_PASSWORD_LENGTH, type AuthErrorKey } from "./validation";

export type ForgotPasswordState = {
  email?: string;
  fieldError?: AuthErrorKey;
  error?: AuthErrorKey;
  sent?: boolean;
};

// Sends a link for choosing a new password. The answer is the same whether or
// not an account exists, so the form cannot be used to find out who has one.
export async function requestPasswordReset(_prev: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return { email, fieldError: "emailInvalid" };
  if (!getSupabaseEnv()) return { email, error: "unknown" };

  const origin = (await headers()).get("origin");
  // The implicit flow puts the link's tokens in the URL fragment, so the link
  // works in any browser or on another device (PKCE would tie it to this one).
  const { error } = await createLinkSender().auth.resetPasswordForEmail(email, {
    // The link signs the person in for this one purpose and lands on the new-password form.
    redirectTo: origin ? `${origin}/auth/callback?next=/reset-password` : undefined,
  });
  // Too many e-mails is the one error worth showing; it does not reveal whether the account exists.
  if (error && (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit")) {
    return { email, error: "rateLimited" };
  }
  if (error && error.status !== undefined && error.status >= 500) return { email, error: "unknown" };
  return { email, sent: true };
}

// The e-mailed link's tokens, taken from the URL fragment, become this
// browser's session; the answer is the account's address, or null.
export async function startPasswordReset(accessToken: string, refreshToken: string): Promise<string | null> {
  return setLinkSession(accessToken, refreshToken);
}

export type ResetPasswordState = { fieldError?: AuthErrorKey; error?: AuthErrorKey };

// On the page the e-mailed link opens: the person is signed in by the link and sets a new password.
export async function updatePassword(_prev: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) return { fieldError: "passwordShort" };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "linkInvalid" };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "weak_password") return { fieldError: "weakPassword" };
    if (error.code === "same_password") return { fieldError: "samePassword" };
    return { error: "unknown" };
  }
  redirect("/app");
}
