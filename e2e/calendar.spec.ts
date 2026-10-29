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

// Drags a job's bar (or its right edge) by a number of hours on the day timeline.
async function drag(page: Page, number: number, hours: number, edge = false) {
  const bar = page.locator(`[data-job="${number}"]`);
  const track = await bar.locator("xpath=..").boundingBox();
  const hourWidth = track!.width / 14; // 06–20
  const grip = await (edge ? bar.locator("[data-resize]") : bar).boundingBox();
  const x = grip!.x + (edge ? grip!.width / 2 : 20);
  const y = grip!.y + grip!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + (hourWidth * hours) / 2, y, { steps: 5 });
  await page.mouse.move(x + hourWidth * hours, y, { steps: 5 });
  await page.mouse.up();
}

test("the calendar shows a month, a week and a day, and jobs are moved and made longer by dragging", async ({
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
  await addJob(page, { start: "13:00", hours: "2", vehicle: "Kranbil 1" });

  // From the list to the calendar, which opens on the month.
  await page.goto("/app/jobs");
  await page.getByRole("navigation", { name: "Show jobs as" }).getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Calendar");
  await page.goto(`/app/jobs/calendar?date=${day}`);
  await expect(page.getByRole("heading", { level: 2, name: "May 2030" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Monday, May 6: 3 jobs" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tuesday, May 7: no jobs" })).toBeVisible();
  await page.getByRole("link", { name: "Next month" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "June 2030" })).toBeVisible();

  // The week: a box per day with its jobs.
  await page.goto(`/app/jobs/calendar?date=${day}&view=week`);
  await expect(page.getByRole("heading", { level: 2, name: /^Week 19 · / })).toBeVisible();
  const monday = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Open Monday, May 6" }) });
  await expect(monday.getByRole("link", { name: /^Edit job \d, Nordbygg AS/ })).toHaveCount(3);
  await expect(monday).toContainText("Kranbil 1");
  await expect(monday).toContainText("Sander Lie");
  await expect(monday).toContainText("No machine");

  // The day: machines with their drivers, and the job without a machine at the top.
  await monday.getByRole("link", { name: "Open Monday, May 6" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Monday, May 6" })).toBeVisible();
  const kranbil = page.getByRole("group", { name: "Kranbil 1" });
  await expect(kranbil).toContainText("Sander Lie");
  await expect(kranbil.getByRole("link", { name: /^Edit job 1, Nordbygg AS, 07:00/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "1 job without a machine" })).toContainText("Not planned");

  // Dragged an hour later; then undone.
  await drag(page, 1, 1);
  await expect(page.getByText(/^Job 1 moved to 08:00 AM–~12:00 PM\.$/)).toBeVisible();
  await expect(kranbil.getByRole("link", { name: /^Edit job 1, Nordbygg AS, 08:00 AM/ })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(/^Job 1 moved to 07:00 AM–~11:00 AM\.$/)).toBeVisible();

  // Made an hour longer by its right edge; it stays so after a reload.
  await drag(page, 1, 1, true);
  await expect(page.getByText(/^Job 1 moved to 07:00 AM–~12:00 PM\.$/)).toBeVisible();
  await page.reload();
  await expect(kranbil.getByRole("link", { name: /^Edit job 1, Nordbygg AS, 07:00 AM–~12:00 PM/ })).toBeVisible();

  // Onto a time when the machine is busy: a warning first, and nothing moves on "Don't move".
  await drag(page, 3, -2);
  const warning = page.getByRole("alert").filter({ hasText: "already busy at this time" });
  await expect(warning).toContainText("Kranbil 1 is on job 1 for Nordbygg AS");
  await warning.getByRole("button", { name: "Don't move" }).click();
  await expect(warning).toHaveCount(0);
  await expect(kranbil.getByRole("link", { name: /^Edit job 3, Nordbygg AS, 01:00 PM/ })).toBeVisible();

  // The pencil opens the job to edit.
  await kranbil.getByRole("link", { name: /^Edit job 3,/ }).click();
  await expect(page.locator('input[name="startTime"]')).toHaveValue("13:00");

  // A free machine: the new job has the day, a start and the machine filled in.
  await page.goto(`/app/jobs/calendar?date=${day}&view=day`);
  await page.getByRole("link", { name: "New job for Graver 2" }).click();
  await expect(page).toHaveURL(/\/app\/jobs\/new\?date=2030-05-06&start=07%3A00&vehicle=[0-9a-f-]{36}$/);
  await expect(page.locator('input[name="date"]')).toHaveValue(day);
  await expect(page.locator('input[name="startTime"]')).toHaveValue("07:00");
  await expect(page.locator('select[name="vehicleId"] option:checked')).toHaveText("Graver 2");

  // On a phone the day is a list per machine, with the same jobs and pencils.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/app/jobs/calendar?date=${day}&view=day`);
  const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Kranbil 1" }) });
  await expect(card.getByRole("link", { name: /^Edit job 1, Nordbygg AS, 07:00/ })).toBeVisible();
  await expect(card.getByRole("link", { name: "New job for Kranbil 1" })).toBeVisible();

  // Drivers do not plan, so the calendar leads back to the overview.
  await driver.page.goto("/app/jobs/calendar");
  await expect(driver.page).toHaveURL(/\/app$/);

  await owner.context.close();
  await driver.context.close();
});
