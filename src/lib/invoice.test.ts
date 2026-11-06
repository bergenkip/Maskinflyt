import { describe, expect, it } from "vitest";
import { invoiceTotals, lineAmount, toDecimalText, toLineFormValues, validateLine } from "./invoice";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const valid = { description: "Ferje Bergen–Stord", quantity: "2,5", unit: "stk", unitPrice: "1 234,50", vatRate: "25" };

describe("validateLine", () => {
  it("accepts a line typed the Norwegian way", () => {
    expect(validateLine(form(valid)).fields).toEqual({
      description: "Ferje Bergen–Stord",
      quantity: "2.50",
      unit: "stk",
      unit_price: 123450,
      vat_rate: 25,
    });
  });
  it("accepts a point, no unit and no VAT", () => {
    expect(validateLine(form({ ...valid, quantity: "0.75", unit: "", unitPrice: "80", vatRate: "0" })).fields).toMatchObject({
      quantity: "0.75",
      unit: null,
      unit_price: 8000,
      vat_rate: 0,
    });
  });
  it("explains each wrong field", () => {
    const { fieldErrors, fields } = validateLine(
      form({ description: " ", quantity: "0", unit: "x".repeat(21), unitPrice: "12,345", vatRate: "20" }),
    );
    expect(fields).toBeUndefined();
    expect(fieldErrors).toEqual({
      description: "descriptionRequired",
      quantity: "quantityInvalid",
      unit: "unitTooLong",
      unitPrice: "priceInvalid",
      vatRate: "vatInvalid",
    });
  });
  it("refuses a line over 1 000 000 kr", () => {
    expect(validateLine(form({ ...valid, quantity: "100", unitPrice: "10 000,01" })).fieldErrors).toEqual({ unitPrice: "lineTooLarge" });
  });
});

describe("money", () => {
  it("rounds a line to whole øre like the database", () => {
    expect(lineAmount(250, 12345)).toBe(30863);
    expect(lineAmount(300, 12345)).toBe(37035);
  });
  it("counts VAT per rate and the total", () => {
    expect(
      invoiceTotals([
        { vat_rate: 25, amount: 900000 },
        { vat_rate: 25, amount: 360000 },
        { vat_rate: 25, amount: 37035 },
        { vat_rate: 0, amount: 8000 },
      ]),
    ).toEqual({
      net: 1305035,
      vat: [
        { rate: 25, base: 1297035, vat: 324259 },
        { rate: 0, base: 8000, vat: 0 },
      ],
      vatTotal: 324259,
      total: 1629294,
    });
  });
  it("shows stored numbers as form text", () => {
    expect(toDecimalText(250, ",")).toBe("2,5");
    expect(toDecimalText(123450, ".")).toBe("1234.5");
    expect(toDecimalText(8000, ",")).toBe("80");
    expect(toLineFormValues({ description: "Ferje", quantity: 2.5, unit: null, unit_price: 12345, vat_rate: 25 }, ",")).toEqual({
      description: "Ferje",
      quantity: "2,5",
      unit: "",
      unitPrice: "123,45",
      vatRate: "25",
    });
  });
});
