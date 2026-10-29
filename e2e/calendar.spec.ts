import { expect, type Page, test } from "@playwright/test";
import { addVehicle, createCompany, inviteColleague, newCompanyName, newEmail, newPage, signUp } from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

// A Monday well ahead (ISO week 19), so the jobs are always "upcoming".
const day = "2030-05-06";

async function addJob(page: Page, job: { start: string; hours: string; vehicle?: string; driver?: string }) {
  await page.goto("/app/jobs/new");
  await page.locator('select[name="customerId"]').selectOption({ label: "Nordbygg AS" });
  await page.locator('input[name="address"]').fill("Storgata 1, 0155 Oslo");
  await page.locator('input[name="date"]').fill(day);
  await page.locator('input[name="startTime"]').fill(job.start);
  await page.locator('input[name="durationHours"]').fill(job.hours);
  if (job.driver) await page.locator('select[name="driverId"]').selectOption({ label: job.driver });
  await page.locator('select[name="vehicleId"]').selectOption(job.vehicle ? { label: job.vehicle } : "");
  await page.getByRole("button", { name: "Add job" }).click();
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]{36}\?added=1$/);
}

test("the calendar shows jobs by machine and driver, by day and week, and a free slot starts a new job", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const owner = await newPage(browser, baseURL!, "en");
  const { page } = owner;
  await signUp(page, newEmail("calendar-owner"), "Anna", "Berg");
  await createCompany(page, newCompanyName("calendar"));
  await page.goto("/app/vehicles");
  await addVehicle(page, { type: "crane_truck", name: "Kranbil 1" });
  await expect(page.getByText("Kranbil 1 was added.")).toBeVisible();
  await addVehicle(page, { type: "excavator", name: "Graver 2" });
  await expect(page.getByText("Graver 2 was added.")).toBeVisible();
  await page.goto("/app/customers/new");
  await page.locator('input[name="name"]').fill("Nordbygg AS");
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForURL(/\/app\/customers\/[0-9a-f-]{36}\?added=1$/);
  const driver = await inviteColleague(browser, baseURL!, page, "driver", "Sander", "Lie");

  await addJob(page, { start: "07:00", hours: "4", vehicle: "Kranbil 1", driver: "Sander Lie" });
  await addJob(page, { start: "12:00", hours: "2" });

  // From the list to the calendar.
  await page.goto("/app/jobs");
  await page.getByRole("navigation", { name: "Show jobs as" }).getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Calendar");

  // The day by machine: job 1 on Kranbil 1's row, job 2 waiting for a machine at the top.
  await page.goto(`/app/jobs/calendar?date=${day}`);
  await expect(page.getByRole("heading", { level: 2, name: /^Monday/ })).toBeVisible();
  await expect(page.getByRole("group", { name: "Kranbil 1" }).getByRole("link", { name: /^Job 1, Nordbygg AS, 07:00/ })).toBeVisible();
  await expect(page.getByRole("group", { name: "Graver 2" }).getByRole("link", { name: /^Job/ })).toHaveCount(0);
  const unassigned = page.getByRole("region", { name: "1 job without a machine" });
  await expect(unassigned).toContainText("Nordbygg AS");
  await expect(unassigned).toContainText("Not planned");

  // A free machine: the new job has the day, a start and the machine filled in.
  await page.getByRole("link", { name: "New job for Graver 2" }).click();
  await expect(page).toHaveURL(/\/app\/jobs\/new\?date=2030-05-06&start=07%3A00&vehicle=[0-9a-f-]{36}$/);
  await expect(page.locator('input[name="date"]')).toHaveValue(day);
  await expect(page.locator('input[name="startTime"]')).toHaveValue("07:00");
  await expect(page.locator('select[name="vehicleId"] option:checked')).toHaveText("Graver 2");
  await expect(page.locator('select[name="driverId"] option:checked')).toHaveText("Not chosen yet");

  // By driver: a person's slot also fills in the machine they usually drive.
  await page.goto(`/app/jobs/calendar?date=${day}`);
  await page.getByRole("navigation", { name: "Rows" }).getByRole("link", { name: "Drivers" }).click();
  await expect(page.getByRole("region", { name: "1 job without a driver" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Sander Lie" }).getByRole("link", { name: /^Job 1,/ })).toBeVisible();
  await expect(page.getByRole("group", { name: "Anna Berg" })).toBeVisible();
  await page.getByRole("link", { name: "New job for Sander Lie" }).click();
  await expect(page.locator('select[name="driverId"] option:checked')).toHaveText("Sander Lie");
  await expect(page.locator('select[name="vehicleId"] option:checked')).toHaveText("Kranbil 1");

  // The week: job 1 on Monday in Kranbil 1's row; the next week is empty.
  await page.goto(`/app/jobs/calendar?date=${day}`);
  await page.getByRole("navigation", { name: "Show", exact: true }).getByRole("link", { name: "Week" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /^Week 19 · / })).toBeVisible();
  const row = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Kranbil 1" }) });
  await expect(row.getByRole("link", { name: /^Job 1,/ })).toBeVisible();
  await page.getByRole("link", { name: "Next week" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /^Week 20 · / })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Job 1,/ })).toHaveCount(0);

  // On a phone the day is a list per machine, with the same jobs.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/app/jobs/calendar?date=${day}`);
  const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Kranbil 1" }) });
  await expect(card).toContainText("Nordbygg AS");
  await expect(card).toContainText("07:00");
  await expect(card.getByRole("link", { name: "New job for Kranbil 1" })).toBeVisible();

  // Drivers do not plan, so the calendar leads back to the overview.
  await driver.page.goto("/app/jobs/calendar");
  await expect(driver.page).toHaveURL(/\/app$/);

  await owner.context.close();
  await driver.context.close();
});
