import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { locales, messagesTo, newEmail, newMailLink, newPage, shootAllWidths, signUp } from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

// Local Supabase signs new accounts in at once (no confirmation e-mail), so
// the test e-mails itself a link of the same kind, with its tokens in the URL
// fragment, that lands on /confirm like the confirmation link does.
async function confirmLink(email: string, baseURL: string) {
  const before = (await messagesTo(email)).length;
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key } = process.env;
  const supabase = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  });
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${baseURL}/confirm` },
  });
  expect(error).toBeNull();
  return newMailLink(email, before);
}

test("the confirmation link signs in from any browser, once", async ({ browser, baseURL }) => {
  test.setTimeout(60_000);
  const email = newEmail("confirm");
  const signedUp = await newPage(browser, baseURL!, "en");
  await signUp(signedUp.page, email);
  await signedUp.context.close();
  const link = await confirmLink(email, baseURL!);

  // Another browser than the one that signed up (say, the phone's mail app).
  const other = await newPage(browser, baseURL!, "en");
  await other.page.goto(link);
  await other.page.waitForURL((url) => url.pathname.startsWith("/app"));
  // The link's tokens do not stay in the address bar.
  expect(new URL(other.page.url()).hash).toBe("");
  await other.context.close();

  // The link works once: opened again, it says so and points to sign-in.
  const later = await newPage(browser, baseURL!, "en");
  await later.page.goto(link);
  await later.page.waitForURL((url) => url.pathname === "/confirm");
  await expect(later.page.getByRole("alert").filter({ hasText: "just sign in" })).toBeVisible();
  await later.page.getByRole("link", { name: "Sign in" }).click();
  await later.page.waitForURL((url) => url.pathname === "/login");
  await later.context.close();
});

for (const locale of locales) {
  test(`used confirmation link in ${locale} at every width`, async ({ browser, baseURL }) => {
    const { context, page } = await newPage(browser, baseURL!, locale);
    // Supabase sends a used or expired link here with the error in the fragment.
    await page.goto("/confirm#error=access_denied&error_code=otp_expired");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shootAllWidths(page, "confirm-failed", locale);
    await context.close();
  });
}
