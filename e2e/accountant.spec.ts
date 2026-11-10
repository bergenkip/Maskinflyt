import { expect, test } from "@playwright/test";
import {
  addCustomer,
  addMachine,
  addTodaysJob,
  approveTime,
  createCompany,
  driveThrough,
  fillSignUp,
  locales,
  newCompanyName,
  newEmail,
  newPage,
  passSecondStep,
  shootAllWidths,
  signUp,
} from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

test("the accountant finishes the invoicing of finished jobs and sees nothing of the planning", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const owner = await newPage(browser, baseURL!, "en");
  await signUp(owner.page, newEmail("acc-owner"), "Anna", "Berg");
  await createCompany(owner.page, newCompanyName("accountant"));
  await addMachine(owner.page, { name: "Kranbil 1", rate: "1200", minHours: "", from: "15:00", percent: "50" });
  await addCustomer(owner.page, "Nordbygg AS");
  const done = await addTodaysJob(owner.page, {
    customer: "Nordbygg AS",
    vehicle: "Kranbil 1",
    driver: "Anna Berg",
    address: "Storgata 1, 0155 Oslo",
    contact: "Per, 912 34 567",
  });
  await driveThrough(owner.page);
  const planned = await addTodaysJob(owner.page, {
    customer: "Nordbygg AS",
    vehicle: "Kranbil 1",
    driver: "Anna Berg",
    address: "Kirkegata 2, 0153 Oslo",
    contact: "Per, 912 34 567",
  });

  // Invited as accountant; like owners and admins, the accountant confirms by e-mail.
  await owner.page.goto("/app/team");
  await owner.page.getByLabel("Role", { exact: true }).selectOption("accountant");
  await owner.page.locator('main form button[type="submit"]').first().click();
  const link = owner.page.getByText(/\/join\/[0-9a-f]{64}$/);
  await expect(link).toBeVisible();
  const accountant = await newPage(browser, baseURL!, "en");
  const { page } = accountant;
  await page.goto(new URL((await link.textContent())!.trim()).pathname);
  await fillSignUp(page, newEmail("accountant"), "Kari", "Regnskap");
  await page.waitForURL((url) => url.pathname === "/mfa");
  await passSecondStep(page);
  await expect(page.getByText("Your role: Accountant")).toBeVisible();

  // The invoices, not the planning.
  const menu = page.getByRole("navigation", { name: "Main menu" });
  await expect(menu.getByRole("link", { name: "Invoices" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Jobs" })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "Customers" })).toHaveCount(0);
  await page.goto("/app/jobs");
  await expect(page).toHaveURL(/\/app$/);
  // The app streams behind a loading screen, so the answer is 200 with Next's not-found page.
  await page.goto(planned);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Invoice draft" })).toHaveCount(0);
  await page.goto("/app");
  // The bell, not the menu tab that goes to the same page.
  const bell = page.locator('header a[href="/app/invoices"][aria-label]');
  await expect(bell).toHaveAccessibleName("Invoices: 1 job waits");

  // A finished job: only its time and its invoice.
  await page.goto("/app/invoices");
  await page.getByRole("region", { name: "Working time waits for approval (1)" }).getByRole("link").click();
  await expect(page.getByRole("link", { name: "All invoices" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Details" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Status" })).toHaveCount(0);
  await approveTime(page, done, { start: "07:00", end: "17:00", breaks: "30" });
  const section = page.getByRole("region", { name: "Invoice draft" });
  await section.getByText("Add a line", { exact: true }).click();
  await section.locator('input[name="description"]').fill("Bompenger");
  await section.locator('input[name="unitPrice"]').fill("80");
  await section.locator('select[name="vatRate"]').selectOption("0");
  await section.getByRole("button", { name: "Add line" }).click();
  await expect(section.getByRole("listitem").filter({ hasText: "Bompenger" })).toContainText("NOK 80.00");
  await expect(section).toContainText("NOK 15,830.00");
  await section.getByText("Sent from another accounting system instead?").click();
  await section.getByLabel("Invoice number (optional)").fill("1042");
  await section.getByRole("button", { name: "Mark as sent" }).click();
  await expect(section.getByText("Marked as sent", { exact: true })).toBeVisible();
  await expect(bell).toHaveAccessibleName("Invoices");

  // The same screens in every language and width.
  for (const locale of locales) {
    await accountant.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await page.goto(done);
    await shootAllWidths(page, "accountant-job", locale);
    await page.goto("/app/invoices");
    await shootAllWidths(page, "accountant-invoices", locale);
  }

  await accountant.context.close();
  await owner.context.close();
});
