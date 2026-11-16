import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { monthPeriod, parsePeriod } from "@/lib/invoice-export";
import { loadExport } from "@/lib/invoice-export-server";
import { getCurrentMembership } from "@/lib/membership";
import { canSeeInvoices } from "@/lib/roles";
import { InvoiceExportView } from "./export-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("InvoiceExport");
  return { title: `${t("title")} · MaskinGo` };
}

// Stage 12e: a period's invoices and credit notes for the accountant, as a CSV
// file and as the PDFs in one ZIP file. For those who invoice.
export default async function InvoiceExportPage({ searchParams }: PageProps<"/app/invoices/export">) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canSeeInvoices(membership)) redirect("/app");
  const { organization } = membership;

  const params = await searchParams;
  const asked = params.from !== undefined || params.to !== undefined;
  const parsed = asked ? parsePeriod(params.from, params.to) : { period: monthPeriod(organization.timeZone) };
  const period = "period" in parsed ? parsed.period : null;
  const shown = {
    from: typeof params.from === "string" ? params.from : (period?.from ?? ""),
    to: typeof params.to === "string" ? params.to : (period?.to ?? ""),
  };
  const result = period ? await loadExport(organization.id, period) : null;
  return (
    <InvoiceExportView
      organization={organization}
      shown={shown}
      error={"error" in parsed ? parsed.error : null}
      period={period}
      result={result}
    />
  );
}
