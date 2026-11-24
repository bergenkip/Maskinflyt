import { expect, test } from "@playwright/test";
import { createCompany, locales, newCompanyName, newEmail, newPage, shootAllWidths, signUp } from "./helpers";

// Stage 15a: the company's public page. Needs a running Supabase (the e2e-auth CI job).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

test("the owner writes and publishes the company page, and a visitor sees it", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const { page } = await newPage(browser, baseURL!, "en");
  await signUp(page, newEmail("page"), "Anna", "Berg");
  const name = newCompanyName("page");
  await createCompany(page, name);

  await page.goto("/app/settings");
  await page.getByRole("link", { name: "Open the company page" }).click();
  await page.waitForURL("**/app/public-page");
  const slug = await page.getByLabel("Address").inputValue();
  expect(slug).toMatch(/^e2e-page-\d+-[a-z0-9]+-as$/);

  // Publishing an empty page says what is missing, next to each field.
  await page.getByText("Show publicly").click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Write a few words about the company before showing the page.")).toBeVisible();
  await expect(page.getByText("Choose at least one service before showing the page.")).toBeVisible();
  await expect(page.getByText("Enter a phone or e-mail so customers can reach you.")).toBeVisible();

  // Saved hidden first: only the company sees a preview; visitors get "not found".
  await page.getByLabel("About the company").fill("Kranbil med fører i Bergen og omegn.\nVi løfter alt fra takstein til båter.");
  await page.getByText("Crane truck", { exact: true }).click();
  await page.getByText("Transport", { exact: true }).click();
  await page.getByLabel("Town or city").fill("Bergen");
  await page.getByLabel("Area you work in (optional)").fill("Bergen og omegn");
  await page.getByLabel("Phone").fill("912 34 567");
  await page.getByLabel("Website (optional)").fill("example.com");
  if (await page.getByLabel("Show publicly").isChecked()) await page.getByText("Show publicly").click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. The page is hidden from others.")).toBeVisible();

  const visitor = await newPage(browser, baseURL!, "en");
  const hidden = await visitor.page.goto(`/firma/${slug}`);
  expect(hidden?.status()).toBe(404);

  await page.goto(`/firma/${slug}`);
  await expect(page.getByText("Preview: the page is not public yet. Only your company sees it.")).toBeVisible();

  // Published: everyone sees it, with a link to call and the services.
  await page.goto("/app/public-page");
  await page.getByText("Show publicly").click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. The page is public.")).toBeVisible();

  await visitor.page.goto(`/firma/${slug}`);
  await expect(visitor.page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(visitor.page.getByRole("link", { name: "912 34 567" })).toHaveAttribute("href", "tel:91234567");
  await expect(visitor.page.getByRole("listitem").filter({ hasText: "Crane truck" })).toBeVisible();
  await expect(visitor.page.getByRole("link", { name: "example.com" })).toHaveAttribute("href", "https://example.com");
  await expect(visitor.page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  await expect(visitor.page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://maskingo.no/firma/${slug}`);

  for (const locale of locales) {
    await visitor.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await visitor.page.goto(`/firma/${slug}`);
    await shootAllWidths(visitor.page, "company-page", locale);
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await page.goto("/app/public-page");
    await shootAllWidths(page, "company-page-settings", locale);
  }
});
