import { expect, test } from "@playwright/test";
import en from "../messages/en.json";
import lt from "../messages/lt.json";
import nb from "../messages/nb.json";

// The widths every screen must be checked at (see CLAUDE.md).
const widths = [375, 430, 768, 1280, 1440];
const messages = { nb, en, lt } as const;

for (const locale of Object.keys(messages) as (keyof typeof messages)[]) {
  for (const width of widths) {
    test(`pricing ${locale} @ ${width}px`, async ({
      page,
      context,
      baseURL,
    }) => {
      const t = messages[locale].Pricing;
      await context.addCookies([
        { name: "NEXT_LOCALE", value: locale, url: baseURL! },
      ]);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/priser");

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.title);
      for (const name of Object.values(t.plans)) {
        await expect(
          page.getByRole("heading", { level: 3, name, exact: true }),
        ).toBeVisible();
      }
      // Solo's monthly price, formatted for the language (290 kr / NOK 290).
      await expect(page.getByRole("main")).toContainText(/290/);
      await expect(page.getByRole("main")).toContainText(/3[\s ,.]?490/);
      await expect(page.getByRole("main")).toContainText(t.vatNotRegistered);

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, "page must not scroll sideways").toBeLessThanOrEqual(0);

      await page.screenshot({
        path: `test-results/screenshots/pricing-${locale}-${width}.png`,
        fullPage: true,
      });
    });
  }
}

test("pricing page is reachable from the footer and has prices for search engines", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: "NEXT_LOCALE", value: "nb", url: baseURL! },
  ]);
  await page.goto("/");
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: nb.Footer.pricing })
    .click();
  await expect(page).toHaveURL(/\/priser$/);
  await expect(page).toHaveTitle(nb.Pricing.metaTitle);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://maskingo.no/priser",
  );

  const data = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ??
      "{}",
  );
  expect(data.offers.map((offer: { price: number }) => offer.price)).toEqual([
    290, 790, 1790, 3490,
  ]);
});
