import "server-only";
import { parsePeriod, type Period } from "@/lib/invoice-export";
import { getCurrentMembership } from "@/lib/membership";
import { canSeeInvoices } from "@/lib/roles";

// Who asks, and for which period: those who invoice, and a valid period.
export async function exportRequest(request: Request): Promise<{ organizationId: string; period: Period } | Response> {
  const membership = await getCurrentMembership();
  if (!membership || !canSeeInvoices(membership)) return new Response("Not found", { status: 404 });
  const params = new URL(request.url).searchParams;
  const parsed = parsePeriod(params.get("from"), params.get("to"));
  if ("error" in parsed) return new Response("Invalid period", { status: 400 });
  return { organizationId: membership.organization.id, period: parsed.period };
}

export const download = (body: BodyInit, type: string, filename: string) =>
  new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
