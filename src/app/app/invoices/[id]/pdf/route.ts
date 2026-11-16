import { getInvoicePdf, invoiceFileName } from "@/lib/invoices-server";
import { getCurrentMembership } from "@/lib/membership";
import { canSeeInvoices } from "@/lib/roles";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The PDF of an issued invoice, for those who invoice (RLS and the bucket's
// policies decide again). Opened in the browser; saved as "Faktura-1001.pdf" or "Kreditnota-1002.pdf".
export async function GET(_request: Request, { params }: RouteContext<"/app/invoices/[id]/pdf">) {
  const { id } = await params;
  const membership = await getCurrentMembership();
  if (!membership || !canSeeInvoices(membership) || !uuid.test(id)) return new Response("Not found", { status: 404 });

  const result = await getInvoicePdf(id);
  if (!result) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(result.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoiceFileName(result.invoice)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
