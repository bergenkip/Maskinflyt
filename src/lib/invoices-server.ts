import "server-only";
import { invoicePdf, type IssuedInvoice, type IssuedLine } from "@/lib/pdf/invoice-pdf";
import { createClient } from "@/lib/supabase/server";

export const INVOICES_BUCKET = "invoices";

export type IssuedInvoiceRow = IssuedInvoice & { id: string; organization_id: string; job_id: string; issued_at: string };
export const issuedInvoiceColumns =
  "id, organization_id, job_id, number, issue_date, due_date, currency, seller, buyer, job, net, vat, total, issued_at";

// <organization id>/<invoice id>.pdf: the only path the bucket's policies accept.
export const invoicePdfPath = (invoice: { id: string; organization_id: string }) => `${invoice.organization_id}/${invoice.id}.pdf`;

// The issued invoice of a job, as the person may read it (RLS decides).
export async function getJobInvoice(jobId: string): Promise<IssuedInvoiceRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("invoices").select(issuedInvoiceColumns).eq("job_id", jobId).maybeSingle();
  return (data as IssuedInvoiceRow | null) ?? null;
}

// The PDF of an issued invoice, made from its copy in the database. It is
// stored once: the bucket refuses to replace it, so a second call only reads it.
export async function getInvoicePdf(invoiceId: string): Promise<{ invoice: IssuedInvoiceRow; pdf: Uint8Array } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("invoices").select(issuedInvoiceColumns).eq("id", invoiceId).maybeSingle();
  const invoice = data as IssuedInvoiceRow | null;
  if (!invoice) return null;
  const path = invoicePdfPath(invoice);
  const bucket = supabase.storage.from(INVOICES_BUCKET);

  const stored = await bucket.download(path);
  if (stored.data) return { invoice, pdf: new Uint8Array(await stored.data.arrayBuffer()) };

  const { data: lines } = await supabase
    .from("invoice_lines")
    .select("position, description, quantity, unit, unit_price, vat_rate, amount")
    .eq("invoice_id", invoice.id)
    .order("position");
  const pdf = await invoicePdf(invoice, (lines ?? []) as IssuedLine[]);
  // Readers without the right to add it (or a parallel request that stored it first) still get the same PDF.
  await bucket.upload(path, pdf, { contentType: "application/pdf", upsert: false });
  return { invoice, pdf };
}
