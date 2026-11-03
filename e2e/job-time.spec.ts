import { expect, type Page, test } from "@playwright/test";
import { addCustomer, addTodaysJob, createCompany, locales, newCompanyName, newEmail, newPage, shootAllWidths, signUp } from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

// A machine with a minimum and a higher rate from 15:00.
async function addMachine(page: Page, machine: { name: string; rate: string; minHours: string; from: string; percent: string }) {
  await page.goto("/app/vehicles");
  await page.locator('select[name="type"]').selectOption("crane_truck");
  await page.locator('input[name="name"]').fill(machine.name);
  await page.locator('input[name="hourlyRate"]').fill(machine.rate);
  await page.locator('input[name="minHours"]').fill(machine.minHours);
  await page.locator('input[name="eveningFrom"]').fill(machine.from);
  await page.locator('select[name="eveningKind"]').selectOption("percent");
  await page.locator('input[name="eveningValue"]').fill(machine.percent);
  await page.locator('main form button[type="submit"]').first().click();
  await expect(page.locator('main [role="status"]')).toBeVisible();
}

// The person drives the job themselves. Presses within one minute give no
// working time; `nextMinute` waits for the clock to turn before arriving.
async function driveThrough(page: Page, nextMinute = false) {
  await page.goto("/app/my-jobs");
  const card = page.getByRole("article");
  for (const step of ["on_the_way", "arrived"]) {
    if (step === "arrived" && nextMinute) await page.waitForTimeout(61_000 - (Date.now() % 60_000));
    await card.locator(`button[name="step"][value="${step}"]`).click();
    await expect(card.locator(`button[name="step"][value="${step}"]`)).toHaveCount(0);
  }
  await card.locator('button[type="button"]').first().click();
  await card.locator('button[name="step"][value="finished"]').click();
  await expect(card.locator('button[name="step"]')).toHaveCount(0);
}

test("the office approves a job's working time, priced with the minimum and the higher rate, and corrects it with a reason", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const owner = await newPage(browser, baseURL!, "en");
  const { page } = owner;
  await signUp(page, newEmail("time-owner"), "Anna", "Berg");
  await createCompany(page, newCompanyName("time"));
  await addMachine(page, { name: "Kranbil 1", rate: "1450", minHours: "4", from: "15:00", percent: "50" });
  await expect(page.getByRole("listitem").filter({ hasText: "Kranbil 1" })).toContainText("From 15:00: +50 %");
  await addCustomer(page, "Nordbygg AS");
  const job = await addTodaysJob(page, {
    customer: "Nordbygg AS",
    vehicle: "Kranbil 1",
    driver: "Anna Berg",
    address: "Storgata 1, 0155 Oslo",
    contact: "Per, 912 34 567",
  });
  await page.goto(job);
  const section = page.getByRole("region", { name: "Working time" });
  await expect(section).toContainText("The time is counted when the job is finished.");

  // A minute from "on the way" to "finished", billed as the machine's minimum of 4 hours.
  await driveThrough(page, true);
  await page.goto(job);
  await expect(section.getByText("Waiting for approval: counted from the driver's presses")).toBeVisible();
  await expect(section).toContainText("4 h (the machine's minimum)");
  await section.getByRole("button", { name: "Approve time" }).click();
  await expect(section.getByText(/^Approved by Anna Berg · /)).toBeVisible();

  // A correction needs a reason; both versions stay.
  // 07:00–16:00 less 30 min: 8 h 30 min, 1 h of it after 15:00 at +50 %.
  // 450 min × 1 450 kr + 60 min × 2 175 kr = 13 050 kr.
  await section.getByText("Correct the time").click();
  await section.getByLabel("Start", { exact: true }).fill("07:00");
  await section.getByLabel("End", { exact: true }).fill("16:00");
  await section.getByLabel("Breaks, minutes").fill("30");
  await section.getByRole("button", { name: "Save corrected time" }).click();
  await expect(section.getByText("Write why the time is corrected.")).toBeVisible();
  await section.getByLabel("Reason", { exact: true }).fill("Sjåføren trykket først etter jobben");
  await section.getByRole("button", { name: "Save corrected time" }).click();
  await expect(section.getByText(/^Corrected by Anna Berg · /)).toBeVisible();
  await expect(section).toContainText("Reason: Sjåføren trykket først etter jobben");
  const values = section.locator("dl").first().locator("dd");
  await expect(values.nth(2)).toHaveText("8 h 30 min");
  await expect(values.nth(3)).toHaveText("1 h");
  await expect(section).toContainText("NOK 2,175.00 per hour");
  await expect(section).toContainText("NOK 13,050.00");
  await section.getByText("Earlier version (1)").click();
  await expect(section.getByText(/^Approved by Anna Berg · /)).toBeVisible();

  await owner.context.close();
});

for (const locale of locales) {
  test(`working time in ${locale} at every width`, async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const owner = await newPage(browser, baseURL!, locale);
    const { page } = owner;
    await signUp(page, newEmail(`shots-time-${locale}`), "Ingrid", "Ødegård-Kristiansen");
    await createCompany(page, `Vestlandets Kran- og Maskinentreprenør Tid ${locale.toUpperCase()} AS`);
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

    await page.goto(job);
    const section = page.locator('section[aria-labelledby="time-title"]');
    await section.locator('input[name="start"]').fill("06:30");
    await section.locator('input[name="end"]').fill("17:45");
    await section.locator('input[name="breaks"]').fill("45");
    await section.locator('button[type="submit"]').click();
    await expect(section.locator("summary")).toHaveCount(1);
    await section.locator("summary").click();
    await section.locator('input[name="end"]').fill("17:15");
    await section.locator('textarea[name="reason"]').fill("Kunden bekreftet at kranen var ferdig rigget ned kl. 17:15, ikke 17:45.");
    await section.locator('button[type="submit"]').click();
    await expect(section.locator("summary")).toHaveCount(2);
    await section.locator("summary").last().click();
    await section.scrollIntoViewIfNeeded();
    await shootAllWidths(page, "job-time", locale);

    await page.goto("/app/vehicles");
    await shootAllWidths(page, "vehicles-evening", locale);

    await owner.context.close();
  });
}
