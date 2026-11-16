import { describe, expect, it } from "vitest";
import { invoiceTotals } from "./invoice";
import {
  csvAmount,
  csvText,
  exportFileName,
  exportRows,
  exportTotals,
  monthPeriod,
  parsePeriod,
  toCsv,
  type ExportDocument,
  type ExportLine,
} from "./invoice-export";

const lines: ExportLine[] = [
  { invoice_id: "a", vat_rate: 25, amount: 900000 },
  { invoice_id: "a", vat_rate: 25, amount: 37035 },
  { invoice_id: "a", vat_rate: 0, amount: 8000 },
  // The credit note: the same lines turned negative.
  { invoice_id: "b", vat_rate: 25, amount: -900000 },
  { invoice_id: "b", vat_rate: 25, amount: -37035 },
  { invoice_id: "b", vat_rate: 0, amount: -8000 },
];
const totals = invoiceTotals(lines.filter((line) => line.invoice_id === "a"));
const base = {
  issue_date: "2026-11-10",
  due_date: "2026-11-24",
  currency: "NOK",
  buyer: { name: "Nordbygg; Æøå \"Bygg\" AS", org_number: "987654325" },
  job: { number: 12 },
};
const documents: ExportDocument[] = [
  // Given out of order: the rows follow the numbers.
  { ...base, id: "b", number: 1002, kind: "credit_note", issue_date: "2026-11-12", due_date: "2026-11-12", credits: "a", net: -totals.net, vat: -totals.vatTotal, total: -totals.total },
  { ...base, id: "a", number: 1001, kind: "invoice", credits: null, net: totals.net, vat: totals.vatTotal, total: totals.total },
];

describe("invoice export", () => {
  const rows = exportRows(documents, lines, new Map([["a", 1001]]));

  it("makes one row per document and VAT rate, credit notes negative", () => {
    expect(rows.map((row) => [row.type, row.number, row.vatRate, row.net, row.vat, row.total, row.credits])).toEqual([
      ["Faktura", 1001, 25, 937035, 234259, 1171294, null],
      ["Faktura", 1001, 0, 8000, 0, 8000, null],
      ["Kreditnota", 1002, 25, -937035, -234259, -1171294, 1001],
      ["Kreditnota", 1002, 0, -8000, 0, -8000, 1001],
    ]);
    // 937035 × 25 % = 234258.75: the credit note rounds to the same øre, turned negative.
    expect(Object.is(rows[3].vat, -0)).toBe(false);
  });

  it("adds up to what each document says", () => {
    for (const document of documents) {
      const own = exportTotals(rows.filter((row) => row.number === document.number));
      expect(own).toEqual({ net: document.net, vat: document.vat, total: document.total });
    }
    expect(exportTotals(rows)).toEqual({ net: 0, vat: 0, total: 0 });
  });

  it("writes a CSV that Norwegian Excel opens", () => {
    const csv = toCsv(rows);
    expect(csv.startsWith("﻿Type;Nummer;Dato;Forfallsdato;Kunde;Kundens org.nr.;Krediterer faktura;Oppdrag;MVA-sats;Grunnlag;MVA;Sum inkl. MVA;Valuta\r\n")).toBe(true);
    const body = csv.slice(1).split("\r\n");
    expect(body[1]).toBe('Faktura;1001;10.11.2026;24.11.2026;"Nordbygg; Æøå ""Bygg"" AS";987654325;;12;25;9370,35;2342,59;11712,94;NOK');
    expect(body[3]).toBe('Kreditnota;1002;12.11.2026;12.11.2026;"Nordbygg; Æøå ""Bygg"" AS";987654325;1001;12;25;-9370,35;-2342,59;-11712,94;NOK');
    expect(body).toHaveLength(6);
    expect(body[5]).toBe("");
  });

  it("formats amounts and keeps text from being read as a formula", () => {
    expect(csvAmount(0)).toBe("0,00");
    expect(csvAmount(5)).toBe("0,05");
    expect(csvAmount(-123450)).toBe("-1234,50");
    expect(csvText("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvText("+47 bygg")).toBe("'+47 bygg");
    expect(csvText("@firma")).toBe("'@firma");
    expect(csvText("Vanlig AS")).toBe("Vanlig AS");
  });

  it("checks the period", () => {
    expect(parsePeriod("2026-11-01", "2026-11-30")).toEqual({ period: { from: "2026-11-01", to: "2026-11-30" } });
    expect(parsePeriod("2026-11-01", "2026-11-01")).toHaveProperty("period");
    expect(parsePeriod("2026-02-30", "2026-03-01")).toEqual({ error: "invalid" });
    expect(parsePeriod(null, "2026-03-01")).toEqual({ error: "invalid" });
    expect(parsePeriod("1.11.2026", "2026-11-30")).toEqual({ error: "invalid" });
    expect(parsePeriod("2026-11-30", "2026-11-01")).toEqual({ error: "order" });
    expect(parsePeriod("2024-01-01", "2024-12-31")).toHaveProperty("period"); // 366 days
    expect(parsePeriod("2025-01-01", "2026-01-02")).toEqual({ error: "tooLong" });
  });

  it("knows this month and the last one in the company's time zone", () => {
    // 23:30 in Oslo on 31 December is still December there.
    const now = new Date("2026-12-31T22:30:00Z");
    expect(monthPeriod("Europe/Oslo", 0, now)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(monthPeriod("Europe/Oslo", 1, now)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthPeriod("Europe/Oslo", 0, new Date("2027-03-15T10:00:00Z"))).toEqual({ from: "2027-03-01", to: "2027-03-31" });
    expect(monthPeriod("Europe/Oslo", 1, new Date("2027-03-15T10:00:00Z"))).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(exportFileName({ from: "2026-11-01", to: "2026-11-30" }, "zip")).toBe("MaskinGo-fakturaer-2026-11-01-2026-11-30.zip");
  });
});

describe("VAT rounding", () => {
  it("rounds halves away from zero, as the database does", () => {
    const doc = (id: string, kind: ExportDocument["kind"]): ExportDocument => ({
      ...base, id, number: id === "x" ? 1 : 2, kind, credits: kind === "credit_note" ? "x" : null, net: 0, vat: 0, total: 0,
    });
    // 10 øre at 25 % = 2.5 øre: 3 on the invoice, −3 on its credit note.
    const rows = exportRows([doc("x", "invoice"), doc("y", "credit_note")], [
      { invoice_id: "x", vat_rate: 25, amount: 10 },
      { invoice_id: "y", vat_rate: 25, amount: -10 },
    ], new Map());
    expect(rows.map((row) => row.vat)).toEqual([3, -3]);
  });
});
