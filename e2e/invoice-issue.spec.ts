import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import {
  addMachine,
  addTodaysJob,
  approveTime,
  createCompany,
  driveThrough,
  locales,
  newCompanyName,
  newEmail,
  newOrgNumber,
  newPage,
  resendStub,
  shootAllWidths,
  signUp,
  today,
} from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

test("the office issues a numbered invoice with its PDF, and it is locked", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const owner = await newPage(browser, baseURL!, "en");
  const { page } = owner;
  await signUp(page, newEmail("invoice-issue"), "Anna", "Berg");
  const company = newCompanyName("invoice-issue");
  await createCompany(page, company);
  await addMachine(page, { name: "Kranbil 1", rate: "1200", minHours: "", from: "15:00", percent: "50" });
  // A company customer with its organisation number (the invoice needs it, or an address).
  await page.goto("/app/customers/new");
  await page.locator('input[name="name"]').fill("Nordbygg AS");
  await page.locator('input[name="orgNumber"]').fill(newOrgNumber());
  await page.locator('input[name="invoiceEmail"]').fill("faktura@nordbygg.test");
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForURL(/\/app\/customers\/[0-9a-f-]{36}\?added=1$/);
  const job = await addTodaysJob(page, {
    customer: "Nordbygg AS",
    vehicle: "Kranbil 1",
    driver: "Anna Berg",
    address: "Storgata 1, 0155 Oslo",
    contact: "Per, 912 34 567",
  });
  await driveThrough(page);
  await approveTime(page, job, { start: "07:00", end: "11:00", breaks: "0" });

  // Without the company's invoice details there is nothing to issue yet.
  const section = page.locator('section[aria-labelledby="invoice-title"]');
  await expect(section).toContainText("Fill in the company's invoice details first.");
  await expect(section.getByRole("button", { name: "Issue invoice" })).toHaveCount(0);
  await section.getByRole("link", { name: "Open the invoice details" }).click();
  const form = page.getByRole("region", { name: "Invoice details" });
  await form.getByLabel("Street address").fill("Kranveien 5");
  await form.getByLabel("Postal code").fill("0581");
  await form.getByLabel("City").fill("Oslo");
  await form.getByLabel("Bank account").fill("1234 56 78903");
  await form.getByRole("button", { name: "Save invoice details" }).click();
  await expect(form.getByRole("status")).toHaveText("Invoice details saved.");

  // The button asks once more, in every language and width.
  for (const locale of locales) {
    await owner.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await page.goto(job);
    const issueForm = section.locator("form").filter({ has: page.locator('button[type="button"]') });
    await issueForm.locator('button[type="button"]').click();
    await expect(issueForm.locator('button[type="submit"]')).toBeVisible();
    await section.scrollIntoViewIfNeeded();
    await shootAllWidths(page, "invoice-issue", locale);
  }
  await owner.context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await page.goto(job);
  await section.getByRole("button", { name: "Issue invoice" }).click();
  await expect(section).toContainText("Issue it now? This cannot be undone.");
  await section.getByRole("button", { name: "Not yet" }).click();
  await expect(section.getByRole("button", { name: "Yes, issue the invoice" })).toHaveCount(0);

  // Issued: number 1, locked, with its PDF.
  await section.getByRole("button", { name: "Issue invoice" }).click();
  await section.getByRole("button", { name: "Yes, issue the invoice" }).click();
  await expect(section.getByText("Invoice no. 1", { exact: true })).toBeVisible();
  await expect(section).toContainText("The invoice is locked: a mistake is corrected with a credit note.");
  await expect(section.getByRole("button", { name: "Add a line" })).toHaveCount(0);
  await expect(section.getByText("Add a line")).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Mark as sent" })).toHaveCount(0);
  await expect(section.getByText("Marked by mistake?")).toHaveCount(0);

  const pdfLink = section.getByRole("link", { name: "Open invoice 1 (PDF)" });
  const href = await pdfLink.getAttribute("href");
  expect(href).toMatch(/^\/app\/invoices\/[0-9a-f-]{36}\/pdf$/);
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect(response.headers()["content-disposition"]).toContain('filename="Faktura-1.pdf"');
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
  // Opened again it is the same stored file.
  expect((await page.request.get(href!)).status()).toBe(200);

  // The first number is now locked.
  await page.goto("/app/invoices/settings");
  await form.getByLabel("First invoice number").fill("500");
  await form.getByRole("button", { name: "Save invoice details" }).click();
  await expect(form.getByLabel("First invoice number")).toHaveAccessibleDescription(/The numbering has started/);

  // E-mailed to the customer, in test mode: only .test addresses, to the test inbox.
  await page.goto(job);
  const to = section.getByLabel("Send to", { exact: true });
  await expect(to).toHaveValue("faktura@nordbygg.test");
  await expect(section).toContainText("only .test addresses");
  await to.fill("post@nordbygg.no");
  await section.getByRole("button", { name: "Send invoice" }).click();
  await expect(section).toContainText("Send invoice 1 to post@nordbygg.no?");
  await section.getByRole("button", { name: "Yes, send it" }).click();
  await expect(to).toHaveAccessibleDescription(/In test mode only \.test addresses can be used\./);
  await to.fill("faktura@nordbygg.test");
  await section.getByRole("button", { name: "Send invoice" }).click();
  await section.getByRole("button", { name: "Yes, send it" }).click();
  await expect(section.getByRole("status")).toHaveText("The invoice is sent to faktura@nordbygg.test.");
  await expect(section.getByRole("listitem").filter({ hasText: "Sent to faktura@nordbygg.test" })).toContainText("(test)");

  const emails = (await (await page.request.get(`${resendStub}/emails`)).json()) as {
    to: string[]; subject: string; text: string; from: string; reply_to?: string[]; authorized: boolean;
    attachments: { filename: string; content: string }[];
  }[];
  const email = emails.find((sent) => sent.subject === `TEST: Faktura 1 fra ${company}`);
  expect(email, "the e-mail reached the e-mail service").toBeDefined();
  expect(email!.authorized).toBe(true);
  expect(email!.to).toEqual(["delivered@resend.dev"]);
  expect(email!.from).toBe(`"${company} via MaskinGo" <faktura@maskingo.no>`);
  expect(email!.text).toContain("Mottaker: faktura@nordbygg.test");
  expect(email!.text).toContain("Kontonummer: 1234 56 78903");
  expect(email!.attachments.map((file) => file.filename)).toEqual(["Faktura-1.pdf"]);
  expect(Buffer.from(email!.attachments[0].content, "base64").subarray(0, 5).toString()).toBe("%PDF-");

  // A mistake: credited in full, with a reason; the job opens again for invoice 3.
  const credit = section.locator("details").filter({ hasText: "Credit the invoice" });
  await credit.locator("summary").click();
  await expect(credit.getByRole("button", { name: "Credit invoice" })).toBeDisabled();
  await credit.getByLabel("Why is it credited?").fill("Wrong number of hours");
  await credit.getByRole("button", { name: "Credit invoice" }).click();
  await expect(credit).toContainText("Credit invoice 1? This cannot be undone.");
  await credit.getByRole("button", { name: "Yes, credit it" }).click();
  await expect(section.getByText("Credit note 2 for invoice 1")).toBeVisible();
  await expect(section.getByText("Invoice 1, credited")).toBeVisible();
  await expect(section).toContainText("Reason: Wrong number of hours");
  const creditHref = await section.getByRole("link", { name: "Open credit note 2 (PDF)" }).getAttribute("href");
  const creditPdf = await page.request.get(creditHref!);
  expect(creditPdf.status()).toBe(200);
  expect(creditPdf.headers()["content-disposition"]).toContain('filename="Kreditnota-2.pdf"');
  expect((await creditPdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // The draft can be corrected again, and the new invoice gets the next number.
  await expect(section.locator("summary").filter({ hasText: "Add a line" })).toBeVisible();
  await section.getByRole("button", { name: "Issue invoice" }).click();
  await section.getByRole("button", { name: "Yes, issue the invoice" }).click();
  await expect(section.getByText("Invoice no. 3", { exact: true })).toBeVisible();
  await expect(section.getByRole("link", { name: "Open invoice 1 (PDF)" })).toBeVisible();

  // The issued state, in every language and width.
  for (const locale of locales) {
    await owner.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await page.goto(job);
    await section.scrollIntoViewIfNeeded();
    await shootAllWidths(page, "invoice-issued", locale);
  }

  // The export for the accountant: this month's documents as CSV and as PDFs.
  await owner.context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await page.goto("/app/invoices");
  await page.getByRole("link", { name: /Export for the accountant/ }).click();
  await expect(page.getByRole("heading", { name: "Export for the accountant", level: 1 })).toBeVisible();
  const result = page.locator("section").filter({ has: page.locator("#result-title") });
  await expect(result).toContainText("2 invoices and 1 credit note");
  await expect(result.getByRole("listitem")).toHaveText([/Invoice 1/, /Credit note 2 for invoice 1/, /Invoice 3/]);

  const csvHref = await result.getByRole("link", { name: "Download CSV" }).getAttribute("href");
  const csvResponse = await page.request.get(csvHref!);
  expect(csvResponse.status()).toBe(200);
  expect(csvResponse.headers()["content-disposition"]).toMatch(/attachment; filename="MaskinGo-fakturaer-\d{4}-\d{2}-01-\d{4}-\d{2}-\d{2}\.csv"/);
  const csv = (await csvResponse.body()).toString("utf8");
  expect(csv.startsWith("\uFEFFType;Nummer;Dato;")).toBe(true);
  const csvRows = csv.slice(1).trim().split("\r\n").map((row) => row.split(";"));
  const date = today.split("-").reverse().join(".");
  expect(csvRows.slice(1).map((row) => [row[0], row[1], row[2], row[6]])).toEqual([
    ["Faktura", "1", date, ""],
    ["Kreditnota", "2", date, "1"],
    ["Faktura", "3", date, ""],
  ]);
  // The credit note cancels invoice 1 to the øre.
  expect(csvRows[2].slice(9, 12)).toEqual(csvRows[1].slice(9, 12).map((amount) => `-${amount}`));

  const zipHref = await result.getByRole("link", { name: "Download PDFs (ZIP)" }).getAttribute("href");
  const zipResponse = await page.request.get(zipHref!);
  expect(zipResponse.status()).toBe(200);
  const files = unzipSync(new Uint8Array(await zipResponse.body()));
  expect(Object.keys(files).sort()).toEqual(["Faktura-1.pdf", "Faktura-3.pdf", "Kreditnota-2.pdf"]);
  for (const pdf of Object.values(files)) expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");

  // A wrong period is told at the field; none is asked from the server.
  await page.getByLabel("From", { exact: true }).fill("2026-12-31");
  await page.getByLabel("To", { exact: true }).fill("2026-12-01");
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page.getByText("The first date must come before the last.")).toBeVisible();
  expect((await page.request.get("/app/invoices/export/csv?from=2026-12-31&to=2026-12-01")).status()).toBe(400);

  // Someone signed out gets no file.
  const stranger = await browser.newContext({ baseURL });
  const strangerCsv = await stranger.request.get(csvHref!, { maxRedirects: 0 });
  expect(strangerCsv.status()).not.toBe(200);
  await stranger.close();

  for (const locale of locales) {
    await owner.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await page.goto("/app/invoices/export");
    await shootAllWidths(page, "invoice-export", locale);
  }

  await owner.context.close();
});
