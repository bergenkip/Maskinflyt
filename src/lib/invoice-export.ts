// Stage 12e: the invoices and credit notes of a period, for the accountant.
// One CSV row per document and VAT rate (as accounting systems book them), in
// the Norwegian way: ";" between fields, a decimal comma, and a BOM so Excel
// reads æøå. Pure functions: the route handlers load the rows.

export type ExportDocument = {
  id: string;
  number: number;
  kind: "invoice" | "credit_note";
  issue_date: string;
  due_date: string;
  currency: string;
  buyer: { name: string; org_number: string | null };
  job: { number: number };
  net: number;
  vat: number;
  total: number;
  credits: string | null;
};
export type ExportLine = { invoice_id: string; vat_rate: number; amount: number };

export type ExportRow = {
  type: "Faktura" | "Kreditnota";
  number: number;
  date: string;
  dueDate: string;
  customer: string;
  customerOrgNumber: string;
  credits: number | null;
  job: number;
  vatRate: number;
  net: number;
  vat: number;
  total: number;
  currency: string;
};

// A period of at most a year, so one download stays a sensible size.
export const MAX_PERIOD_DAYS = 366;
// The PDFs of more documents than this are downloaded a shorter period at a time.
export const MAX_ZIP_DOCUMENTS = 300;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !isoDate.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export type Period = { from: string; to: string };
export type PeriodError = "invalid" | "order" | "tooLong";

// The current month (or, with back = 1, the one before) in the company's time zone.
export function monthPeriod(timeZone: string, back = 0, now = new Date()): Period {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  const first = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - back, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

// "from" and "to" from the address, both days included.
export function parsePeriod(from: unknown, to: unknown): { period: Period } | { error: PeriodError } {
  if (!validDate(from) || !validDate(to)) return { error: "invalid" };
  if (from > to) return { error: "order" };
  if (dayNumber(to) - dayNumber(from) + 1 > MAX_PERIOD_DAYS) return { error: "tooLong" };
  return { period: { from, to } };
}

// As PostgreSQL's round() of the issuing (public.issue_invoice): halves away
// from zero, so a credit note's negative VAT rounds as its invoice's did.
const roundOre = (value: number) => Math.sign(value) * Math.round(Math.abs(value)) || 0;

// The base and VAT of each rate, as the issuing counted them.
export function exportRows(documents: ExportDocument[], lines: ExportLine[], creditedNumbers: Map<string, number>): ExportRow[] {
  const linesOf = new Map<string, ExportLine[]>();
  for (const line of lines) linesOf.set(line.invoice_id, [...(linesOf.get(line.invoice_id) ?? []), line]);

  return [...documents]
    .sort((a, b) => a.number - b.number)
    .flatMap((document) => {
      const byRate = new Map<number, number>();
      for (const line of linesOf.get(document.id) ?? []) byRate.set(line.vat_rate, (byRate.get(line.vat_rate) ?? 0) + line.amount);
      const rates = byRate.size
        ? [...byRate.entries()].sort(([a], [b]) => b - a).map(([rate, base]) => ({ rate, base, vat: roundOre((base * rate) / 100) }))
        : [{ rate: 0, base: document.net, vat: document.vat }];
      return rates.map(({ rate, base, vat }) => ({
        type: document.kind === "credit_note" ? ("Kreditnota" as const) : ("Faktura" as const),
        number: document.number,
        date: document.issue_date,
        dueDate: document.due_date,
        customer: document.buyer.name,
        customerOrgNumber: document.buyer.org_number ?? "",
        credits: document.credits ? (creditedNumbers.get(document.credits) ?? null) : null,
        job: document.job.number,
        vatRate: rate,
        net: base,
        vat,
        total: base + vat,
        currency: document.currency,
      }));
    });
}

// Totals of the period, from the rows.
export function exportTotals(rows: ExportRow[]) {
  return rows.reduce((sum, row) => ({ net: sum.net + row.net, vat: sum.vat + row.vat, total: sum.total + row.total }), {
    net: 0,
    vat: 0,
    total: 0,
  });
}

// 123450 øre → "1234,50"; -123450 → "-1234,50". No thousands separator, so
// spreadsheets read it as a number.
export function csvAmount(ore: number) {
  const sign = ore < 0 ? "-" : "";
  const abs = Math.abs(ore);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

const csvDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

// Text as a CSV field: quoted when needed, and never read as a formula
// (a customer named "=HYPERLINK(...)" stays text in Excel).
export function csvText(value: string) {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const csvHeader = [
  "Type",
  "Nummer",
  "Dato",
  "Forfallsdato",
  "Kunde",
  "Kundens org.nr.",
  "Krediterer faktura",
  "Oppdrag",
  "MVA-sats",
  "Grunnlag",
  "MVA",
  "Sum inkl. MVA",
  "Valuta",
];

export function toCsv(rows: ExportRow[]) {
  const lines = rows.map((row) =>
    [
      row.type,
      String(row.number),
      csvDate(row.date),
      csvDate(row.dueDate),
      csvText(row.customer),
      row.customerOrgNumber,
      row.credits === null ? "" : String(row.credits),
      String(row.job),
      String(row.vatRate),
      csvAmount(row.net),
      csvAmount(row.vat),
      csvAmount(row.total),
      row.currency,
    ].join(";"),
  );
  return `﻿${[csvHeader.join(";"), ...lines].join("\r\n")}\r\n`;
}

// "MaskinGo-fakturaer-2026-11-01-2026-11-30.csv"
export const exportFileName = (period: Period, extension: "csv" | "zip") =>
  `MaskinGo-fakturaer-${period.from}-${period.to}.${extension}`;
