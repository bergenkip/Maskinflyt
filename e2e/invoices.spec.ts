import { expect, test } from "@playwright/test";
import {
  addCustomer,
  addMachine,
  addTodaysJob,
  approveTime,
  createCompany,
  driveThrough,
  locales,
  newCompanyName,
  newEmail,
  newPage,
  shootAllWidths,
  signUp,
} from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

test("the bell counts finished jobs until their invoice is marked as sent, and a mark locks the draft", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const owner = await newPage(browser, baseURL!, "en");
  const { page } = owner;
  await signUp(page, newEmail("invoices-owner"), "Anna", "Berg");
  await createCompany(page, newCompanyName("invoices"));
  await addMachine(page, { name: "Kranbil 1", rate: "1200", minHours: "", from: "15:00", percent: "50" });
  await addCustomer(page, "Nordbygg AS");
  const job = await addTodaysJob(page, {
    customer: "Nordbygg AS",
    vehicle: "Kranbil 1",
    driver: "Anna Berg",
    address: "Storgata 1, 0155 Oslo",
    contact: "Per, 912 34 567",
  });
  const bell = page.locator('header a[href="/app/invoices"]');
  await expect(bell).toHaveAccessibleName("Invoices");

  // Finished: the time waits for approval.
  await driveThrough(page);
  await page.reload();
  await expect(bell).toHaveAccessibleName("Invoices: 1 job waits");
  await bell.click();
  await expect(page.getByRole("heading", { level: 1, name: "Invoices" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Working time waits for approval (1)" })).toContainText("Nordbygg AS");
  await expect(page.getByRole("region", { name: "Ready to invoice (0)" })).toContainText("Nothing waits to be invoiced.");
  await expect(page.getByText("Another accounting system?")).toBeVisible();

  // Approved: ready to invoice, with its total (7,5 h × 1 200 + 2 h × 1 800, plus 25 % VAT).
  await approveTime(page, job, { start: "07:00", end: "17:00", breaks: "30" });
  await page.goto("/app/invoices");
  const ready = page.getByRole("region", { name: "Ready to invoice (1)" });
  await expect(ready).toContainText("NOK 15,750.00");
  await expect(bell).toHaveAccessibleName("Invoices: 1 job waits");

  // Marked as sent with the number from the accounting system: locked and out of the bell.
  await ready.getByRole("link").click();
  const section = page.getByRole("region", { name: "Invoice draft" });
  await section.getByLabel("Invoice number (optional)").fill("1042");
  await section.getByRole("button", { name: "Mark as sent" }).click();
  await expect(section.getByText("Marked as sent", { exact: true })).toBeVisible();
  await expect(section).toContainText("invoice no. 1042. The draft is locked.");
  await expect(section.getByText("Add a line", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Working time" }).getByText("Correct the time")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Status" })).toContainText("The invoice is marked as sent");
  await expect(bell).toHaveAccessibleName("Invoices");
  await page.goto("/app/invoices");
  await expect(page.getByRole("region", { name: "Marked as sent (1)" })).toContainText(/Sent .+, no\. 1042/);

  // Taken back: the draft opens again and the job is back in the bell.
  await page.goto(job);
  await section.getByText("Marked by mistake?").click();
  await section.getByRole("button", { name: "Take back the mark" }).click();
  await expect(section.getByText("Draft, nothing is sent")).toBeVisible();
  await expect(bell).toHaveAccessibleName("Invoices: 1 job waits");

  await owner.context.close();
});

for (const locale of locales) {
  test(`invoices in ${locale} at every width`, async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const owner = await newPage(browser, baseURL!, locale);
    const { page } = owner;
    await signUp(page, newEmail(`shots-invoices-${locale}`), "Ingrid", "Ødegård-Kristiansen");
    await createCompany(page, `Vestlandets Kran- og Maskinentreprenør Fakturaer ${locale.toUpperCase()} AS`);
    await addMachine(page, { name: "Scania R650 med Hiab X-HiPro 1058 og grabb", rate: "2 150", minHours: "4", from: "15:00", percent: "50" });
    await addCustomer(page, "Vestlandske Entreprenørforretning og Byggevareimport Holding AS");
    const job = await addTodaysJob(page, {
      customer: "Vestlandske Entreprenørforretning og Byggevareimport Holding AS",
      vehicle: "Scania R650 med Hiab X-HiPro 1058 og grabb",
      driver: "Ingrid Ødegård-Kristiansen",
      address: "Industriveien 125, bygg C, 5257 Kokstad",
      contact: "Per Kristian Halvorsen-Bakketun, +47 912 34 567",
    });
    await driveThrough(page);
    await page.goto("/app/invoices");
    await shootAllWidths(page, "invoices-waiting", locale);

    await approveTime(page, job, { start: "06:30", end: "17:15", breaks: "45" });
    const section = page.locator('section[aria-labelledby="invoice-title"]');
    await section.locator('input[name="reference"]').fill("2026-001042");
    await section.locator('input[name="reference"]').press("Enter");
    await expect(section.locator("summary")).toHaveCount(1);
    await section.scrollIntoViewIfNeeded();
    await shootAllWidths(page, "invoice-sent", locale);
    await page.goto("/app/invoices");
    await shootAllWidths(page, "invoices-sent", locale);

    await owner.context.close();
  });
}
