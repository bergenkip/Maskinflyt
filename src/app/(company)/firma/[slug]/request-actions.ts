"use server";

import { getLocale } from "next-intl/server";
import { normalizeEmail } from "@/lib/customers";
import { invoiceEmailLive, TEST_INBOX } from "@/lib/email/invoice-email";
import { emailConfigured, sendEmail } from "@/lib/email/resend";
import { requestEmail } from "@/lib/email/request-email";
import { toLocalParts } from "@/lib/jobs";
import { validateJobRequest, type JobRequestFieldError, type JobRequestValues } from "@/lib/job-requests";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type RequestState = {
  values?: JobRequestValues;
  fieldErrors?: Partial<Record<keyof JobRequestValues, JobRequestFieldError>>;
  error?: "closed" | "tooMany" | "unknown";
  sent?: boolean;
};

// The companies are Norwegian: a day is a day in Norway.
const TIME_ZONE = "Europe/Oslo";

// A visitor sends a request to the company behind a published page. The
// database checks the page, the fields and the limits again, and decides.
export async function submitJobRequest(_prev: RequestState, formData: FormData): Promise<RequestState> {
  // A field people never see: a form robot fills it in. It gets the same answer
  // as a person, so it does not learn to leave it empty; nothing is saved.
  if (String(formData.get("company_website") ?? "") !== "") return { sent: true };

  const slug = String(formData.get("slug") ?? "");
  const today = toLocalParts(new Date(), TIME_ZONE).date;
  const { values, fieldErrors, fields } = validateJobRequest(formData, today);
  if (!fields) return { values, fieldErrors };
  if (!getSupabaseEnv() || !/^[a-z0-9-]{3,60}$/.test(slug)) return { values, error: "closed" };

  const supabase = await createClient();
  const locale = await getLocale();
  const { data, error } = await supabase
    .rpc("submit_job_request", { page_slug: slug, ...fields, request_locale: locale })
    .single();
  if (error || !data) {
    if (error?.hint === "not_found") return { values, error: "closed" };
    if (error?.hint === "too_many") return { values, error: "tooMany" };
    if (error?.hint === "invalid_date") return { values, fieldErrors: { wantedDate: "dateInvalid" } };
    return { values, error: "unknown" };
  }

  // Tell the company. The request is saved either way; the office also sees it in the app.
  const { company, notify_email } = data as { id: string; company: string; notify_email: string | null };
  const to = notify_email ? normalizeEmail(notify_email) : null;
  const testMode = !invoiceEmailLive();
  // In test mode (local development and CI) only .test addresses, and only to the test inbox.
  if (to && emailConfigured() && (!testMode || to.endsWith(".test"))) {
    const email = requestEmail(
      {
        company,
        name: fields.request_name,
        phone: fields.request_phone,
        email: fields.request_email,
        place: fields.request_place,
        wantedDate: fields.request_wanted_date,
        service: fields.request_service,
        description: fields.request_description,
      },
      { to, testMode },
    );
    await sendEmail({ ...email, to: testMode ? TEST_INBOX : to, idempotencyKey: `job-request-${(data as { id: string }).id}` });
  }
  return { sent: true };
}
