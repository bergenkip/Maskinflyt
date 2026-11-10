import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatPhone } from "../customers";
import { formatBankAccount } from "../invoice-settings";
import { formatOrgNumber } from "../org-number";
import { invoiceTotals } from "../invoice";

// The PDF of an issued invoice, made only from the copy kept in the database
// (public.invoices and public.invoice_lines), so it can be made again and is
// always the same. The invoice is in Norwegian: it goes to Norwegian customers.
// Geist (SIL Open Font License, see fonts/OFL.txt) has æøå and ąčęėįšųūž, so
// names are printed exactly as entered.

export type IssuedInvoice = {
  number: number;
  issue_date: string;
  due_date: string;
  currency: string;
  seller: {
    name: string;
    org_number: string;
    country: string;
    street: string;
    postal_code: string;
    city: string;
    vat_registered: boolean;
    in_business_register: boolean;
    bank_account: string;
    email: string | null;
    phone: string | null;
  };
  buyer: {
    name: string;
    org_number: string | null;
    street: string | null;
    postal_code: string | null;
    city: string | null;
    email: string | null;
  };
  job: { number: number; address: string; ends_at: string; vehicle: string | null; timezone: string };
  net: number;
  vat: number;
  total: number;
};

export type IssuedLine = {
  position: number;
  description: string;
  quantity: number | string;
  unit: string | null;
  unit_price: number;
  vat_rate: number;
  amount: number;
};

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const ink = rgb(0.1, 0.12, 0.16);
const muted = rgb(0.42, 0.45, 0.5);
const rule = rgb(0.85, 0.87, 0.9);

// Intl's narrow no-break space is not in the font; the plain no-break space is.
const clean = (text: string) => text.replace(/[  ]/g, " ");

const amount = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatAmount = (ore: number) => clean(amount.format(ore / 100));
const quantityFormat = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 });
// "2026-11-02" → "02.11.2026", as Norwegian invoices write dates.
export const formatDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

let fonts: Promise<[Uint8Array, Uint8Array]> | undefined;
function loadFonts() {
  const dir = path.join(process.cwd(), "src/lib/pdf/fonts");
  fonts ??= Promise.all([readFile(path.join(dir, "Geist-Regular.ttf")), readFile(path.join(dir, "Geist-SemiBold.ttf"))]);
  return fonts;
}

// Splits text into lines no wider than the width (long words are broken too).
export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        if (line) lines.push(line);
        lines.push(rest.slice(0, cut));
        line = "";
        rest = rest.slice(cut);
      }
      const next = line ? `${line} ${rest}` : rest;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        lines.push(line);
        line = rest;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function invoicePdf(invoice: IssuedInvoice, lines: IssuedLine[]): Promise<Uint8Array> {
  const [regularBytes, boldBytes] = await loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  doc.setTitle(`Faktura ${invoice.number}`);
  doc.setAuthor(invoice.seller.name);
  doc.setCreator("MaskinGo");
  doc.setProducer("MaskinGo");
  doc.setLanguage("nb-NO");

  const { seller, buyer } = invoice;
  const orgLine = `Org.nr. ${formatOrgNumber(seller.org_number, seller.country)}${seller.vat_registered ? " MVA" : ""}`;
  const right = A4[0] - MARGIN;
  const width = right - MARGIN;
  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - MARGIN;

  const text = (value: string, x: number, at: number, opts: { font?: PDFFont; size?: number; color?: typeof ink } = {}) =>
    page.drawText(clean(value), { x, y: at, font: opts.font ?? regular, size: opts.size ?? 10, color: opts.color ?? ink });
  const textRight = (value: string, x: number, at: number, opts: { font?: PDFFont; size?: number; color?: typeof ink } = {}) => {
    const v = clean(value);
    text(v, x - (opts.font ?? regular).widthOfTextAtSize(v, opts.size ?? 10), at, opts);
  };
  const line = (at: number) => page.drawLine({ start: { x: MARGIN, y: at }, end: { x: right, y: at }, thickness: 0.75, color: rule });

  // The seller, left; "Faktura" and its numbers, right.
  for (const [i, part] of wrap(seller.name, bold, 14, width / 2).entries()) text(part, MARGIN, y - i * 17, { font: bold, size: 14 });
  textRight("Faktura", right, y - 4, { font: bold, size: 22 });
  let sy = y - 17 * wrap(seller.name, bold, 14, width / 2).length - 2;
  for (const part of [seller.street, `${seller.postal_code} ${seller.city}`, orgLine, ...(seller.in_business_register ? ["Foretaksregisteret"] : [])]) {
    text(part, MARGIN, sy, { color: muted });
    sy -= 13;
  }

  const facts: [string, string][] = [
    ["Fakturanummer", String(invoice.number)],
    ["Fakturadato", formatDate(invoice.issue_date)],
    ["Forfallsdato", formatDate(invoice.due_date)],
    ["Oppdrag", String(invoice.job.number)],
  ];
  let fy = y - 40;
  for (const [label, value] of facts) {
    text(label, right - 190, fy, { color: muted });
    textRight(value, right, fy, { font: bold });
    fy -= 15;
  }
  y = Math.min(sy, fy) - 18;

  // The buyer.
  text("Faktureres til", MARGIN, y, { color: muted, size: 9 });
  y -= 15;
  for (const part of wrap(buyer.name, bold, 11, width / 2)) {
    text(part, MARGIN, y, { font: bold, size: 11 });
    y -= 14;
  }
  const buyerLines = [
    buyer.org_number ? `Org.nr. ${formatOrgNumber(buyer.org_number)}` : null,
    buyer.street,
    buyer.postal_code || buyer.city ? [buyer.postal_code, buyer.city].filter(Boolean).join(" ") : null,
  ].filter((part): part is string => Boolean(part));
  for (const part of buyerLines) {
    for (const piece of wrap(part, regular, 10, width / 2)) {
      text(piece, MARGIN, y);
      y -= 13;
    }
  }

  // The job.
  y -= 10;
  const day = new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: invoice.job.timezone }).format(
    new Date(invoice.job.ends_at),
  );
  for (const part of wrap(`Oppdrag ${invoice.job.number}, ${day}: ${invoice.job.address}`, regular, 10, width)) {
    text(part, MARGIN, y, { color: muted });
    y -= 13;
  }
  y -= 12;

  // The lines.
  const cols = { quantity: right - 250, price: right - 165, vat: right - 95, amount: right };
  const descWidth = cols.quantity - 55 - MARGIN;
  const header = () => {
    text("Beskrivelse", MARGIN, y, { font: bold, size: 9 });
    textRight("Antall", cols.quantity, y, { font: bold, size: 9 });
    textRight("Pris", cols.price, y, { font: bold, size: 9 });
    textRight("MVA", cols.vat, y, { font: bold, size: 9 });
    textRight("Beløp", cols.amount, y, { font: bold, size: 9 });
    y -= 7;
    line(y);
    y -= 15;
  };
  header();
  for (const item of lines) {
    const parts = wrap(item.description, regular, 10, descWidth);
    const height = parts.length * 13 + 8;
    if (y - height < MARGIN + 40) {
      page = doc.addPage(A4);
      y = A4[1] - MARGIN;
      text(`Faktura ${invoice.number} (fortsatt)`, MARGIN, y, { color: muted, size: 9 });
      y -= 24;
      header();
    }
    parts.forEach((part, i) => text(part, MARGIN, y - i * 13));
    const quantity = clean(quantityFormat.format(Number(item.quantity)));
    textRight(item.unit ? `${quantity} ${item.unit}` : quantity, cols.quantity, y);
    textRight(formatAmount(item.unit_price), cols.price, y);
    textRight(`${item.vat_rate} %`, cols.vat, y);
    textRight(formatAmount(item.amount), cols.amount, y);
    y -= height;
  }
  line(y + 4);
  y -= 14;

  // The totals, from the copy; VAT per rate as on the job page.
  const totals = invoiceTotals(lines.map((l) => ({ amount: l.amount, vat_rate: l.vat_rate })));
  const totalRows: [string, string][] = [["Sum eks. MVA", formatAmount(invoice.net)]];
  if (seller.vat_registered) {
    for (const row of totals.vat) totalRows.push([`MVA ${row.rate} % av ${formatAmount(row.base)}`, formatAmount(row.vat)]);
  }
  if (y < MARGIN + 160) {
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
  }
  for (const [label, value] of totalRows) {
    textRight(label, cols.price, y, { color: muted });
    textRight(value, right, y);
    y -= 15;
  }
  page.drawLine({ start: { x: cols.quantity - 60, y: y + 6 }, end: { x: right, y: y + 6 }, thickness: 0.75, color: rule });
  y -= 8;
  textRight(`Å betale (${invoice.currency})`, cols.price, y, { font: bold, size: 12 });
  textRight(formatAmount(invoice.total), right, y, { font: bold, size: 12 });
  y -= 36;

  // How to pay.
  const boxHeight = 52;
  page.drawRectangle({ x: MARGIN, y: y - boxHeight + 18, width, height: boxHeight, borderColor: rule, borderWidth: 0.75 });
  const pay: [string, string][] = [
    ["Kontonummer", formatBankAccount(seller.bank_account)],
    ["Forfallsdato", formatDate(invoice.due_date)],
    ["Merk betalingen med", `Faktura ${invoice.number}`],
  ];
  pay.forEach(([label, value], i) => {
    const x = MARGIN + 14 + i * ((width - 28) / 3);
    text(label, x, y, { color: muted, size: 9 });
    text(value, x, y - 18, { font: bold, size: 12 });
  });

  // The seller's contact, at the foot of every page.
  const contact = [seller.name, orgLine, seller.email, seller.phone && formatPhone(seller.phone)].filter(Boolean).join("  ·  ");
  for (const [i, p] of doc.getPages().entries()) {
    page = p;
    const foot = wrap(contact, regular, 8, width);
    foot.forEach((part, j) => text(part, MARGIN, MARGIN - 18 - j * 10, { color: muted, size: 8 }));
    textRight(`Side ${i + 1} av ${doc.getPageCount()}`, right, MARGIN - 18, { color: muted, size: 8 });
  }

  return doc.save();
}
