import { type Browser, expect, type Page } from "@playwright/test";
import { isValidOrgNumber } from "../src/lib/org-number";

// Shared by the specs that need a running Supabase (the e2e-auth CI job).

export const widths = [375, 430, 768, 1280, 1440];
export const locales = ["nb", "en", "lt"] as const;
export const password = "Synthetic-pass-2026";

// Synthetic users only, on the reserved .test domain.
export function newEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@maskinflyt.test`;
}

// Fills and sends the sign-up form on the current page (/signup or an invitation link).
export async function fillSignUp(page: Page, email: string, firstName = "Kari", lastName = "Nordmann") {
  await page.locator('input[name="firstName"]').fill(firstName);
  await page.locator('input[name="lastName"]').fill(lastName);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('main form button[type="submit"]').click();
}

export async function signUp(page: Page, email: string, firstName?: string, lastName?: string) {
  await page.goto("/signup");
  await fillSignUp(page, email, firstName, lastName);
  await page.waitForURL("**/app/onboarding");
}

// Org numbers are unique, so every test company gets its own made-up valid number.
export function newOrgNumber() {
  for (;;) {
    const candidate = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
    if (isValidOrgNumber(candidate)) return candidate;
  }
}

// The new owner is sent to the second sign-in step first.
export async function createCompany(page: Page, name: string, orgNumber = newOrgNumber()) {
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="orgNumber"]').fill(orgNumber);
  await page.locator('main form button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/mfa");
  await passSecondStep(page);
}

// Local Supabase delivers e-mail to Mailpit instead of sending it.
const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function messagesTo(email: string): Promise<{ ID: string }[]> {
  const response = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  return ((await response.json()) as { messages: { ID: string }[] }).messages; // newest first
}

// On /mfa: press "Send link", then read the sign-in link from the new e-mail.
// The address shown on the page is the signed-in person's own.
export async function requestLink(page: Page) {
  const email = (await page.locator("main strong").first().textContent())?.trim() ?? "";
  expect(email).toContain("@");
  const before = (await messagesTo(email)).length;
  // (The second form on the page is "Sign out".) Supabase allows one e-mail
  // per address per second here (max_frequency), so a quick second request
  // can be refused; if no new e-mail arrives, press again.
  let messages: { ID: string }[] = [];
  for (let attempt = 0; attempt < 3 && messages.length <= before; attempt++) {
    await page.locator('main form button[type="submit"]').first().click();
    await expect
      .poll(async () => (messages = await messagesTo(email)).length, { timeout: 4_000 })
      .toBeGreaterThan(before)
      .catch(() => {});
  }
  expect(messages.length, "the e-mail arrives").toBeGreaterThan(before);
  await expect(page.locator('main [role="status"]').first()).toBeVisible();
  const response = await fetch(`${mailpit}/api/v1/message/${messages[0].ID}`);
  const { HTML } = (await response.json()) as { HTML: string };
  const link = HTML.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1];
  expect(link, "the e-mail has a sign-in link").toBeTruthy();
  return link!.replace(/&amp;/g, "&");
}

// On the page the e-mailed link opens: answer "Was this you?".
export async function answerApproval(page: Page, link: string, approve: boolean) {
  await page.goto(link);
  await expect(page).toHaveURL(/\/approve\/[0-9a-f-]{36}$/);
  await page.locator("main button").nth(approve ? 0 : 1).click();
}

// The whole second step: send the link, open and approve it in the same
// browser, land in the app.
export async function passSecondStep(page: Page) {
  await answerApproval(page, await requestLink(page), true);
  await page.waitForURL((url) => url.pathname === "/app");
}

// The page fades in after navigation; measure and photograph it once it has
// settled. (Endless animations, like the loading skeleton's pulse, are ignored.)
async function waitForAnimations(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
}

// Every screen: no sideways scroll, inputs big enough and 16px+ (no iPhone zoom).
export async function checkLayout(page: Page) {
  await waitForAnimations(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page must not scroll sideways").toBeLessThanOrEqual(0);

  for (const field of await page.locator("input:visible, select:visible, button:visible").all()) {
    const box = await field.boundingBox();
    const what = await field.evaluate((el) => el.outerHTML.slice(0, 160));
    expect(box?.height ?? 0, `tap target at least 44px: ${what}`).toBeGreaterThanOrEqual(44);
  }
  for (const field of await page.locator("input:visible, select:visible").all()) {
    const size = await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size, "16px+ so iPhone Safari does not zoom").toBeGreaterThanOrEqual(16);
  }
}

export async function shootAllWidths(page: Page, name: string, locale: string) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await checkLayout(page);
    await page.screenshot({
      path: `test-results/screenshots/${name}-${locale}-${width}.png`,
      fullPage: true,
    });
  }
}

// A browser with the interface language fixed by cookie (it wins over the company default).
export async function newPage(browser: Browser, baseURL: string, locale: string) {
  const context = await browser.newContext();
  await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL }]);
  return { context, page: await context.newPage() };
}

export function newCompanyName(tag: string) {
  return `E2E ${tag} ${Date.now()} ${Math.random().toString(36).slice(2, 6)} AS`;
}

// Made-up plates, different in every run so parallel tests never collide.
export function newPlates() {
  return `ZZ ${String(Math.floor(Math.random() * 90000) + 10000)}`;
}

export async function addVehicle(
  page: Page,
  vehicle: { type: string; typeName?: string; name: string; plates?: string; crane?: string; rate?: string },
) {
  await page.locator('select[name="type"]').selectOption(vehicle.type);
  if (vehicle.typeName !== undefined) await page.locator('input[name="typeName"]').fill(vehicle.typeName);
  await page.locator('input[name="name"]').fill(vehicle.name);
  await page.locator('input[name="regNumber"]').fill(vehicle.plates ?? "");
  if (vehicle.crane) await page.locator('input[name="craneTm"]').fill(vehicle.crane);
  await page.locator('input[name="hourlyRate"]').fill(vehicle.rate ?? "");
  await page.locator('main form button[type="submit"]').first().click();
}

// The owner invites a colleague with a role; returns the colleague's page, signed in.
export async function inviteColleague(browser: Browser, baseURL: string, owner: Page, role: string) {
  await owner.goto("/app/team");
  await owner.getByLabel("Role", { exact: true }).selectOption(role);
  await owner.locator('main form button[type="submit"]').first().click();
  const link = owner.getByText(/\/join\/[0-9a-f]{64}$/);
  await expect(link).toBeVisible();
  const colleague = await newPage(browser, baseURL, "en");
  await colleague.page.goto(new URL((await link.textContent())!.trim()).pathname);
  await fillSignUp(colleague.page, newEmail(role));
  await colleague.page.waitForURL((url) => url.pathname === "/app");
  return colleague;
}
