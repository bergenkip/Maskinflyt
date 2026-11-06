// Extra job lines and the invoice draft's totals, shared by the server actions,
// the page and their tests. The database checks the same limits again and
// counts each line's amount (see the job_lines migration).

import { parseFixed } from "./vehicles";

export const vatRates = [25, 15, 12, 0] as const;
export type VatRate = (typeof vatRates)[number];
export const MAX_LINE_DESCRIPTION_LENGTH = 200;
export const MAX_UNIT_LENGTH = 20;
const MAX_QUANTITY_HUNDREDTHS = 100_000 * 100;
const MAX_UNIT_PRICE_ORE = 10_000_000; // 100 000 kr
const MAX_LINE_ORE = 100_000_000; // 1 000 000 kr

export function isVatRate(value: number): value is VatRate {
  return (vatRates as readonly number[]).includes(value);
}

export type LineFormValues = { description: string; quantity: string; unit: string; unitPrice: string; vatRate: string };
export type LineFieldError =
  | "descriptionRequired"
  | "descriptionTooLong"
  | "quantityInvalid"
  | "unitTooLong"
  | "priceInvalid"
  | "vatInvalid"
  | "lineTooLarge";
// quantity as an exact decimal string ("2.50") for the numeric column, money in øre.
export type LineFields = { description: string; quantity: string; unit: string | null; unit_price: number; vat_rate: VatRate };

// The line form: "2,5" × "1 234,50" kr, VAT 25 %.
export function validateLine(formData: FormData): {
  values: LineFormValues;
  fieldErrors?: Partial<Record<keyof LineFormValues, LineFieldError>>;
  fields?: LineFields;
} {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const values: LineFormValues = {
    description: text("description"),
    quantity: text("quantity"),
    unit: text("unit"),
    unitPrice: text("unitPrice"),
    vatRate: text("vatRate"),
  };
  const fieldErrors: Partial<Record<keyof LineFormValues, LineFieldError>> = {};

  if (values.description === "") fieldErrors.description = "descriptionRequired";
  else if (values.description.length > MAX_LINE_DESCRIPTION_LENGTH) fieldErrors.description = "descriptionTooLong";

  const hundredths = parseFixed(values.quantity, 2);
  if (!hundredths || hundredths > MAX_QUANTITY_HUNDREDTHS) fieldErrors.quantity = "quantityInvalid";

  if (values.unit.length > MAX_UNIT_LENGTH) fieldErrors.unit = "unitTooLong";

  const price = parseFixed(values.unitPrice, 2);
  if (price === null || price === undefined || price > MAX_UNIT_PRICE_ORE) fieldErrors.unitPrice = "priceInvalid";

  const vat = Number(values.vatRate);
  if (!/^\d{1,2}$/.test(values.vatRate) || !isVatRate(vat)) fieldErrors.vatRate = "vatInvalid";

  if (hundredths && price !== null && price !== undefined && !fieldErrors.quantity && !fieldErrors.unitPrice) {
    if (lineAmount(hundredths, price) > MAX_LINE_ORE) fieldErrors.unitPrice = "lineTooLarge";
  }

  if (Object.keys(fieldErrors).length > 0 || !hundredths || price === null || price === undefined || !isVatRate(vat)) {
    return { values, fieldErrors };
  }
  return {
    values,
    fields: {
      description: values.description,
      quantity: `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`,
      unit: values.unit || null,
      unit_price: price,
      vat_rate: vat,
    },
  };
}

// The amount of a line in whole øre, as the database rounds it (half away from zero).
export function lineAmount(quantityHundredths: number, unitPriceOre: number) {
  return Math.round((quantityHundredths * unitPriceOre) / 100);
}

// A stored number (2.5, 123.45) as form text with the language's decimal separator.
export function toDecimalText(hundredths: number, separator: "," | ".") {
  const whole = Math.floor(hundredths / 100);
  const fraction = String(hundredths % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}${separator}${fraction}` : String(whole);
}

// A stored line as editable text for the form.
export function toLineFormValues(
  line: { description: string | null; quantity: number; unit: string | null; unit_price: number; vat_rate: number },
  separator: "," | ".",
): LineFormValues {
  return {
    description: line.description ?? "",
    quantity: toDecimalText(Math.round(Number(line.quantity) * 100), separator),
    unit: line.unit ?? "",
    unitPrice: toDecimalText(line.unit_price, separator),
    vatRate: String(line.vat_rate),
  };
}

export type DraftLine = {
  kind: "time" | "evening" | "line";
  line_id: string | null;
  description: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  vat_rate: number;
  amount: number;
};

// Sum without VAT, the VAT per rate (counted from the sum of that rate's lines
// and rounded to whole øre), and the total. Whole øre throughout.
export function invoiceTotals(lines: Pick<DraftLine, "vat_rate" | "amount">[]) {
  const byRate = new Map<number, number>();
  for (const line of lines) byRate.set(line.vat_rate, (byRate.get(line.vat_rate) ?? 0) + line.amount);
  const vat = [...byRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rate, base]) => ({ rate, base, vat: Math.round((base * rate) / 100) }));
  const net = lines.reduce((sum, line) => sum + line.amount, 0);
  const vatTotal = vat.reduce((sum, row) => sum + row.vat, 0);
  return { net, vat, vatTotal, total: net + vatTotal };
}

// The invoice number in the company's accounting system, kept with the mark "sent".
export const MAX_INVOICE_REFERENCE_LENGTH = 40;

export type InvoiceMark = { reference: string | null; net: number; vat: number; total: number; sent_by: string | null; sent_at: string };
export type QueueState = "time" | "ready" | "sent";
export type QueueRow = {
  job_id: string;
  number: number;
  customer: string;
  ends_at: string;
  state: QueueState;
  total: number | null;
  reference: string | null;
  sent_at: string | null;
};
