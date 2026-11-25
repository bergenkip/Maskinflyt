import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import lt from "../messages/lt.json";
import nb from "../messages/nb.json";

// The widths every screen must be checked at (see CLAUDE.md).
const widths = [375, 430, 768, 1280, 1440];
const messages = { nb, en, lt } as const;
const guides = {
  timesheet: "/guider/timeliste-anlegg",
  invoicing: "/guider/fakturere-maskintimer",
  minimumTime: "/guider/minstetid-kveldstillegg-kranbil",
} as const;

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page must not scroll sideways").toBeLessThanOrEqual(0);
}

for (const locale of Object.keys(messages) as (keyof typeof messages)[]) {
  for (const width of widths) {
    test(`guides list ${locale} @ ${width}px`, async ({ page, context, baseURL }) => {
      const t = messages[locale].Guides;
      await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/guider");

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.title);
      for (const path of Object.values(guides)) {
        await expect(page.getByRole("main").locator(`a[href="${path}"]`)).toBeVisible();
      }
      await expectNoSidewaysScroll(page);
      await page.screenshot({ path: `test-results/screenshots/guides-${locale}-${width}.png`, fullPage: true });
    });

    for (const [guide, path] of Object.entries(guides) as [keyof typeof guides, string][]) {
      test(`guide ${guide} ${locale} @ ${width}px`, async ({ page, context, baseURL }) => {
        const t = messages[locale].Guides[guide];
        await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);

        await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.title);
        const main = page.getByRole("main");
        for (const section of t.sections) {
          await expect(main.getByRole("heading", { level: 2, name: section.heading })).toBeVisible();
        }
        await expect(main).toContainText(t.faq[0].q);
        // Back to the list, on to the other two guides, and the free trial.
        await expect(main.locator('a[href="/guider"]')).toBeVisible();
        for (const other of Object.values(guides).filter((p) => p !== path)) {
          await expect(main.locator(`a[href="${other}"]`)).toBeVisible();
        }
        await expect(main.locator('a[href="/signup"]').first()).toBeVisible();

        // The example table fits the screen; on a phone it is shown as cards instead.
        if (guide === "timesheet") {
          await expect(main.locator("table")).toBeVisible({ visible: width >= 640 });
          await expect(main.locator("figure li").first()).toBeVisible({ visible: width < 640 });
        }
        for (const box of await main.locator("table").locator("..").all()) {
          const hidden = await box.evaluate((el) => el.scrollWidth - el.clientWidth);
          expect(hidden, "table must fit without scrolling").toBeLessThanOrEqual(0);
        }
        await expectNoSidewaysScroll(page);
        await page.screenshot({ path: `test-results/screenshots/guide-${guide}-${locale}-${width}.png`, fullPage: true });
      });
    }
  }
}

test("guide has its own title, description, canonical and structured data", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "nb", url: baseURL! }]);
  await page.goto(guides.invoicing);

  await expect(page).toHaveTitle(nb.Guides.invoicing.metaTitle);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    nb.Guides.invoicing.metaDescription,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://maskingo.no/guider/fakturere-maskintimer",
  );

  const data = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  const types = data["@graph"].map((item: { "@type": string }) => item["@type"]);
  expect(types).toEqual(["Article", "BreadcrumbList", "FAQPage"]);
  expect(data["@graph"][0].headline).toBe(nb.Guides.invoicing.title);
  expect(data["@graph"][2].mainEntity).toHaveLength(nb.Guides.invoicing.faq.length);
});

test("an unknown guide is not found", async ({ page }) => {
  const res = await page.goto("/guider/finnes-ikke");
  expect(res?.status()).toBe(404);
});

test("footer links to the guides", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "nb", url: baseURL! }]);
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: nb.Footer.guides }).click();
  await expect(page).toHaveURL(/\/guider$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nb.Guides.title);
});
