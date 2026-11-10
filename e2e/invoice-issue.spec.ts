import { expect, test } from "@playwright/test";
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
  shootAllWidths,
  signUp,
} from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

test("the office issues a numbered invoice with its PDF, and it is locked", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const owner = await newPage(browser, baseURL!, "en");
  const { page } = owner;
  await signUp(page, newEmail("invoice-issue"), "Anna", "Berg");
  await createCompany(page, newCompanyName("invoice-issue"));
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
    await section.locator('form button[type="button"]').first().click();
    await expect(section.locator('form button[type="submit"]').last()).toBeVisible();
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

  // The issued state, in every language and width.
  for (const locale of locales) {
    await owner.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await page.goto(job);
    await section.scrollIntoViewIfNeeded();
    await shootAllWidths(page, "invoice-issued", locale);
  }

  await owner.context.close();
});
