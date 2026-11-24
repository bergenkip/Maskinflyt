"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeEmail } from "@/lib/customers";
import { answerEmail } from "@/lib/email/answer-email";
import { invoiceEmailLive, TEST_INBOX } from "@/lib/email/invoice-email";
import { emailConfigured, sendEmail } from "@/lib/email/resend";
import { getCurrentMembership } from "@/lib/membership";
import { canSeeJobs } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export type AnswerState = {
  error?: "answerTooLong" | "alreadyAnswered" | "unknown";
  email?: "sent" | "failed" | "none";
  at?: number;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ANSWER_LENGTH = 1000;

type Answered = {
  customer_id: string | null;
  email: string | null;
  locale: string;
  name: string;
  place: string;
  wanted_date: string | null;
  company: string;
  page_email: string | null;
  page_phone: string | null;
};

// The office accepts or declines a request, once. The customer is told by
// e-mail when they gave one. Accepting goes on to the job form, filled in
// from the request; the job is made only when a person saves it.
export async function answerJobRequest(_prev: AnswerState, formData: FormData): Promise<AnswerState> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeJobs(membership)) redirect("/app");

  const request = String(formData.get("request") ?? "");
  const accept = formData.get("decision") === "accept";
  const message = String(formData.get("message") ?? "").replace(/\r\n?/g, "\n").trim();
  if (!uuid.test(request)) return { error: "unknown" };
  if (message.length > MAX_ANSWER_LENGTH) return { error: "answerTooLong" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("answer_job_request", { request, accept, answer_text: message || null })
    .single();
  if (error || !data) {
    if (error?.hint === "mfa_required") redirect("/mfa");
    if (error?.hint === "already_answered") return { error: "alreadyAnswered" };
    if (error?.hint === "answer_too_long") return { error: "answerTooLong" };
    return { error: "unknown" };
  }
  const answered = data as Answered;

  let email: AnswerState["email"] = "none";
  const to = answered.email ? normalizeEmail(answered.email) : null;
  if (to) {
    email = "failed";
    const testMode = !invoiceEmailLive();
    // In test mode (local development and CI) only .test addresses, and only to the test inbox.
    if (emailConfigured() && (!testMode || to.endsWith(".test"))) {
      const made = answerEmail(
        {
          accepted: accept,
          company: answered.company,
          name: answered.name,
          place: answered.place,
          wantedDate: answered.wanted_date,
          message: message || null,
          companyEmail: answered.page_email,
          companyPhone: answered.page_phone,
          locale: answered.locale,
        },
        { to, testMode },
      );
      const result = await sendEmail({ ...made, to: testMode ? TEST_INBOX : to, idempotencyKey: `job-request-answer-${request}` });
      if (result.ok) email = "sent";
    }
  }

  revalidatePath("/app/jobs/requests");
  revalidatePath("/app");
  if (accept) {
    const params = new URLSearchParams({ request, email });
    redirect(`/app/jobs/new?${params}`);
  }
  return { email, at: Date.now() };
}
