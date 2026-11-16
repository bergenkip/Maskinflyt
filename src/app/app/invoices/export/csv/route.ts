import { exportFileName, toCsv } from "@/lib/invoice-export";
import { loadExport } from "@/lib/invoice-export-server";
import { download, exportRequest } from "../request";

// The period's invoices and credit notes as a CSV file for the accountant.
export async function GET(request: Request) {
  const asked = await exportRequest(request);
  if (asked instanceof Response) return asked;
  const result = await loadExport(asked.organizationId, asked.period);
  if (!result) return new Response("Could not load the invoices", { status: 500 });
  return download(toCsv(result.rows), "text/csv; charset=utf-8", exportFileName(asked.period, "csv"));
}
