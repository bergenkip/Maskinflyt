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

// A day well ahead, so the jobs are always "upcoming".
const day = "2030-05-06";

async function addCustomer(page: Page, name: string) {
  await page.goto("/app/customers/new");
  await page.locator('input[name="name"]').fill(name);
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForURL(/\/app\/customers\/[0-9a-f-]{36}\?added=1$/);
}

type JobInput = { customer: string; address: string; start: string; end: string; vehicle?: string; driver?: string };

// On /app/jobs/new or a job's page: fills the form (selects by visible name) and sends it.
async function fillJob(page: Page, job: JobInput) {
  await page.locator('select[name="customerId"]').selectOption({ label: job.customer });
  await page.locator('input[name="address"]').fill(job.address);
  await page.locator('input[name="date"]').fill(day);
  await page.locator('input[name="startTime"]').fill(job.start);
  await page.locator('input[name="endTime"]').fill(job.end);
  if (job.vehicle) await page.locator('select[name="vehicleId"]').selectOption({ label: job.vehicle });
  if (job.driver) await page.locator('select[name="driverId"]').selectOption({ label: job.driver });
  await page.locator("main form").first().locator('button[type="submit"]').last().click();
}

test("a job is added, planned with a machine and a driver, warned about double booking, finished and cancelled", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const owner = await newPage(browser, baseURL!, "en");
  await signUp(owner.page, newEmail("jobs-owner"), "Anna", "Berg");
  await createCompany(owner.page, newCompanyName("jobs"));
  await owner.page.goto("/app/vehicles");
  await addVehicle(owner.page, { type: "crane_truck", name: "Kranbil 1", crane: "20", rate: "1450" });
  await expect(owner.page.getByText("Kranbil 1 was added.")).toBeVisible();
  await addCustomer(owner.page, "Nordbygg AS");
  // The customer's own price for the crane truck.
  await owner.page.getByRole("region", { name: "The customer's own prices" }).getByLabel("Kranbil 1").fill("1300");
  await owner.page.getByRole("button", { name: "Save price" }).click();
  await expect(owner.page.getByText("Price saved.")).toBeVisible();
  await addCustomer(owner.page, "Kari Nordmann");
  const driver = await inviteColleague(browser, baseURL!, owner.page, "driver", "Sander", "Lie");

  await owner.page.getByRole("link", { name: "Jobs", exact: true }).click();
  await expect(owner.page.getByRole("heading", { level: 1 })).toHaveText("Jobs");
  await expect(owner.page.getByText("No upcoming jobs. Add one when a customer calls.")).toBeVisible();

  // Wrong input is explained at the field.
  await owner.page.getByRole("link", { name: "New job" }).click();
  await owner.page.getByRole("button", { name: "Add job" }).click();
  await expect(owner.page.getByText("Choose a customer.")).toBeVisible();
  await expect(owner.page.getByText("Enter the address (at most 200 characters).")).toBeVisible();
  await expect(owner.page.getByText("Enter a time, for example 07:30.")).toHaveCount(2);
  await fillJob(owner.page, { customer: "Nordbygg AS", address: "Storgata 1, 0155 Oslo", start: "11:00", end: "10:00" });
  await expect(owner.page.getByText("The end must be after the start on the same day.")).toBeVisible();
  await expect(owner.page.locator('input[name="address"]')).toHaveValue("Storgata 1, 0155 Oslo");

  // With a machine but no driver yet: added, not planned, at the customer's own price.
  await fillJob(owner.page, { customer: "Nordbygg AS", address: "Storgata 1, 0155 Oslo", start: "07:00", end: "11:30", vehicle: "Kranbil 1" });
  await owner.page.waitForURL(/\/app\/jobs\/[0-9a-f-]{36}\?added=1$/);
  await expect(owner.page.getByText("Job 1 was added.")).toBeVisible();
  await expect(owner.page.getByRole("heading", { level: 1 })).toHaveText("Nordbygg AS");
  await expect(owner.page.getByText("Not planned").first()).toBeVisible();
  await expect(owner.page.getByText("NOK 1,300.00 per hour (the customer's own price)")).toBeVisible();
  await expect(owner.page.getByText(/^Added by Anna Berg · /)).toBeVisible();
  const firstJob = owner.page.url().replace(/\?added=1$/, "");

  // A driver makes it planned.
  await owner.page.locator('select[name="driverId"]').selectOption({ label: "Sander Lie" });
  await owner.page.getByRole("button", { name: "Save changes" }).click();
  await expect(owner.page.getByText("Changes saved.")).toBeVisible();
  await expect(owner.page.getByRole("region", { name: "Status" }).getByText("Planned", { exact: true })).toBeVisible();

  // The same machine at an overlapping time: a warning first, then saved anyway.
  await owner.page.goto("/app/jobs/new");
  await fillJob(owner.page, { customer: "Kari Nordmann", address: "Fjellveien 3, 5003 Bergen", start: "10:00", end: "12:00", vehicle: "Kranbil 1" });
  const warning = owner.page.getByRole("alert").filter({ hasText: "Already busy at this time" });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Kranbil 1 is on job 1 for Nordbygg AS");
  await expect(owner.page.locator('input[name="address"]')).toHaveValue("Fjellveien 3, 5003 Bergen");
  await owner.page.getByRole("button", { name: "Save anyway" }).click();
  await owner.page.waitForURL(/\/app\/jobs\/[0-9a-f-]{36}\?added=1$/);
  await expect(owner.page.getByText("Job 2 was added.")).toBeVisible();
  // Kari has no own price, so the machine's usual rate applies.
  await expect(owner.page.getByText("NOK 1,450.00 per hour (the machine's usual rate)")).toBeVisible();

  // Cancelled, then restored.
  const status = owner.page.getByRole("region", { name: "Status" });
  await status.getByRole("button", { name: "Cancel job" }).click();
  await expect(status.getByText("Cancelled", { exact: true })).toBeVisible();
  await status.getByRole("button", { name: "Restore job" }).click();
  await expect(status.getByText("Not planned", { exact: true })).toBeVisible();

  // The list, by day, with machine, driver and status.
  await owner.page.getByRole("link", { name: "All jobs" }).click();
  await expect(owner.page.getByText("2 jobs")).toBeVisible();
  const first = owner.page.getByRole("listitem").filter({ hasText: "No. 1" });
  await expect(first).toContainText("Nordbygg AS");
  await expect(first).toContainText("Sander Lie");
  await expect(first).toContainText("Planned");
  await expect(owner.page.getByRole("listitem").filter({ hasText: "No. 2" })).toContainText("No driver");

  // The first job is done.
  await owner.page.goto(firstJob);
  await owner.page.getByRole("region", { name: "Status" }).getByRole("button", { name: "Mark as done" }).click();
  await expect(owner.page.getByRole("region", { name: "Status" }).getByText("The job is done.")).toBeVisible();

  // The overview counts the open upcoming jobs.
  await owner.page.getByRole("navigation", { name: "Main menu" }).getByRole("link", { name: "Overview" }).click();
  await expect(owner.page.getByRole("link", { name: /Upcoming jobs/ })).toContainText("1 not planned yet");

  // A dispatcher plans jobs too; a driver has no menu entry, and the address leads back to the overview.
  const dispatcher = await inviteColleague(browser, baseURL!, owner.page, "dispatcher", "Dina", "Dahl");
  await dispatcher.page.getByRole("link", { name: "Jobs", exact: true }).click();
  await expect(dispatcher.page.getByText("2 jobs")).toBeVisible();
  await expect(driver.page.getByRole("link", { name: "Jobs", exact: true })).toHaveCount(0);
  await driver.page.goto("/app/jobs");
  await expect(driver.page).toHaveURL(/\/app$/);

  await owner.context.close();
  await dispatcher.context.close();
  await driver.context.close();
});

for (const locale of locales) {
  test(`job screens in ${locale} at every width`, async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const owner = await newPage(browser, baseURL!, locale);
    await signUp(owner.page, newEmail(`shots-jobs-${locale}`), "Ingrid", "Ødegård-Kristiansen");
    await createCompany(owner.page, `Vestlandets Kran- og Maskinentreprenør Oppdrag ${locale.toUpperCase()} AS`);
    await owner.page.goto("/app/vehicles");
    await addVehicle(owner.page, { type: "crane_truck_grab", name: "Scania R650 med Hiab X-HiPro 1058 og grabb", rate: "2 150" });
    await expect(owner.page.locator('[role="status"]')).toBeVisible();
    await owner.page.goto("/app/jobs");
    await shootAllWidths(owner.page, "jobs-empty", locale);

    await addCustomer(owner.page, "Vestlandske Entreprenørforretning og Byggevareimport Holding AS");
    await owner.page.goto("/app/jobs/new");
    await shootAllWidths(owner.page, "job-new", locale);

    // Long names and texts, as people really write them.
    await fillJob(owner.page, {
      customer: "Vestlandske Entreprenørforretning og Byggevareimport Holding AS",
      address: "Industriveien 125, bygg C, 5257 Kokstad",
      start: "06:30",
      end: "15:00",
      vehicle: "Scania R650 med Hiab X-HiPro 1058 og grabb",
      driver: "Ingrid Ødegård-Kristiansen",
    });
    await owner.page.waitForURL(/\/app\/jobs\/[0-9a-f-]{36}\?added=1$/);
    await shootAllWidths(owner.page, "job", locale);

    await owner.page.goto("/app/jobs/new");
    await fillJob(owner.page, {
      customer: "Vestlandske Entreprenørforretning og Byggevareimport Holding AS",
      address: "Kokstadflaten 7, 5257 Kokstad",
      start: "14:00",
      end: "17:00",
      vehicle: "Scania R650 med Hiab X-HiPro 1058 og grabb",
    });
    await expect(owner.page.getByRole("alert").filter({ has: owner.page.locator("ul") })).toBeVisible();
    await shootAllWidths(owner.page, "job-overlap", locale);
    await owner.page.locator('button[name="confirmOverlap"]').click();
    await owner.page.waitForURL(/\/app\/jobs\/[0-9a-f-]{36}\?added=1$/);

    await owner.page.goto("/app/jobs");
    await expect(owner.page.getByRole("listitem").filter({ hasText: "Kokstad" })).toHaveCount(2);
    await shootAllWidths(owner.page, "jobs", locale);
    await owner.page.goto("/app");
    await shootAllWidths(owner.page, "dashboard-jobs", locale);

    await owner.context.close();
  });
}
