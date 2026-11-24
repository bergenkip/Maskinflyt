import "server-only";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import lt from "../../../messages/lt.json";
import nb from "../../../messages/nb.json";
import { formatPhone } from "../customers";
import { escapeHtml, senderName } from "./invoice-email";
import { REQUEST_FROM_ADDRESS } from "./request-email";

// The company's answer to a customer's request, in the language the customer
// wrote in. The texts live in the messages files (RequestAnswerEmail). The
// company's message and the customer's own words are data: escaped in the HTML
// and kept out of the headers except as plain text on one line.

const catalogs = { nb, en, lt } as const;
export type AnswerLocale = keyof typeof catalogs;

export type AnswerForEmail = {
  accepted: boolean;
  company: string;
  name: string;
  place: string;
  wantedDate: string | null;
  // A time the customer picked, as an instant, shown in the company's time zone.
  wantedStart?: string | null;
  timeZone?: string;
  message: string | null;
  companyEmail: string | null;
  companyPhone: string | null;
  locale: string;
};

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();
const day = (iso: string, locale: AnswerLocale) =>
  new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );

const dayAndTime = (iso: string, locale: AnswerLocale, timeZone: string) =>
  new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));

export function answerEmail(answer: AnswerForEmail, options: { to: string; testMode: boolean }) {
  const locale: AnswerLocale = answer.locale in catalogs ? (answer.locale as AnswerLocale) : "nb";
  const t = createTranslator({ locale, messages: catalogs[locale], namespace: "RequestAnswerEmail" });
  const company = oneLine(answer.company);
  const name = oneLine(answer.name);

  const test = options.testMode ? t("test", { to: options.to }) : null;
  const intro = answer.accepted ? t("acceptedIntro", { company }) : t("declinedIntro", { company });
  const facts: [string, string][] = [
    [t("place"), answer.place],
    ...(answer.wantedStart
      ? [[t("time"), dayAndTime(answer.wantedStart, locale, answer.timeZone ?? "Europe/Oslo")] as [string, string]]
      : answer.wantedDate
        ? [[t("date"), day(answer.wantedDate, locale)] as [string, string]]
        : []),
  ];
  const questions = answer.companyPhone ? t("questionsPhone", { phone: formatPhone(answer.companyPhone) }) : t("questions");

  const text = [
    ...(test ? [test, ""] : []),
    t("greeting", { name }),
    "",
    intro,
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    ...(answer.message ? ["", `${t("message", { company })}:`, answer.message] : []),
    "",
    answer.companyEmail || answer.companyPhone ? questions : "",
    "",
    t("closing"),
    company,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  const row = ([label, value]: [string, string]) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#5b6472;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:600">${escapeHtml(value)}</td></tr>`;
  const html = `<!doctype html>
<html lang="${locale}"><body style="margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1b2430">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dfe3e8;border-radius:12px;padding:24px">
${test ? `<p style="margin:0 0 16px;padding:12px;border-radius:8px;background:#fff4d6;color:#6b4e00;font-weight:600">${escapeHtml(test)}</p>` : ""}
<p style="margin:0 0 16px">${escapeHtml(t("greeting", { name }))}</p>
<p style="margin:0 0 16px">${escapeHtml(intro)}</p>
<table role="presentation" style="border-collapse:collapse;margin:0 0 16px">${facts.map(row).join("")}</table>
${answer.message ? `<p style="margin:0 0 4px;color:#5b6472">${escapeHtml(t("message", { company }))}</p><p style="margin:0 0 16px;white-space:pre-line">${escapeHtml(answer.message)}</p>` : ""}
${answer.companyEmail || answer.companyPhone ? `<p style="margin:0 0 16px">${escapeHtml(questions)}</p>` : ""}
<p style="margin:0">${escapeHtml(t("closing"))}<br>${escapeHtml(company)}</p>
</div>
<p style="max-width:560px;margin:12px auto 0;font-size:13px;color:#5b6472">${escapeHtml(t("footer", { company }))}</p>
</body></html>`;

  const subject = answer.accepted ? t("acceptedSubject", { company }) : t("declinedSubject", { company });
  return {
    from: `"${senderName(answer.company)}" <${REQUEST_FROM_ADDRESS}>`,
    // Answers from the customer go to the company, not to MaskinGo.
    replyTo: answer.companyEmail ?? undefined,
    subject: `${options.testMode ? "TEST: " : ""}${subject}`.slice(0, 200),
    text,
    html,
  };
}
