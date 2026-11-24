import { expect, test } from "@playwright/test";
import en from "../messages/en.json";
import lt from "../messages/lt.json";
import nb from "../messages/nb.json";

// The widths every screen must be checked at (see CLAUDE.md).
const widths = [375, 430, 768, 1280, 1440];
const messages = { nb, en, lt } as const;
const industries = ["kranbil", "maskinentreprenor", "transport"] as const;
const pages = [...industries, "timeforing", "faktura"] as const;

for (const locale of Object.keys(messages) as (keyof typeof messages)[]) {
  for (const industry of pages) {
    for (const width of widths) {
      test(`${industry} ${locale} @ ${width}px`, async ({
        page,
        context,
        baseURL,
      }) => {
        const t = messages[locale].Industry[industry];
        await context.addCookies([
          { name: "NEXT_LOCALE", value: locale, url: baseURL! },
        ]);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/${industry}`);

        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          t.title,
        );
        await expect(page.getByRole("main")).toContainText(t.faq[0].q);
        // Sign-up button at the top and at the bottom, links to the two other trades.
        expect(
          await page.getByRole("main").locator('a[href="/signup"]').count(),
        ).toBe(2);
        for (const other of industries.filter((i) => i !== industry)) {
          await expect(
            page.getByRole("main").locator(`a[href="/${other}"]`),
          ).toBeVisible();
        }

        // A trade page shows its trade's photo at the top, loaded and described.
        const hero = page.getByRole("main").locator("article > div > img");
        if ((industries as readonly string[]).includes(industry)) {
          await expect(hero).toHaveCount(1);
          await expect(hero).toHaveAttribute(
            "alt",
            (t as { photoAlt: string }).photoAlt,
          );
          await expect
            .poll(() =>
              hero.evaluate(
                (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
              ),
            )
            .toBe(true);
        } else {
          await expect(hero).toHaveCount(0);
        }

        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow, "page must not scroll sideways").toBeLessThanOrEqual(
          0,
        );

        await page.screenshot({
          path: `test-results/screenshots/${industry}-${locale}-${width}.png`,
          fullPage: true,
        });
      });
    }
  }
}

test("trade page has its own title, description, canonical and structured data", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: "NEXT_LOCALE", value: "nb", url: baseURL! },
  ]);
  await page.goto("/kranbil");

  await expect(page).toHaveTitle(nb.Industry.kranbil.metaTitle);
  const description = await page
    .locator('meta[name="description"]')
    .getAttribute("content");
  expect(description?.length ?? 0).toBeGreaterThan(70);
  expect(description?.length ?? 0).toBeLessThanOrEqual(170);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://maskingo.no/kranbil",
  );

  const json = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  const data = JSON.parse(json ?? "{}");
  const types = data["@graph"].map(
    (item: { "@type": string }) => item["@type"],
  );
  expect(types).toEqual(["BreadcrumbList", "FAQPage"]);
  expect(data["@graph"][1].mainEntity).toHaveLength(
    nb.Industry.kranbil.faq.length,
  );
});

test("start page links to every trade page", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: "NEXT_LOCALE", value: "nb", url: baseURL! },
  ]);
  await page.goto("/");
  for (const industry of industries) {
    await page.getByRole("main").locator(`a[href="/${industry}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/${industry}$`));
    await page.goBack();
  }
});
