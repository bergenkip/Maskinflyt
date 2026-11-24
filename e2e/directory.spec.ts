import { expect, test } from "@playwright/test";
import { createCompany, locales, newCompanyName, newEmail, newPage, shootAllWidths, signUp } from "./helpers";

// Stage 15d: a published company page is listed in the catalog (/finn) and
// found by service and place; a hidden one is not. Needs Supabase (the e2e-auth CI job).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

test("a published company is found in the catalog by service and place", async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const { page } = await newPage(browser, baseURL!, "en");
  await signUp(page, newEmail("catalog"), "Anna", "Berg");
  const name = newCompanyName("catalog");
  await createCompany(page, name);
  // A place no other test uses, so the search finds this company alone.
  const city = `Testvik ${Date.now().toString(36)}`;

  await page.goto("/app/public-page");
  await page.getByLabel("About the company").fill("Kranbil og maskintransport på Vestlandet.");
  await page.getByRole("checkbox", { name: "Crane truck" }).check();
  await page.getByRole("checkbox", { name: "Machine transport" }).check();
  await page.getByLabel("Town or city").fill(city);
  await page.getByLabel("Phone").fill("912 34 567");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved. The page is hidden from others.")).toBeVisible();

  // Hidden: not in the catalog.
  const visitor = await newPage(browser, baseURL!, "en");
  await visitor.page.goto(`/finn?sted=${encodeURIComponent(city)}`);
  await expect(visitor.page.getByRole("heading", { level: 2, name: "No companies" })).toBeVisible();

  await page.getByRole("checkbox", { name: "Show publicly" }).check();
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved. The page is public.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Shown in the MaskinGo catalog")).toBeVisible();
  await expect(page.getByRole("link", { name: "See it in the catalog" })).toHaveAttribute(
    "href",
    `/finn/kranbil?${new URLSearchParams({ sted: city })}`,
  );

  // The visitor searches by service and place: the form leads to the service's own address.
  await visitor.page.goto("/finn");
  await expect(visitor.page.getByRole("heading", { level: 1, name: "Find a company" })).toBeVisible();
  const search = visitor.page.getByRole("search", { name: "Search the catalog" });
  await search.getByLabel("Service").selectOption({ label: "Machine transport" });
  await search.getByLabel("Place").fill(city.toUpperCase());
  await search.getByRole("button", { name: "Search" }).click();
  await visitor.page.waitForURL(/\/finn\/maskintransport\?sted=/);
  await expect(visitor.page.getByRole("heading", { level: 1 })).toHaveText(`Machine transport in ${city.toUpperCase()}`);
  await expect(visitor.page.getByRole("heading", { level: 2, name: "1 company" })).toBeVisible();
  const card = visitor.page.getByRole("article").filter({ hasText: name });
  await expect(card.getByText("Kranbil og maskintransport på Vestlandet.")).toBeVisible();
  await expect(card.getByText(city)).toBeVisible();

  // Another service: not listed there.
  await visitor.page.goto(`/finn/riving?sted=${encodeURIComponent(city)}`);
  await expect(visitor.page.getByRole("heading", { level: 2, name: "No companies" })).toBeVisible();
  await expect(visitor.page.getByText("No companies match yet. Try another place or all services.")).toBeVisible();

  // The catalog in every language, then the card leads to the page and back.
  for (const locale of locales) {
    await visitor.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await visitor.page.goto(`/finn/kranbil?sted=${encodeURIComponent(city)}`);
    await shootAllWidths(visitor.page, "directory", locale);
  }
  await visitor.context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await visitor.page.goto(`/finn/kranbil?sted=${encodeURIComponent(city)}`);
  await expect(visitor.page.locator("html")).toHaveAttribute("lang", "en");
  await visitor.page.getByRole("link", { name }).click();
  await visitor.page.waitForURL("**/firma/**");
  await expect(visitor.page.getByRole("heading", { level: 1, name })).toBeVisible();
  await visitor.page.getByRole("link", { name: "Find more companies" }).click();
  await visitor.page.waitForURL(/\/finn$/);

  // A service that does not exist is not a page.
  const missing = await visitor.page.goto("/finn/rakett");
  expect(missing?.status()).toBe(404);
});
