import { expect, test } from "@playwright/test";
import { createCompany, locales, newCompanyName, newEmail, newPage, shootAllWidths, signUp } from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI). Stripe is
// not set up in CI, so the page must say so instead of offering buttons that do nothing.
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

test("a new company tries MaskinGo for 30 days and sees the plans", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const { page } = await newPage(browser, baseURL!, "en");
  await signUp(page, newEmail("billing"), "Anna", "Berg");
  await createCompany(page, newCompanyName("billing"));

  // 30 days left: no reminder above the pages yet.
  await expect(page.getByRole("link", { name: "Choose a plan" })).toHaveCount(0);

  await page.goto("/app/settings");
  await page.getByRole("link", { name: "Open the subscription" }).click();
  await page.waitForURL("**/app/billing");
  await expect(page.getByRole("heading", { level: 2, name: "Free trial: 30 days left" })).toBeVisible();
  await expect(page.getByText("1 person in the company")).toBeVisible();
  await expect(page.getByText("Payments are not switched on yet.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveText(["Solo", "Start", "Pro", "Bedrift"]);
  await expect(page.getByText("NOK 290")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Choose / })).toHaveCount(0);

  await page.getByRole("link", { name: "Yearly: 2 months free" }).click();
  await expect(page.getByText("NOK 2,900")).toBeVisible();

  for (const locale of locales) {
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await page.goto("/app/billing");
    await shootAllWidths(page, "billing", locale);
  }
});
