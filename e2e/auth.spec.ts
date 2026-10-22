import { expect, test } from "@playwright/test";
import {
  answerApproval,
  createCompany,
  locales,
  newEmail,
  newOrgNumber,
  passSecondStep,
  password,
  requestLink,
  shootAllWidths,
  signUp,
} from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/app/settings");
  await expect(page).toHaveURL(/\/login$/);
});

test("sign up, create a company and see it as owner", async ({ browser }) => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();

  // Mistakes are shown next to the field, and nothing is sent.
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill("not-an-email");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter your first name.")).toBeVisible();
  await expect(page.getByText("Enter your last name.")).toBeVisible();
  await expect(page.getByText("Enter a valid e-mail address.")).toBeVisible();
  await expect(page.getByText("The password must be at least 10 characters.")).toBeVisible();

  await signUp(page, newEmail("owner"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your company");

  // An invalid organisation number is rejected.
  await page.getByLabel("Company name").fill("Fjordlys Engros AS");
  await page.getByLabel("Organisation number (optional)").fill("123456789");
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(page.getByText("This is not a valid Norwegian organisation number. Check it or leave the field empty.")).toBeVisible();

  await page.getByLabel("Organisation number (optional)").fill("123 456 785");
  await page.getByRole("button", { name: "Create company" }).click();

  // An owner confirms by e-mail before seeing the company.
  await page.waitForURL((url) => url.pathname === "/mfa");
  await page.goto("/app/team");
  await expect(page).toHaveURL(/\/mfa$/);
  await passSecondStep(page);

  // The user has not chosen a language yet, so the company default (Norwegian) applies now.
  await expect(page.locator("html")).toHaveAttribute("lang", "nb");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fjordlys Engros AS");
  await expect(page.getByText("Din rolle: Eier")).toBeVisible();
  await expect(page.getByText("Org.nr. 123 456 785")).toBeVisible();

  // The start page does not offer "Sign in" to someone who is signed in: it opens the app.
  await page.goto("/");
  await expect(page).toHaveURL(/\/app$/);

  // A second company cannot be created: onboarding sends back to the dashboard.
  await page.goto("/app/onboarding");
  await expect(page).toHaveURL(/\/app$/);

  await page.getByRole("button", { name: "Logg ut" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);

  // Someone else cannot register the same company again; they need an invitation.
  await signUp(page, newEmail("second"));
  await page.getByLabel("Company name").fill("fjordlys  engros as");
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(page.getByText("A company with this name is already registered.")).toBeVisible();

  await page.getByLabel("Company name").fill("Fjordlys Grossist AS");
  await page.getByLabel("Organisation number (optional)").fill("123456785");
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(
    page.getByText("This organisation number is already registered. Ask your company's administrator to invite you."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/app\/onboarding$/);

  // A company from another country: letters allowed, no Norwegian check digit.
  await page.getByLabel("Country of registration").selectOption("GB");
  await page.getByLabel("Organisation number (optional)").fill("SC 123456");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.waitForURL((url) => url.pathname === "/mfa");
  await passSecondStep(page);
  await expect(page.getByText("Org.nr. SC123456")).toBeVisible();
  await context.close();
});

test("wrong password is refused", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(newEmail("nobody"));
  await page.locator('input[name="password"]').fill(password);
  await page.locator('main form button[type="submit"]').click();
  await expect(page.getByText("Wrong e-mail or password.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("language saved in Settings follows the user to another device", async ({ browser }) => {
  const email = newEmail("lang");
  const first = await browser.newContext({ locale: "nb-NO" });
  const page = await first.newPage();
  await signUp(page, email);
  await createCompany(page, "Nordkapp Fisk AS", "");
  await expect(page.locator("html")).toHaveAttribute("lang", "nb");

  await page.goto("/app/settings");
  // The name from sign-up is shown and can be changed.
  const nameSection = page.getByRole("region", { name: "Navnet ditt" });
  await expect(nameSection.getByLabel("Fornavn")).toHaveValue("Kari");
  await nameSection.getByLabel("Etternavn").fill("  ");
  await nameSection.getByRole("button", { name: "Lagre" }).click();
  await expect(nameSection.getByText("Skriv inn etternavnet ditt.")).toBeVisible();
  await nameSection.getByLabel("Etternavn").fill("Nordmann-Hansen");
  await nameSection.getByRole("button", { name: "Lagre" }).click();
  await expect(nameSection.getByText("Lagret.")).toBeVisible();

  const languageSection = page.getByRole("region", { name: "Språk" });
  await languageSection.getByLabel("Språk i grensesnittet").selectOption("lt");
  await languageSection.getByRole("button", { name: "Lagre" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "lt");
  await expect(page.getByRole("region", { name: "Kalba" }).getByText("Išsaugota.")).toBeVisible();
  await expect(page.getByLabel("Pavardė")).toHaveValue("Nordmann-Hansen");
  await first.close();

  // A fresh browser in English with no cookies: the profile decides.
  const second = await browser.newContext({ locale: "en-US" });
  const other = await second.newPage();
  await other.goto("/login");
  await expect(other.locator("html")).toHaveAttribute("lang", "en");
  await other.locator('input[name="email"]').fill(email);
  await other.locator('input[name="password"]').fill(password);
  await other.locator('main form button[type="submit"]').click();

  // The password alone is not enough for an owner: the app asks to confirm by e-mail first.
  await other.waitForURL((url) => url.pathname === "/mfa");
  await other.goto("/app/team");
  await expect(other).toHaveURL(/\/mfa$/);
  // The link can be opened in another browser (e.g. the Gmail app). Saying
  // "no" there keeps the waiting window locked.
  const mailApp = await browser.newContext({ locale: "en-US" });
  const mailPage = await mailApp.newPage();
  await answerApproval(mailPage, await requestLink(other), false);
  await expect(mailPage.getByText("Sign-in not approved.", { exact: false })).toBeVisible();
  await other.goto("/app/team");
  await expect(other).toHaveURL(/\/mfa$/);

  // A new link, approved in the other browser: the waiting window goes on by itself.
  const link = await requestLink(other);
  await answerApproval(mailPage, link, true);
  await expect(mailPage.getByText("Sign-in approved.", { exact: false })).toBeVisible();
  await other.waitForURL((url) => url.pathname === "/app");
  // Opening the link did not leave a signed-in session in the other browser,
  // and the link cannot be used twice.
  await mailPage.goto("/app");
  await expect(mailPage).toHaveURL(/\/login$/);
  await mailPage.goto(link);
  await expect(mailPage.getByText("This link is invalid or was already used.", { exact: false })).toBeVisible();
  await mailApp.close();
  await expect(other.locator("html")).toHaveAttribute("lang", "lt");
  await expect(other.getByRole("heading", { level: 1 })).toHaveText("Nordkapp Fisk AS");
  await second.close();
});

for (const locale of locales) {
  test(`screens in ${locale} at every width`, async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext();
    await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    const page = await context.newPage();

    await page.goto("/login");
    await shootAllWidths(page, "login", locale);
    await page.goto("/signup");
    await shootAllWidths(page, "signup", locale);

    const email = newEmail(`shots-${locale}`);
    await signUp(page, email);
    await shootAllWidths(page, "onboarding", locale);

    // A long name checks that long Norwegian words do not break the layout.
    // Names are unique, so each language run gets its own.
    await page.locator('input[name="name"]').fill(`Sørlandets Kjøleromsinstallasjonsleverandører ${locale.toUpperCase()} AS`);
    await page.locator('input[name="orgNumber"]').fill(newOrgNumber());
    await page.locator('main form button[type="submit"]').click();

    // Two-step sign-in: before and after the link is sent.
    await page.waitForURL((url) => url.pathname === "/mfa");
    await shootAllWidths(page, "mfa-send", locale);
    const link = await requestLink(page);
    await shootAllWidths(page, "mfa-sent", locale);
    await page.goto(link);
    await page.locator("main button").first().waitFor();
    await shootAllWidths(page, "approve", locale);
    await page.locator("main button").first().click();
    await page.waitForURL((url) => url.pathname === "/app");
    await shootAllWidths(page, "dashboard", locale);

    await page.goto("/app/settings");
    await shootAllWidths(page, "settings", locale);

    await page.locator('header form button[type="submit"]').click();
    await page.waitForURL("**/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('main form button[type="submit"]').click();
    await page.waitForURL((url) => url.pathname === "/mfa");
    await passSecondStep(page);
    await context.close();
  });
}
