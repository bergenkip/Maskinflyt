// Who stands behind MaskinGo, shown in the privacy policy and the terms.
// Filled in from Li's answer; the e-mail is the company's own inbox (Resend).
export type Company = { name: string; orgNumber: string; address: string; email: string };

export const COMPANY: Company = {
  name: "TODO company name",
  orgNumber: "TODO",
  address: "TODO address",
  email: "hei@maskingo.no",
};

// The date shown as "last updated". Change it whenever the texts change.
export const LEGAL_UPDATED = "2026-11-17";

export type LegalSection = { title: string; body: string[] };

// Fills {company}, {orgNumber}, {address} and {email} in a legal text.
export function fillCompany(text: string, company: Company = COMPANY): string {
  return text
    .replaceAll("{company}", company.name)
    .replaceAll("{orgNumber}", company.orgNumber)
    .replaceAll("{address}", company.address)
    .replaceAll("{email}", company.email);
}
