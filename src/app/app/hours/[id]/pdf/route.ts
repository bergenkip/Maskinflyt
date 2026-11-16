import { getSheetPdf } from "@/lib/hours-server";
import { getCurrentMembership } from "@/lib/membership";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The PDF of a confirmed hours sheet: for its employee, the owner, admins and
// the accountant (RLS decides). Opened in the browser.
export async function GET(_request: Request, { params }: RouteContext<"/app/hours/[id]/pdf">) {
  const { id } = await params;
  if (!(await getCurrentMembership()) || !uuid.test(id)) return new Response("Not found", { status: 404 });
  const result = await getSheetPdf(id);
  if (!result) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(result.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${result.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
