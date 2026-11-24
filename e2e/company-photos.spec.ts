import { expect, type Locator, test } from "@playwright/test";
import path from "node:path";
import { createCompany, locales, newCompanyName, newEmail, newPage, shootAllWidths, signUp } from "./helpers";

// Stage 15a+: the logo and photos on the company page. Needs Supabase with Storage (the e2e-auth CI job).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

const photo = (name: string) => path.join(process.cwd(), "public", "photos", name);

async function loaded(image: Locator) {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
}

test("the owner adds a logo and photos; visitors see them only on the published page", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const { page } = await newPage(browser, baseURL!, "en");
  await signUp(page, newEmail("photos"), "Anna", "Berg");
  const name = newCompanyName("photos");
  await createCompany(page, name);

  await page.goto("/app/public-page");
  const slug = await page.getByLabel("Address").inputValue();
  await page.getByLabel("About the company").fill("Kranbil med fører i Bergen.");
  await page.getByRole("checkbox", { name: "Crane truck" }).check();
  await page.getByLabel("Town or city").fill("Bergen");
  await page.getByLabel("Phone").fill("912 34 567");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. The page is hidden from others.")).toBeVisible();

  // The logo: a PNG with the page's own picture; the photos: real JPEG-sized pictures.
  const logo = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 300, height: 300 } });
  await page.locator("label").filter({ hasText: "Choose a logo" }).locator('input[type="file"]')
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: logo });
  await loaded(page.getByRole("img", { name: "The company's logo" }));
  await expect(page.locator("label").filter({ hasText: "Change the logo" })).toBeVisible();

  const add = page.locator("label").filter({ hasText: "Add a photo" }).locator('input[type="file"]');
  await add.setInputFiles(photo("kranbil-fjord.webp"));
  await expect(page.getByRole("img", { name: "Photo 1" })).toBeVisible();
  await add.setInputFiles(photo("gravemaskin.webp"));
  await loaded(page.getByRole("img", { name: "Photo 2" }));

  // A description for the second photo, then it moves first.
  await page.getByLabel("What photo 2 shows (optional)").fill("Gravemaskin på byggeplass");
  await page.getByRole("listitem").filter({ has: page.getByLabel("What photo 2 shows (optional)") }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("img", { name: "Gravemaskin på byggeplass" })).toBeVisible();
  await page.getByRole("button", { name: "Move photo 2 earlier" }).click();
  await expect(page.getByLabel("What photo 1 shows (optional)")).toHaveValue("Gravemaskin på byggeplass");

  // Hidden page: a visitor sees nothing at all.
  const visitor = await newPage(browser, baseURL!, "en");
  expect((await visitor.page.goto(`/firma/${slug}`))?.status()).toBe(404);

  // Published: the visitor sees the logo and both photos, in the chosen order.
  await page.getByRole("checkbox", { name: "Show publicly" }).check();
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved. The page is public.")).toBeVisible();
  await visitor.page.goto(`/firma/${slug}`);
  await loaded(visitor.page.getByRole("img", { name: `${name} logo` }));
  const gallery = visitor.page.getByRole("region", { name: "Photos" }).getByRole("img");
  await expect(gallery).toHaveCount(2);
  await expect(gallery.first()).toHaveAttribute("alt", "Gravemaskin på byggeplass");
  await expect(gallery.nth(1)).toHaveAttribute("alt", `Photo 2 from ${name}`);
  await loaded(gallery.nth(1));
  // The pictures come through short-lived private links, not a public address.
  expect(await gallery.first().getAttribute("src")).toMatch(/\/storage\/v1\/object\/sign\/company-photos\/.+\?token=/);

  for (const locale of locales) {
    await visitor.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await visitor.page.goto(`/firma/${slug}`);
    await loaded(visitor.page.locator("main img").last());
    await shootAllWidths(visitor.page, "company-photos", locale);
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await page.goto("/app/public-page");
    await expect(page, "the owner stays on the company page settings").toHaveURL(/\/app\/public-page$/);
    await shootAllWidths(page, "company-photos-settings", locale);
  }

  // Removing a photo takes it off the page.
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await page.goto("/app/public-page");
  await page.getByRole("listitem").filter({ has: page.getByLabel("What photo 2 shows (optional)") }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByLabel("What photo 2 shows (optional)")).toHaveCount(0);
  await visitor.context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await visitor.page.goto(`/firma/${slug}`);
  await expect(visitor.page.getByRole("region", { name: "Photos" }).getByRole("img")).toHaveCount(1);
});
