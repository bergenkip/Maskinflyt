import { zipSync, type Zippable } from "fflate";
import { exportFileName, MAX_ZIP_DOCUMENTS } from "@/lib/invoice-export";
import { loadExport } from "@/lib/invoice-export-server";
import { getInvoicePdf, invoiceFileName } from "@/lib/invoices-server";
import { download, exportRequest } from "../request";

// Making the PDFs not yet stored can take a while.
export const maxDuration = 300;

// The PDFs of the period's invoices and credit notes in one ZIP file
// ("Faktura-1001.pdf", "Kreditnota-1002.pdf"), exactly as issued.
export async function GET(request: Request) {
  const asked = await exportRequest(request);
  if (asked instanceof Response) return asked;
  const result = await loadExport(asked.organizationId, asked.period);
  if (!result) return new Response("Could not load the invoices", { status: 500 });
  if (result.documents.length > MAX_ZIP_DOCUMENTS) return new Response("Choose a shorter period", { status: 413 });

  const files: Zippable = {};
  const queue = [...result.documents];
  // A few at a time: each one reads (or the first time makes and stores) its PDF.
  const worker = async () => {
    for (let document = queue.shift(); document; document = queue.shift()) {
      const pdf = await getInvoicePdf(document.id);
      if (!pdf) throw new Error(`PDF ${document.number} could not be loaded`);
      // PDFs are compressed already: stored as they are.
      files[invoiceFileName(document)] = [pdf.pdf, { level: 0 }];
    }
  };
  try {
    await Promise.all(Array.from({ length: 6 }, worker));
  } catch {
    return new Response("Could not load the invoices", { status: 500 });
  }
  return download(Buffer.from(zipSync(files)), "application/zip", exportFileName(asked.period, "zip"));
}
