import { expect, test } from "@playwright/test";

// The widths every screen must be checked at (see CLAUDE.md).
const widths = [375, 430, 768, 1280, 1440];

const titles = {
  nb: { privacy: "Personvernerklæring", terms: "Vilkår for bruk", dpa: "Databehandleravtale" },
  en: { privacy: "Privacy policy", terms: "Terms of use", dpa: "Data processing agreement" },
  lt: { privacy: "Privatumo politika", terms: "Naudojimo sąlygos", dpa: "Duomenų tvarkymo sutartis" },
} as const;

const pages = [
  { kind: "privacy", path: "/personvern" },
  { kind: "terms", path: "/vilkar" },
  { kind: "dpa", path: "/databehandleravtale" },
] as const;

for (const locale of Object.keys(titles) as (keyof typeof titles)[]) {
  for (const { kind, path } of pages) {
    for (const width of widths) {
      test(`${kind} ${locale} @ ${width}px`, async ({ page, context, baseURL }) => {
        await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);

        await expect(page.getByRole("heading", { level: 1 })).toHaveText(titles[locale][kind]);
        await expect(page.getByRole("note")).toBeVisible();
        expect(await page.getByRole("heading", { level: 2 }).count()).toBeGreaterThanOrEqual(8);
        // Every placeholder is filled in.
        await expect(page.getByRole("main")).not.toContainText("{");

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, "page must not scroll sideways").toBeLessThanOrEqual(0);

        await page.screenshot({ path: `test-results/screenshots/${kind}-${locale}-${width}.png`, fullPage: true });
      });
    }
  }
}

test("footer links to the legal pages", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "nb", url: baseURL! }]);
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("link", { name: "Personvern" }).click();
  await expect(page).toHaveURL(/\/personvern$/);
  await page.getByRole("contentinfo").getByRole("link", { name: "Vilkår" }).click();
  await expect(page).toHaveURL(/\/vilkar$/);
  await page.getByRole("contentinfo").getByRole("link", { name: "Databehandleravtale" }).click();
  await expect(page).toHaveURL(/\/databehandleravtale$/);
});
