import { test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { passSecondStep, password } from "../../e2e/helpers";

const out = "test-results/demo-screens";

async function login(page: Page, email: string, mfa: boolean) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('main form button[type="submit"]').first().click();
  if (mfa) {
    await page.waitForURL((u) => u.pathname === "/mfa");
    await passSecondStep(page);
  } else await page.waitForURL((u) => u.pathname.startsWith("/app"));
}

const locale = process.env.DEMO_LOCALE ?? "nb";
// DEMO_THEME=dark shoots the dark look (the "theme" cookie the sun/moon button sets).
const theme = process.env.DEMO_THEME === "dark" ? "dark" : "light";
const suffix = theme === "dark" ? "-dark" : "";
const cookies = (url: string) => [
  { name: "NEXT_LOCALE", value: locale, url },
  { name: "theme", value: theme, url },
];

test("office screens", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addCookies(cookies(baseURL!));
  const page = await ctx.newPage();
  await login(page, "kari@fjordkran.test", true);
  for (const [name, url] of [
    ["calendar-week", "/app/jobs/calendar?view=week"],
    ["calendar-day", "/app/jobs/calendar?view=day"],
  ] as const) {
    for (const w of [1280]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/${locale}-${name}-${w}${suffix}.png` });
    }
  }
});

test("driver phone", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addCookies(cookies(baseURL!));
  // The driver's own language choice wins over the cookie.
  execSync("docker exec -i supabase_db_maskinflyt psql -U postgres -At", {
    input: `update profiles set locale='${locale}' where id=(select id from auth.users where email='ola@fjordkran.test');`,
  });
  const page = await ctx.newPage();
  await login(page, "ola@fjordkran.test", false);
  await page.goto("/app/my-jobs");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${locale}-driver-390${suffix}.png` });
});
