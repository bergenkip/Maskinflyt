import "server-only";
import nb from "../../../messages/nb.json";
import type { Service } from "../company-page";
import { formatPhone } from "../customers";
import { SITE_URL } from "../site";
import { escapeHtml, senderName } from "./invoice-email";

// The e-mail that tells a company about a new request from its public page.
// In Norwegian, like the company's other e-mails. Everything the customer
// wrote is data: escaped in the HTML and kept out of the headers except as
// plain text on one line. Answering is done in MaskinGo, or by replying.

export const REQUEST_FROM_ADDRESS = "foresporsel@maskingo.no";
export const REQUESTS_PATH = "/app/jobs/requests";

export type RequestForEmail = {
  company: string;
  name: string;
  phone: string | null;
  email: string | null;
  place: string;
  wantedDate: string | null;
  service: Service | null;
  description: string;
};

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();
const norwegianDate = (iso: string) => iso.split("-").reverse().join(".");

export function requestEmail(request: RequestForEmail, options: { to: string; testMode: boolean }) {
  const name = oneLine(request.name);
  const facts: [string, string][] = [
    ["Navn", name],
    ...(request.phone ? [["Telefon", formatPhone(request.phone)] as [string, string]] : []),
    ...(request.email ? [["E-post", request.email] as [string, string]] : []),
    ["Sted", request.place],
    ...(request.wantedDate ? [["Ønsket dato", norwegianDate(request.wantedDate)] as [string, string]] : []),
    // In Norwegian whatever language the customer wrote in (the Services list in nb.json).
    ...(request.service ? [["Tjeneste", nb.Services[request.service]] as [string, string]] : []),
  ];
  const test = options.testMode
    ? `TEST: Denne e-posten er sendt fra en testkonto i MaskinGo og er ikke en ekte forespørsel. Mottaker: ${options.to}`
    : null;
  const intro = `${name} har sendt en forespørsel fra firmasiden til ${request.company}.`;
  const link = `${SITE_URL}${REQUESTS_PATH}`;
  const reply = request.email ? "Svarer du på denne e-posten, går svaret direkte til kunden." : "";
  const note = "Ingenting er bekreftet ennå: avtal oppdraget med kunden før du planlegger det.";

  const text = [
    ...(test ? [test, ""] : []),
    "Hei,",
    "",
    intro,
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    "",
    "Beskrivelse:",
    request.description,
    "",
    note,
    `Se forespørselen i MaskinGo: ${link}`,
    reply,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  const row = ([label, value]: [string, string]) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#5b6472;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:600">${escapeHtml(value)}</td></tr>`;
  const html = `<!doctype html>
<html lang="nb"><body style="margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1b2430">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dfe3e8;border-radius:12px;padding:24px">
${test ? `<p style="margin:0 0 16px;padding:12px;border-radius:8px;background:#fff4d6;color:#6b4e00;font-weight:600">${escapeHtml(test)}</p>` : ""}
<p style="margin:0 0 16px">Hei,</p>
<p style="margin:0 0 16px">${escapeHtml(intro)}</p>
<table role="presentation" style="border-collapse:collapse;margin:0 0 16px">${facts.map(row).join("")}</table>
<p style="margin:0 0 4px;color:#5b6472">Beskrivelse</p>
<p style="margin:0 0 16px;white-space:pre-line">${escapeHtml(request.description)}</p>
<p style="margin:0 0 16px">${escapeHtml(note)}</p>
<p style="margin:0 0 16px"><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#0068d9;color:#ffffff;font-weight:600;text-decoration:none">Se forespørselen i MaskinGo</a></p>
${reply ? `<p style="margin:0">${escapeHtml(reply)}</p>` : ""}
</div>
<p style="max-width:560px;margin:12px auto 0;font-size:13px;color:#5b6472">Sendt med MaskinGo fra firmasiden til ${escapeHtml(request.company)}.</p>
</body></html>`;

  return {
    from: `"${senderName(request.company)}" <${REQUEST_FROM_ADDRESS}>`,
    replyTo: request.email ?? undefined,
    subject: `${options.testMode ? "TEST: " : ""}Ny forespørsel fra ${name}`.slice(0, 200),
    text,
    html,
  };
}
