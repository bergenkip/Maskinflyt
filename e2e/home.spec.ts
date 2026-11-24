import { expect, test } from "@playwright/test";

// The widths every screen must be checked at (see CLAUDE.md).
const widths = [375, 430, 768, 1280, 1440];

const titles = {
  nb: "Fra telefon til faktura samme dag",
  en: "From phone call to invoice the same day",
  lt: "Nuo skambučio iki sąskaitos tą pačią dieną",
} as const;

const locales = Object.keys(titles) as (keyof typeof titles)[];

for (const locale of locales) {
  for (const width of widths) {
    test(`home ${locale} @ ${width}px`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");

      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(titles[locale]);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "page must not scroll sideways").toBeLessThanOrEqual(0);

      const select = await page.getByRole("combobox").boundingBox();
      expect(select?.height ?? 0, "tap target at least 44px").toBeGreaterThanOrEqual(44);
      const fontSize = await page
        .getByRole("combobox")
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(fontSize, "16px+ so iPhone Safari does not zoom").toBeGreaterThanOrEqual(16);

      // The start page leads to sign-up and shows how to reach us.
      const main = page.getByRole("main");
      await expect(main.locator('a[href="/signup"]').first()).toBeVisible();
      await expect(main.locator('a[href="/login"]')).toBeVisible();
      await expect(main.locator('a[href="mailto:hei@maskingo.no"]')).toBeVisible();
      await expect(main.getByRole("heading", { level: 3 })).toHaveCount(9);
      for (const link of await main.getByRole("link").all()) {
        const box = await link.boundingBox();
        expect(box?.height ?? 0, "button at least 44px tall").toBeGreaterThanOrEqual(44);
      }

      // The app screens are in the page's language, loaded and not stretched.
      const screens = main.locator("figure img");
      await expect(screens).toHaveCount(2);
      for (const img of await screens.all()) {
        await expect(img).toHaveAttribute("alt", /.{20,}/);
        await expect(img).toHaveAttribute("src", new RegExp(`-${locale}\\.webp`));
        await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
        const ratio = await img.evaluate((el: HTMLImageElement) => {
          const r = el.getBoundingClientRect();
          return r.width / r.height / (el.naturalWidth / el.naturalHeight);
        });
        expect(Math.abs(ratio - 1), "image keeps its proportions").toBeLessThan(0.02);
      }

      // Every trade card has its photo, loaded.
      const photos = main.locator('nav[aria-labelledby="industries-title"] img');
      await expect(photos).toHaveCount(3);
      for (const img of await photos.all()) {
        await img.scrollIntoViewIfNeeded();
        await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      }

      await page.screenshot({
        path: `test-results/screenshots/home-${locale}-${width}.png`,
        fullPage: true,
      });
    });
  }
}

test("browser language is used before anything is chosen", async ({ browser }) => {
  const context = await browser.newContext({ locale: "lt-LT" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "lt");
  await context.close();
});

test("unsupported browser language falls back to Norwegian", async ({ browser }) => {
  const context = await browser.newContext({ locale: "de-DE" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "nb");
  await context.close();
});

test("language switcher changes the language and remembers it", async ({ browser }) => {
  const context = await browser.newContext({ locale: "nb-NO" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(titles.nb);

  await page.getByLabel("Språk").selectOption("en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(titles.en);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(titles.en);
  await expect(page.getByLabel("Language")).toHaveValue("en");
  await context.close();
});
