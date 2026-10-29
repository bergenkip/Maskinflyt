import { expect, type Page, test } from "@playwright/test";
import {
  addVehicle,
  createCompany,
  inviteColleague,
  locales,
  newCompanyName,
  newEmail,
  newPage,
  shootAllWidths,
  signUp,
} from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

// Today in the company's time zone (new companies are in Norway).
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());

async function addCustomer(page: Page, name: string) {
  await page.goto("/app/customers/new");
  await page.locator('input[name="name"]').fill(name);
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForURL(/\/app\/customers\/[0-9a-f-]{36}\?added=1$/);
}

// Today's job for a driver, chosen by visible names; returns the job's address.
async function addTodaysJob(page: Page, job: { customer: string; vehicle: string; driver: string; address: string; contact: string }) {
  await page.goto("/app/jobs/new");
  await page.locator('select[name="customerId"]').selectOption({ label: job.customer });
  await page.locator('input[name="address"]').fill(job.address);
  await page.locator('input[name="siteContact"]').fill(job.contact);
  await page.locator('input[name="date"]').fill(today);
  await page.locator('input[name="startTime"]').fill("07:00");
  await page.locator('input[name="durationHours"]').fill("4");
  await page.locator('select[name="driverId"]').selectOption({ label: job.driver });
  await page.locator('select[name="vehicleId"]').selectOption({ label: job.vehicle });
  await page.locator('textarea[name="description"]').fill("Løfte 6 takstoler opp på taket. Kran med jib.");
  await page.locator("main form").first().locator('button[type="submit"]').last().click();
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]{36}\?added=1$/);
  return page.url().replace(/\?added=1$/, "");
}

test("a driver sees today's job on the phone, reports each step and a note, and the office sees them", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const owner = await newPage(browser, baseURL!, "en");
  await signUp(owner.page, newEmail("driver-owner"), "Anna", "Berg");
  await createCompany(owner.page, newCompanyName("driver"));
  await owner.page.goto("/app/vehicles");
  await addVehicle(owner.page, { type: "crane_truck", name: "Kranbil 1" });
  await expect(owner.page.getByText("Kranbil 1 was added.")).toBeVisible();
  await addCustomer(owner.page, "Nordbygg AS");
  const driver = await inviteColleague(browser, baseURL!, owner.page, "driver", "Sander", "Lie");
  const job = await addTodaysJob(owner.page, {
    customer: "Nordbygg AS",
    vehicle: "Kranbil 1",
    driver: "Sander Lie",
    address: "Storgata 1, 0155 Oslo",
    contact: "Per, 912 34 567",
  });

  // On the phone: the driver's menu leads to today's job, with map and call buttons.
  const { page } = driver;
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/app");
  await expect(page.getByRole("link", { name: /My jobs today/ })).toContainText("1 still to do");
  await page.getByRole("navigation", { name: "Main menu" }).getByRole("link", { name: "My jobs" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My jobs");
  const card = page.getByRole("article", { name: "Nordbygg AS" });
  await expect(card).toContainText("Kranbil 1");
  await expect(card).toContainText("Løfte 6 takstoler");
  await expect(card.getByRole("link", { name: "Open in map" })).toHaveAttribute(
    "href",
    "https://www.google.com/maps/search/?api=1&query=Storgata%201%2C%200155%20Oslo",
  );
  await expect(card.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:91234567");
  await expect(card).toContainText("Not accepted yet");
  await expect(page.getByRole("heading", { level: 2, name: /^Tomorrow/ })).toBeVisible();

  // Step by step; finishing asks once more.
  for (const [button, badge] of [
    ["Accept job", "Accepted"],
    ["I'm on my way", "On the way"],
    ["I've arrived", "Arrived"],
    ["Start break", "On a break"],
    ["End break", "Arrived"],
  ]) {
    await card.getByRole("button", { name: button }).click();
    await expect(card.getByText(new RegExp(`^${badge} \\d\\d:\\d\\d`))).toBeVisible();
  }
  await card.getByText("Add a note").click();
  await card.getByLabel("Note for the office").fill("Kunden var ikke der, ventet 30 min");
  await card.getByRole("button", { name: "Save note" }).click();
  await expect(card.getByText("Note saved. The office can see it.")).toBeVisible();
  await card.getByRole("button", { name: "I'm finished" }).click();
  await expect(card.getByText("Finished with this job? The office then sees it as done.")).toBeVisible();
  await card.getByRole("button", { name: "Yes, finished" }).click();
  await expect(card.getByText("You have finished this job. Thank you!")).toBeVisible();
  await card.getByText(/entries so far$/).click();
  await expect(card).toContainText("Note: Kunden var ikke der, ventet 30 min");

  // The office reads it all on the job, and the job is done.
  await owner.page.goto(job);
  const report = owner.page.getByRole("region", { name: "From the driver" });
  await expect(report.getByText(/^Finished /)).toBeVisible();
  await expect(report).toContainText("Break started");
  await expect(report).toContainText("Note: Kunden var ikke der, ventet 30 min");
  await expect(owner.page.getByRole("region", { name: "Status" }).getByText("Done", { exact: true })).toBeVisible();

  // Drivers still do not see the office's job pages or prices.
  await page.goto(job);
  await expect(page).toHaveURL(/\/app$/);

  await owner.context.close();
  await driver.context.close();
});

for (const locale of locales) {
  test(`my jobs in ${locale} at every width`, async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    // An owner who drives: anyone given a job sees it under My jobs.
    const owner = await newPage(browser, baseURL!, locale);
    await signUp(owner.page, newEmail(`shots-driver-${locale}`), "Ingrid", "Ødegård-Kristiansen");
    await createCompany(owner.page, `Vestlandets Kran- og Maskinentreprenør Fører ${locale.toUpperCase()} AS`);
    await owner.page.goto("/app/vehicles");
    await addVehicle(owner.page, { type: "crane_truck_grab", name: "Scania R650 med Hiab X-HiPro 1058 og grabb", rate: "2 150" });
    await expect(owner.page.locator('[role="status"]')).toBeVisible();
    await addCustomer(owner.page, "Vestlandske Entreprenørforretning og Byggevareimport Holding AS");
    await addTodaysJob(owner.page, {
      customer: "Vestlandske Entreprenørforretning og Byggevareimport Holding AS",
      vehicle: "Scania R650 med Hiab X-HiPro 1058 og grabb",
      driver: "Ingrid Ødegård-Kristiansen",
      address: "Industriveien 125, bygg C, 5257 Kokstad",
      contact: "Per Kristian Halvorsen-Bakketun, +47 912 34 567",
    });

    await owner.page.goto("/app/my-jobs");
    await shootAllWidths(owner.page, "my-jobs", locale);
    const card = owner.page.getByRole("article");
    await card.locator('button[name="step"][value="on_the_way"]').click();
    await expect(card.locator('button[name="step"][value="arrived"]')).toBeVisible();
    await card.locator('button[name="step"][value="arrived"]').click();
    await expect(card.locator('button[name="step"][value="break_started"]')).toBeVisible();
    await card.locator("summary").last().click();
    await shootAllWidths(owner.page, "my-jobs-arrived", locale);

    await owner.context.close();
  });
}
