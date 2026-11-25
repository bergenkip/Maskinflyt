// Checks a list of e-mail addresses with Verifalia before Li writes to them,
// so no message goes to an address that does not exist (bad for the domain's
// reputation). Run by .github/workflows/verify-emails.yml; sends nothing.
//
// Input:  EMAILS (addresses separated by commas, spaces or new lines)
// Secret: VERIFALIA_USERNAME and VERIFALIA_PASSWORD (a Verifalia API user)
// Output: one line per address, "RESULT;<address>;<classification>;<status>",
//         and the same as a table in the run summary.
import { appendFileSync } from "node:fs";

const api = "https://api.verifalia.com/v2.6";
const user = process.env.VERIFALIA_USERNAME;
const pass = process.env.VERIFALIA_PASSWORD;
if (!user || !pass) throw new Error("VERIFALIA_USERNAME and VERIFALIA_PASSWORD must be set as repository secrets.");

const emails = [...new Set((process.env.EMAILS ?? "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
if (emails.length === 0) throw new Error("No addresses given.");
if (emails.length > 500) throw new Error("At most 500 addresses per run.");

const headers = {
  Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

async function call(path, init = {}) {
  const res = await fetch(`${api}${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok && res.status !== 202) throw new Error(`Verifalia ${res.status}: ${text.slice(0, 300)}`);
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

// Submit, then wait until the job is done (at most about 10 minutes).
let { body } = await call("/email-validations", {
  method: "POST",
  body: JSON.stringify({ entries: emails.map((inputData) => ({ inputData })), quality: "Standard" }),
});
const id = body.overview.id;
for (let i = 0; body.overview.status !== "Completed"; i++) {
  if (i >= 20) throw new Error(`Job ${id} not finished in time; run again later.`);
  ({ body } = await call(`/email-validations/${id}?waitTime=30000`));
}

// The entries come in pages.
const entries = [];
let page = await call(`/email-validations/${id}/entries`);
for (;;) {
  entries.push(...page.body.data);
  const cursor = page.body.meta?.cursor;
  if (!cursor || page.body.meta?.isTruncated === false) break;
  page = await call(`/email-validations/${id}/entries?cursor=${encodeURIComponent(cursor)}`);
}

const rows = entries.map((e) => [e.inputData, e.classification, e.status]);
for (const r of rows) console.log(`RESULT;${r.join(";")}`);
const count = (c) => rows.filter((r) => r[1] === c).length;
console.log(`Deliverable ${count("Deliverable")}, Risky ${count("Risky")}, Undeliverable ${count("Undeliverable")}, Unknown ${count("Unknown")}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const table = ["| Address | Classification | Status |", "| --- | --- | --- |", ...rows.map((r) => `| ${r.join(" | ")} |`)];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Verifalia\n\n${table.join("\n")}\n`);
}

// Remove the job from Verifalia once the results are read.
await call(`/email-validations/${id}`, { method: "DELETE" }).catch(() => {});
