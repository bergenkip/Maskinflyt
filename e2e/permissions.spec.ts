import { expect, type Page, test } from "@playwright/test";
import {
  addMachine,
  createCompany,
  inviteColleague,
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

// The owner ticks a member's extra rights on the team page and saves them.
async function giveRights(owner: Page, name: string, rights: string[]) {
  await owner.goto("/app/team");
  const member = owner.getByRole("listitem").filter({ hasText: name });
  const details = member.locator("details");
  if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
  const form = member.getByRole("group", { name: `Extra rights for ${name}` });
  for (const box of await form.getByRole("checkbox").all()) {
    const label = (await box.getAttribute("value"))!;
    await box.setChecked(rights.includes(label));
  }
  await member.getByRole("button", { name: "Save rights" }).click();
  await expect(member.getByRole("status")).toHaveText("Rights saved. They apply from the person's next page.");
}

test("an owner gives a driver extra rights, and they add exactly that", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const owner = await newPage(browser, baseURL!, "en");
  await signUp(owner.page, newEmail("rights-owner"), "Anna", "Berg");
  await createCompany(owner.page, newCompanyName("rights"));
  await addMachine(owner.page, { name: "Kranbil 1", rate: "1200", minHours: "", from: "15:00", percent: "50" });
  const driver = await inviteColleague(browser, baseURL!, owner.page, "driver", "Sander", "Lie");
  const { page } = driver;
  const menu = page.getByRole("navigation", { name: "Main menu" });

  // A plain driver: own jobs only.
  await expect(menu.getByRole("link", { name: "Jobs", exact: true })).toHaveCount(0);
  await page.goto("/app/vehicles");
  await expect(page).toHaveURL(/\/app$/);

  // Planning: like a dispatcher, so no second step.
  await giveRights(owner.page, "Sander Lie", ["plan_jobs"]);
  await expect(owner.page.getByRole("listitem").filter({ hasText: "Sander Lie" })).toContainText("Also: Plan jobs");
  await page.goto("/app");
  await expect(menu.getByRole("link", { name: "Jobs", exact: true })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Customers" })).toBeVisible();
  await page.goto("/app/jobs/new");
  await expect(page.getByRole("button", { name: "Add job" })).toBeVisible();
  await page.goto("/app/vehicles");
  await expect(page.getByText("Kranbil 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add machine" })).toHaveCount(0);

  // Machines and prices instead: the second step first, then the machine list can be changed.
  await giveRights(owner.page, "Sander Lie", ["machines"]);
  await page.goto("/app/vehicles");
  await page.waitForURL((url) => url.pathname === "/mfa");
  await passSecondStep(page);
  await expect(menu.getByRole("link", { name: "Jobs", exact: true })).toHaveCount(0);
  await page.goto("/app/vehicles");
  await expect(page.getByRole("button", { name: "Add machine" })).toBeVisible();

  // Rights taken back: the plain driver again.
  await giveRights(owner.page, "Sander Lie", []);
  await page.goto("/app/vehicles");
  await expect(page).toHaveURL(/\/app$/);

  // The team page with the rights open, in every language and width.
  await giveRights(owner.page, "Sander Lie", ["plan_jobs", "invite"]);
  for (const locale of locales) {
    await owner.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await owner.page.goto("/app/team");
    await owner.page.getByRole("listitem").filter({ hasText: "Sander Lie" }).scrollIntoViewIfNeeded();
    await shootAllWidths(owner.page, "team-rights", locale);
  }

  await driver.context.close();
  await owner.context.close();
});
