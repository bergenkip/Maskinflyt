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
