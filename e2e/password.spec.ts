import { expect, test } from "@playwright/test";
import { locales, messagesTo, newEmail, newMailLink, newPage, password, shootAllWidths, signUp } from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

const newPassword = "Another-synthetic-2026";

test("a forgotten password is replaced through an e-mailed link", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const email = newEmail("forgot");
  const signedUp = await newPage(browser, baseURL!, "en");
  await signUp(signedUp.page, email);
  await signedUp.context.close();

  // A new browser, signed out: the sign-in form links to the reset form.
  const { context, page } = await newPage(browser, baseURL!, "en");
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Forgot your password?");

  await page.getByLabel("E-mail").fill("not-an-email");
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByText("Enter a valid e-mail address.")).toBeVisible();

  // An unknown address gets the same answer, so nobody can test who has an account.
  await page.getByLabel("E-mail").fill(newEmail("nobody"));
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByRole("status")).toContainText("If ");
  await page.goto("/forgot-password");

  const before = (await messagesTo(email)).length;
  await page.getByLabel("E-mail").fill(email.toUpperCase());
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByRole("status")).toContainText(email);
  const link = await newMailLink(email, before);

  // The link opens the new-password form for this account.
  await page.goto(link);
  await page.waitForURL((url) => url.pathname === "/reset-password");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Choose a new password");
  await expect(page.getByText(email)).toBeVisible();
  await page.getByLabel("New password").fill("short");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("The password must be at least 10 characters.")).toBeVisible();
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/app"));
  await context.close();

  // The old password no longer works; the new one does.
  const later = await newPage(browser, baseURL!, "en");
  await later.page.goto("/login");
  await later.page.getByLabel("E-mail").fill(email);
  await later.page.getByLabel("Password").fill(password);
  await later.page.getByRole("button", { name: "Sign in" }).click();
  await expect(later.page.getByText("Wrong e-mail or password.")).toBeVisible();
  await later.page.getByLabel("Password").fill(newPassword);
  await later.page.getByRole("button", { name: "Sign in" }).click();
  await later.page.waitForURL((url) => url.pathname.startsWith("/app"));

  // The link works once: opened again, it explains and offers a new one.
  await later.context.clearCookies();
  await later.page.goto(link);
  await later.page.waitForURL((url) => url.pathname === "/reset-password");
  await expect(later.page.getByRole("alert").filter({ hasText: "Ask for a new link" })).toBeVisible();
  await later.context.close();
});

for (const locale of locales) {
  test(`password screens in ${locale} at every width`, async ({ browser, baseURL }) => {
    test.setTimeout(90_000);
    const email = newEmail(`shots-forgot-${locale}`);
    const signedUp = await newPage(browser, baseURL!, locale);
    await signUp(signedUp.page, email, "Ingrid", "Ødegård-Kristiansen");
    await signedUp.context.close();

    const { context, page } = await newPage(browser, baseURL!, locale);
    await page.goto("/login");
    await shootAllWidths(page, "login", locale);
    await page.goto("/forgot-password");
    await shootAllWidths(page, "forgot-password", locale);

    const before = (await messagesTo(email)).length;
    await page.locator('input[name="email"]').fill(email);
    await page.locator('main form button[type="submit"]').click();
    await expect(page.getByRole("status")).toBeVisible();
    await shootAllWidths(page, "forgot-password-sent", locale);

    await page.goto(await newMailLink(email, before));
    await page.waitForURL((url) => url.pathname === "/reset-password");
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await shootAllWidths(page, "reset-password", locale);
    await context.close();
  });
}
