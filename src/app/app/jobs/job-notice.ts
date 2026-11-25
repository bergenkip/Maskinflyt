import "server-only";
import { normalizeEmail } from "@/lib/customers";
import { invoiceEmailLive, TEST_INBOX } from "@/lib/email/invoice-email";
import { plannedEmail, type NoticeKind } from "@/lib/email/planned-email";
import { emailConfigured, sendEmail } from "@/lib/email/resend";
import type { CustomerNotice } from "@/lib/job-notice";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type RequestRow = { name: string; email: string | null; locale: string; user_id: string | null };

export type NoticeResult = "sent" | "failed" | "none";

// E-mails the customer who requested the job its planned time, a new time or
// the cancellation (stages 16b and 16c), and remembers what they were told.
// Only ever called when a person in the office asks for it. RLS limits every
// read and write to the office of the job's own company.
export async function sendJobNotice(
  supabase: Supabase,
  job: { id: string; request_id: string; address: string; starts_at: string; ends_at: string },
  organization: { id: string; name: string; timeZone: string },
  kind: NoticeKind,
  previous: CustomerNotice | null,
): Promise<NoticeResult> {
  const [{ data: request }, { data: page }] = await Promise.all([
    supabase.from("job_requests").select("name, email, locale, user_id").eq("id", job.request_id).maybeSingle(),
    supabase.from("company_pages").select("email, phone").eq("organization_id", organization.id).maybeSingle(),
  ]);
  const found = request as RequestRow | null;
  const to = found?.email ? normalizeEmail(found.email) : null;
  if (!found || !to) return "none";
  const testMode = !invoiceEmailLive();
  // In test mode (local development and CI) only .test addresses, and only to the test inbox.
  if (!emailConfigured() || (testMode && !to.endsWith(".test"))) return "failed";
  const contact = page as { email: string | null; phone: string | null } | null;
  const made = plannedEmail(
    {
      kind,
      previous: kind === "changed" && previous ? { startsAt: previous.starts_at, endsAt: previous.ends_at } : null,
      company: organization.name,
      name: found.name,
      address: job.address,
      startsAt: job.starts_at,
      endsAt: job.ends_at,
      timeZone: organization.timeZone,
      companyEmail: contact?.email ?? null,
      companyPhone: contact?.phone ?? null,
      locale: found.locale,
      hasAccount: Boolean(found.user_id),
    },
    { to, testMode },
  );
  // One e-mail per piece of news: a second tap on the same news is not sent twice.
  const idempotencyKey = previous ? `job-notice-${job.id}-${Date.parse(previous.sent_at)}` : `job-planned-${job.id}`;
  const result = await sendEmail({ ...made, to: testMode ? TEST_INBOX : to, idempotencyKey });
  if (!result.ok) return "failed";

  const told = { starts_at: job.starts_at, ends_at: job.ends_at, cancelled: kind === "cancelled" };
  // The e-mail is gone either way; if remembering it fails, the page offers to send it again.
  if (previous) {
    await supabase
      .from("job_customer_notices")
      .update({ ...told, sent_at: new Date().toISOString() })
      .eq("job_id", job.id);
  } else {
    await supabase.from("job_customer_notices").insert({ ...told, job_id: job.id, organization_id: organization.id });
  }
  return "sent";
}
