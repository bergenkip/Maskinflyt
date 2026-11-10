import { writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { formatAmount, formatDate, invoicePdf, wrap } = await import("./invoice-pdf");

const invoice = {
  number: 1001,
  issue_date: "2026-11-10",
  due_date: "2026-11-24",
  currency: "NOK",
  seller: {
    name: "Fjellkran og Transportservice Vestlandet AS",
    org_number: "123456785",
    country: "NO",
    street: "Kranveien 5",
    postal_code: "0581",
    city: "Oslo",
    vat_registered: true,
    in_business_register: true,
    bank_account: "12345678903",
    email: "faktura@fjellkran.test",
    phone: "+4791234567",
  },
  buyer: { name: "Žalgirio statyba UAB / Æøå Bygg", org_number: "987654325", street: "Storgata 1", postal_code: "0155", city: "Oslo", email: null },
  job: { number: 12, address: "Storgata 1, 0155 Oslo", ends_at: "2026-11-02T16:00:00Z", vehicle: "Kranbil 1", timezone: "Europe/Oslo" },
  net: 1305035,
  vat: 324259,
  total: 1629294,
};
const lines = [
  { position: 1, description: "Arbeidstid, Kranbil 1", quantity: "7.50", unit: "timer", unit_price: 120000, vat_rate: 25, amount: 900000 },
  { position: 2, description: "Arbeidstid med høyere sats, Kranbil 1", quantity: "2.00", unit: "timer", unit_price: 180000, vat_rate: 25, amount: 360000 },
  { position: 3, description: "Ferje", quantity: "3.00", unit: null, unit_price: 12345, vat_rate: 25, amount: 37035 },
  { position: 4, description: "Bompenger", quantity: "1.00", unit: null, unit_price: 8000, vat_rate: 0, amount: 8000 },
];

describe("invoice PDF", () => {
  it("formats amounts and dates as Norwegian invoices do", () => {
    expect(formatAmount(1629294)).toBe("16 292,94");
    expect(formatDate("2026-11-24")).toBe("24.11.2026");
  });

  it("wraps long text, breaking words that are too long", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const parts = wrap(`Kort ${"x".repeat(80)} slutt`, font, 10, 100);
    expect(parts.length).toBeGreaterThan(2);
    for (const part of parts) expect(font.widthOfTextAtSize(part, 10)).toBeLessThanOrEqual(100);
  });

  it("makes a one-page A4 invoice with the Norwegian and Lithuanian letters", async () => {
    const bytes = await invoicePdf(invoice, lines);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Faktura 1001");
    expect(doc.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
    if (process.env.PDF_OUT) await writeFile(`${process.env.PDF_OUT}/invoice.pdf`, bytes);
  });

  it("continues on more pages when there are many lines", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ ...lines[2], position: i + 1, description: `Ferje ${i + 1}, Bergen–Stavanger med lang tekst som må brytes over flere linjer` }));
    const bytes = await invoicePdf(invoice, many);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
    if (process.env.PDF_OUT) await writeFile(`${process.env.PDF_OUT}/invoice-long.pdf`, bytes);
  });
});
