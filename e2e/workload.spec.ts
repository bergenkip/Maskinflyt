import { expect, type Page, test } from "@playwright/test";
import {
  addCustomer,
  addVehicle,
  createCompany,
  locales,
  newCompanyName,
  newEmail,
  newPage,
  shootAllWidths,
  signUp,
  today,
} from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

async function addJob(page: Page, job: { start: string; hours: string; vehicle?: string }) {
  await page.goto("/app/jobs/new");
  await page.locator('select[name="customerId"]').selectOption({ label: "Nordbygg AS" });
  await page.locator('input[name="address"]').fill("Storgata 1, 0155 Oslo");
  await page.locator('input[name="date"]').fill(today);
  await page.locator('input[name="startTime"]').fill(job.start);
  await page.locator('input[name="durationHours"]').fill(job.hours);
  await page.locator('select[name="vehicleId"]').selectOption(job.vehicle ? { label: job.vehicle } : "");
  await page.getByRole("button", { name: "Add job" }).click();
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]{36}\?added=1$/);
}

test("the overview shows owners how much work today, this week and this month hold", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const owner = await newPage(browser, baseURL!, "en");
  const { page } = owner;
  await signUp(page, newEmail("workload-owner"), "Anna", "Berg");
  await createCompany(page, newCompanyName("workload"));
  await page.goto("/app/vehicles");
  await addVehicle(page, { type: "crane_truck", name: "Kranbil 1" });
  await expect(page.getByText("Kranbil 1 was added.")).toBeVisible();
  await addVehicle(page, { type: "excavator", name: "Graver 2" });
  await expect(page.getByText("Graver 2 was added.")).toBeVisible();
  await addCustomer(page, "Nordbygg AS");

  // Before any job the numbers are there, all zero.
  await page.goto("/app");
  const work = page.getByRole("region", { name: "Workload" });
  const todayCard = work.getByRole("link").filter({ hasText: "Today" });
  await expect(todayCard).toContainText("0 h");
  await expect(todayCard).toContainText("0 jobs");

  await addJob(page, { start: "07:00", hours: "4", vehicle: "Kranbil 1" });
  await addJob(page, { start: "12:00", hours: "2" });

  await page.goto("/app");
  for (const fact of ["6 h", "hours planned", "2 jobs", "0 of 2 done", "1 machine in use", "Invoiced (excl. VAT)"]) {
    await expect(todayCard).toContainText(fact);
  }
  // Busy = 4 machine hours of 2 machines × 8 hours, on a working day (Monday to Friday by default).
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (weekday >= 1 && weekday <= 5) await expect(todayCard).toContainText("25% booked");
  else await expect(todayCard).not.toContainText("booked");
  await expect(work.getByRole("link").filter({ hasText: "This week" })).toContainText("6 h");
  await expect(work.getByRole("link").filter({ hasText: "This month" })).toContainText("2 jobs");

  // The month's hours per day, also as a table for screen readers.
  const chart = work.getByRole("figure");
  await expect(chart).toContainText("Hours per day");
  await expect(chart).toContainText("Busiest day: 6 h");
  await expect(chart.getByRole("table")).toContainText("6 h");

  // A card opens the calendar on that day.
  await todayCard.click();
  await expect(page).toHaveURL(new RegExp(`/app/jobs/calendar\\?date=${today}&view=day$`));
  await expect(page.getByRole("list", { name: "Work this day" })).toContainText("2 jobs");
  await shootAllWidths(page, "calendar-day-workload", "en");
  await page.goto(`/app/jobs/calendar?date=${today}&view=week`);
  await shootAllWidths(page, "calendar-week-workload", "en");

  for (const locale of locales) {
    await owner.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await page.goto("/app");
    await shootAllWidths(page, "overview-workload", locale);
  }
  await owner.context.close();
});
