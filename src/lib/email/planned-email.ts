import "server-only";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import lt from "../../../messages/lt.json";
import nb from "../../../messages/nb.json";
import { formatPhone } from "../customers";
import { CUSTOMER_PATH } from "../customer-account";
import { SITE_URL } from "../site";
import { escapeHtml, senderName } from "./invoice-email";
import { REQUEST_FROM_ADDRESS } from "./request-email";

// Stage 16b: the company has planned the job from a customer's request, and
// tells the customer the time. Sent only when the person who planned it leaves
// the box ticked. In the language the customer wrote in (JobPlannedEmail).
// Names and places are data: escaped in the HTML, one line in the subject.

const catalogs = { nb, en, lt } as const;
type Locale = keyof typeof catalogs;

export type PlannedForEmail = {
  company: string;
  name: string;
  address: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  companyEmail: string | null;
  companyPhone: string | null;
  locale: string;
  // Sent from a customer account: the e-mail points to the customer's page.
  hasAccount: boolean;
};

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

export function plannedTime(startsAt: string, endsAt: string, locale: Locale, timeZone: string) {
  return new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).formatRange(new Date(startsAt), new Date(endsAt));
}

export function plannedEmail(job: PlannedForEmail, options: { to: string; testMode: boolean }) {
  const locale: Locale = job.locale in catalogs ? (job.locale as Locale) : "nb";
  const t = createTranslator({ locale, messages: catalogs[locale], namespace: "JobPlannedEmail" });
  const company = oneLine(job.company);
  const name = oneLine(job.name);

  const test = options.testMode ? t("test", { to: options.to }) : null;
  const intro = t("intro", { company });
  const facts: [string, string][] = [
    [t("time"), plannedTime(job.startsAt, job.endsAt, locale, job.timeZone)],
    [t("place"), job.address],
  ];
  const questions = job.companyPhone ? t("questionsPhone", { phone: formatPhone(job.companyPhone) }) : t("questions");
  const follow = job.hasAccount ? t("follow") : null;
  const link = `${SITE_URL}${CUSTOMER_PATH}`;

  const text = [
    ...(test ? [test, ""] : []),
    t("greeting", { name }),
    "",
    intro,
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    t("estimate"),
    "",
    ...(follow ? [`${follow} ${link}`, ""] : []),
    job.companyEmail || job.companyPhone ? questions : "",
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
<table role="presentation" style="border-collapse:collapse;margin:0 0 8px">${facts.map(row).join("")}</table>
<p style="margin:0 0 16px;font-size:14px;color:#5b6472">${escapeHtml(t("estimate"))}</p>
${follow ? `<p style="margin:0 0 16px">${escapeHtml(follow)} <a href="${link}" style="color:#1d4ed8">${escapeHtml(t("followLink"))}</a></p>` : ""}
${job.companyEmail || job.companyPhone ? `<p style="margin:0 0 16px">${escapeHtml(questions)}</p>` : ""}
<p style="margin:0">${escapeHtml(t("closing"))}<br>${escapeHtml(company)}</p>
</div>
<p style="max-width:560px;margin:12px auto 0;font-size:13px;color:#5b6472">${escapeHtml(t("footer", { company }))}</p>
</body></html>`;

  return {
    from: `"${senderName(job.company)}" <${REQUEST_FROM_ADDRESS}>`,
    // Answers from the customer go to the company, not to MaskinGo.
    replyTo: job.companyEmail ?? undefined,
    subject: `${options.testMode ? "TEST: " : ""}${t("subject", { company })}`.slice(0, 200),
    text,
    html,
  };
}
