import "server-only";
import { formatBankAccount } from "../invoice-settings";
import { formatAmount, formatDate, type IssuedInvoice } from "../pdf/invoice-pdf";

// The e-mail that carries an issued invoice to the customer. Like the invoice
// itself it is in Norwegian. Names and addresses are data: they are escaped
// in the HTML and kept out of the e-mail's headers except as plain text.

export const INVOICE_FROM_ADDRESS = "faktura@maskingo.no";

// Until an accountant has checked MaskinGo's invoices, every e-mail goes to the
// e-mail service's test inbox, and only .test addresses are accepted.
export const TEST_INBOX = "delivered@resend.dev";

export function invoiceEmailLive(): boolean {
  return process.env.INVOICE_EMAIL_LIVE === "1";
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// A display name for the From header: no quotes, angle brackets or line breaks.
export function senderName(company: string): string {
  const name = company.replace(/[\r\n"<>\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return `${name || "MaskinGo"} via MaskinGo`;
}

export type InvoiceEmail = {
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  filename: string;
};

export function invoiceEmail(invoice: IssuedInvoice, options: { to: string; testMode: boolean }): InvoiceEmail {
  const seller = invoice.seller.name;
  const amount = `${formatAmount(invoice.total)} ${invoice.currency}`;
  const facts: [string, string][] = [
    ["Fakturanummer", String(invoice.number)],
    ["Beløp å betale", amount],
    ["Forfallsdato", formatDate(invoice.due_date)],
    ["Kontonummer", formatBankAccount(invoice.seller.bank_account)],
  ];
  const test = options.testMode
    ? `TEST: Denne e-posten er sendt fra en testkonto i MaskinGo og er ikke en ekte faktura. Mottaker: ${options.to}`
    : null;

  const text = [
    ...(test ? [test, ""] : []),
    "Hei,",
    "",
    `Vedlagt finner du faktura ${invoice.number} fra ${seller}.`,
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    "",
    `Merk betalingen med fakturanummer ${invoice.number}.`,
    invoice.seller.email ? "Spørsmål om fakturaen? Svar på denne e-posten." : "",
    "",
    "Vennlig hilsen",
    seller,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  const row = ([label, value]: [string, string]) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#5b6472">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:600">${escapeHtml(value)}</td></tr>`;
  const html = `<!doctype html>
<html lang="nb"><body style="margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1b2430">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dfe3e8;border-radius:12px;padding:24px">
${test ? `<p style="margin:0 0 16px;padding:12px;border-radius:8px;background:#fff4d6;color:#6b4e00;font-weight:600">${escapeHtml(test)}</p>` : ""}
<p style="margin:0 0 16px">Hei,</p>
<p style="margin:0 0 16px">Vedlagt finner du faktura ${invoice.number} fra ${escapeHtml(seller)}.</p>
<table role="presentation" style="border-collapse:collapse;margin:0 0 16px">${facts.map(row).join("")}</table>
<p style="margin:0 0 16px">Merk betalingen med fakturanummer ${invoice.number}.${invoice.seller.email ? " Spørsmål om fakturaen? Svar på denne e-posten." : ""}</p>
<p style="margin:0">Vennlig hilsen<br>${escapeHtml(seller)}</p>
</div>
<p style="max-width:560px;margin:12px auto 0;font-size:13px;color:#5b6472">Sendt med MaskinGo for ${escapeHtml(seller)}.</p>
</body></html>`;

  return {
    from: `"${senderName(seller)}" <${INVOICE_FROM_ADDRESS}>`,
    replyTo: invoice.seller.email ?? undefined,
    subject: `${options.testMode ? "TEST: " : ""}Faktura ${invoice.number} fra ${seller.replace(/[\r\n]+/g, " ")}`,
    text,
    html,
    filename: `Faktura-${invoice.number}.pdf`,
  };
}
