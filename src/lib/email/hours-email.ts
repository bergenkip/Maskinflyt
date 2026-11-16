import "server-only";
import { formatDate } from "../pdf/invoice-pdf";
import { formatHours, type ConfirmedSheet } from "../pdf/hours-pdf";
import { escapeHtml, senderName } from "./invoice-email";

// The e-mail that carries a confirmed hours sheet to the company's accountant.
// In Norwegian, like the sheet. Names are data: escaped in the HTML and kept
// out of the headers except as plain text.

export const HOURS_FROM_ADDRESS = "timeliste@maskingo.no";

export function hoursEmail(sheet: ConfirmedSheet, options: { to: string; replyTo: string | null; testMode: boolean }) {
  const period = `${formatDate(sheet.period_from)}–${formatDate(sheet.period_to)}`;
  const name = sheet.employee_name.replace(/[\r\n]+/g, " ");
  const facts: [string, string][] = [
    ["Ansatt", name],
    ["Periode", period],
    ["Timer i alt", formatHours(sheet.worked_minutes)],
    ["Normal", formatHours(sheet.normal_minutes)],
    [`Overtid ${sheet.overtime_percent} %`, formatHours(sheet.overtime_minutes)],
    ...(sheet.overtime2_percent === null ? [] : [[`Overtid ${sheet.overtime2_percent} %`, formatHours(sheet.overtime2_minutes)] as [string, string]]),
  ];
  const test = options.testMode
    ? `TEST: Denne e-posten er sendt fra en testkonto i MaskinGo og er ikke en ekte timeliste. Mottaker: ${options.to}`
    : null;
  const intro = `${name} har bekreftet timelisten for ${period}. Den ligger vedlagt som PDF.`;
  const closing = options.replyTo ? "Spørsmål om timene? Svar på denne e-posten, så går svaret til den ansatte." : "";

  const text = [
    ...(test ? [test, ""] : []),
    "Hei,",
    "",
    intro,
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    "",
    closing,
    "",
    "Vennlig hilsen",
    sheet.company,
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
<p style="margin:0 0 16px">${escapeHtml(intro)}</p>
<table role="presentation" style="border-collapse:collapse;margin:0 0 16px">${facts.map(row).join("")}</table>
${closing ? `<p style="margin:0 0 16px">${escapeHtml(closing)}</p>` : ""}
<p style="margin:0">Vennlig hilsen<br>${escapeHtml(sheet.company)}</p>
</div>
<p style="max-width:560px;margin:12px auto 0;font-size:13px;color:#5b6472">Sendt med MaskinGo for ${escapeHtml(sheet.company)}.</p>
</body></html>`;

  return {
    from: `"${senderName(sheet.company)}" <${HOURS_FROM_ADDRESS}>`,
    replyTo: options.replyTo ?? undefined,
    subject: `${options.testMode ? "TEST: " : ""}Timeliste ${name} ${period}`,
    text,
    html,
  };
}
