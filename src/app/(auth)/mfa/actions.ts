"use server";

import { headers } from "next/headers";
import { getUserEmail, hasSecondStep } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";
import { createLinkSender } from "@/lib/supabase/standalone";

export type SendState = { sent?: boolean; error?: "rateLimited" | "unknown" };

// Records a sign-in waiting for approval and e-mails a one-time link to the
// signed-in person's own address. Sent only when they press the button, never
// on page load, so reloading does not use up the e-mail limit.
export async function sendMfaLink(): Promise<SendState> {
  const email = await getUserEmail();
  if (!email) return { error: "unknown" };

  const requestHeaders = await headers();
  const supabase = await createClient();
  const { data: requestId, error: requestError } = await supabase.rpc("request_second_step", {
    user_agent: requestHeaders.get("user-agent") ?? "",
  });
  if (requestError || typeof requestId !== "string") return { error: "unknown" };

  const origin = requestHeaders.get("origin");
  const { error } = await createLinkSender().auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: origin ? `${origin}/auth/callback?approve=${requestId}` : undefined,
    },
  });
  if (error) return { error: error.status === 429 || error.code === "over_email_send_rate_limit" ? "rateLimited" : "unknown" };
  return { sent: true };
}

// Asked every few seconds by the waiting page.
export async function checkSecondStep(): Promise<boolean> {
  return hasSecondStep();
}
