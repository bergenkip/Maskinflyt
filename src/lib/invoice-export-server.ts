import "server-only";
import { createClient } from "@/lib/supabase/server";
import { exportRows, type ExportDocument, type ExportLine, type Period } from "./invoice-export";

// The API returns at most 1000 rows at a time (supabase/config.toml max_rows).
const PAGE = 1000;

async function allPages<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) return null;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

// The company's invoices and credit notes issued in the period (both days
// included), with their CSV rows. RLS shows only the company's own, and only
// to those who invoice. Null when they could not be loaded.
export async function loadExport(organizationId: string, period: Period) {
  const supabase = await createClient();
  const [documents, lines] = await Promise.all([
    allPages<ExportDocument>((from, to) =>
      supabase
        .from("invoices")
        .select("id, number, kind, issue_date, due_date, currency, buyer, job, net, vat, total, credits")
        .eq("organization_id", organizationId)
        .gte("issue_date", period.from)
        .lte("issue_date", period.to)
        .order("number")
        .range(from, to),
    ),
    allPages<ExportLine>((from, to) =>
      supabase
        .from("invoice_lines")
        .select("invoice_id, vat_rate, amount, invoices!inner(issue_date)")
        .eq("organization_id", organizationId)
        .gte("invoices.issue_date", period.from)
        .lte("invoices.issue_date", period.to)
        .order("invoice_id")
        .order("position")
        .range(from, to),
    ),
  ]);
  if (!documents || !lines) return null;

  // A credit note may credit an invoice of an earlier period.
  const numbers = new Map(documents.map((document) => [document.id, document.number]));
  const earlier = [...new Set(documents.flatMap((d) => (d.credits && !numbers.has(d.credits) ? [d.credits] : [])))];
  for (let i = 0; i < earlier.length; i += 100) {
    const { data, error } = await supabase.from("invoices").select("id, number").in("id", earlier.slice(i, i + 100));
    if (error) return null;
    for (const row of data ?? []) numbers.set(row.id, row.number);
  }
  return { documents, numbers, rows: exportRows(documents, lines, numbers) };
}
