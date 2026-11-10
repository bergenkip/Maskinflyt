"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MAX_INVOICE_REFERENCE_LENGTH } from "@/lib/invoice";
import { getCurrentMembership } from "@/lib/membership";
import { getInvoicePdf } from "@/lib/invoices-server";
import { createClient } from "@/lib/supabase/server";

// Marking a job's invoice draft as sent from the company's accounting system,
// and taking a mistaken mark back. The database checks who may, that the time
// is approved, and counts the totals it keeps.

export type MarkState = {
  reference?: string;
  error?: "referenceTooLong" | "notAllowed" | "timeRequired" | "already" | "unknown";
  savedAt?: number;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function done(job: string) {
  // The bell in the header counts on every page.
  revalidatePath("/app", "layout");
  revalidatePath(`/app/jobs/${job}`);
}

export async function markInvoiceSent(_prev: MarkState, formData: FormData): Promise<MarkState> {
  if (!(await getCurrentMembership())) redirect("/app/onboarding");
  const job = String(formData.get("job") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  if (!uuid.test(job)) return { reference, error: "unknown" };
  if (reference.length > MAX_INVOICE_REFERENCE_LENGTH) return { reference, error: "referenceTooLong" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_invoice_sent", { job, reference: reference || null });
  if (error) {
    if (error.code === "42501") return { reference, error: "notAllowed" };
    if (error.hint === "time_required" || error.code === "55000") return { reference, error: "timeRequired" };
    if (error.code === "55006") return { reference, error: "already" };
    return { reference, error: "unknown" };
  }
  done(job);
  return { savedAt: Date.now() };
}

export async function unmarkInvoiceSent(_prev: MarkState, formData: FormData): Promise<MarkState> {
  if (!(await getCurrentMembership())) redirect("/app/onboarding");
  const job = String(formData.get("job") ?? "");
  if (!uuid.test(job)) return { error: "unknown" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("job_invoices").delete().eq("job_id", job).select("id");
  if (error) return { error: error.code === "42501" ? "notAllowed" : "unknown" };
  // RLS hides the row from anyone who may not take the mark back.
  if (!data || data.length === 0) return { error: "notAllowed" };
  done(job);
  return { savedAt: Date.now() };
}

export type IssueState = {
  error?: "notAllowed" | "timeRequired" | "already" | "settingsRequired" | "buyerRequired" | "unknown";
  // Issued, but the PDF could not be stored yet: it is made again when opened.
  pdfFailed?: boolean;
  issuedAt?: number;
};

const issueErrors: Record<string, IssueState["error"]> = {
  not_allowed: "notAllowed",
  not_done: "timeRequired",
  time_required: "timeRequired",
  already: "already",
  settings_required: "settingsRequired",
  buyer_required: "buyerRequired",
};

// Issue the job's invoice: the database numbers it and keeps a copy; then
// its PDF is made from that copy and stored.
export async function issueInvoice(_prev: IssueState, formData: FormData): Promise<IssueState> {
  if (!(await getCurrentMembership())) redirect("/app/onboarding");
  const job = String(formData.get("job") ?? "");
  if (!uuid.test(job)) return { error: "unknown" };

  const supabase = await createClient();
  const { data: invoiceId, error } = await supabase.rpc("issue_invoice", { job });
  if (error) {
    const known = error.hint ? issueErrors[error.hint] : undefined;
    if (known) return { error: known };
    if (error.code === "42501") return { error: "notAllowed" };
    return { error: "unknown" };
  }

  let pdfFailed = false;
  try {
    if (!(await getInvoicePdf(invoiceId as string))) pdfFailed = true;
  } catch {
    pdfFailed = true;
  }
  done(job);
  return { issuedAt: Date.now(), pdfFailed };
}
