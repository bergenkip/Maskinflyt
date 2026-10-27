import { type Browser, expect, type Page, test } from "@playwright/test";
import { createCompany, fillSignUp, locales, newEmail, passSecondStep, shootAllWidths, signUp } from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

// A browser with the interface language fixed by cookie (it wins over the company default).
async function newPage(browser: Browser, baseURL: string, locale: string) {
  const context = await browser.newContext();
  await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL }]);
  return { context, page: await context.newPage() };
}

function newCompanyName(tag: string) {
  return `E2E ${tag} ${Date.now()} ${Math.random().toString(36).slice(2, 6)} AS`;
}

const linkPattern = /\/join\/[0-9a-f]{64}$/;

// Creates an invitation link on the team page and returns its path. A link
// created earlier may still be on screen, so wait until a new one replaces it.
async function createLink(page: Page, role?: string) {
  const link = page.getByText(linkPattern);
  const previous = (await link.count()) > 0 ? await link.textContent() : null;
  if (role) await page.locator('select[name="role"]').selectOption(role);
  await page.locator('main form button[type="submit"]').first().click();
  await expect(link).toBeVisible();
  if (previous) await expect(link).not.toHaveText(previous);
  return new URL((await link.textContent())!.trim()).pathname;
}

test("owner creates a personal link; a colleague signs up with it, gets a new role and is removed", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const company = newCompanyName("team");
  const colleague = newEmail("colleague");

  // The owner creates a company and an invitation link for an operator. No e-mail is needed.
  const owner = await newPage(browser, baseURL!, "en");
  await signUp(owner.page, newEmail("team-owner"), "Ingrid", "Owner");
  await createCompany(owner.page, company);
  await owner.page.getByRole("link", { name: "Team", exact: true }).click();
  await expect(owner.page.getByRole("heading", { level: 1 })).toHaveText("Team");
  await expect(owner.page.getByLabel("E-mail")).toHaveCount(0);

  await owner.page.getByLabel("Role", { exact: true }).selectOption("operator");
  await owner.page.getByRole("button", { name: "Create invitation link" }).click();
  await expect(owner.page.getByText("Link created for a new Operator.")).toBeVisible();
  const link = new URL((await owner.page.getByText(linkPattern).textContent())!.trim()).pathname;
  const openInvitations = owner.page.getByRole("region", { name: "Open invitations" });
  await expect(openInvitations.getByText("Invitation as Operator")).toBeVisible();

  // Every invitation gets its own link, and it can be cancelled.
  const cancelled = await createLink(owner.page, "viewer");
  expect(cancelled).not.toBe(link);
  await openInvitations.getByRole("button", { name: /^Cancel the invitation \(Viewer/ }).click();
  await expect(openInvitations.getByText("Invitation as Viewer")).toHaveCount(0);

  // The colleague opens the link, sees the company, gives a name and joins in one step.
  const invitee = await newPage(browser, baseURL!, "en");
  await invitee.page.goto(link);
  await expect(invitee.page.getByRole("heading", { level: 1 })).toHaveText("You have been invited to Maskinflyt");
  await expect(invitee.page.getByText(company)).toBeVisible();
  await expect(invitee.page.getByText("Role: Operator")).toBeVisible();
  await invitee.page.getByRole("button", { name: "Create account" }).click();
  await expect(invitee.page.getByText("Enter your first name.")).toBeVisible();
  await fillSignUp(invitee.page, colleague, "Kari", "Kollega");
  await invitee.page.waitForURL((url) => url.pathname === "/app");
  await expect(invitee.page.getByRole("heading", { level: 1 })).toHaveText(company);
  await expect(invitee.page.getByText("Your role: Operator")).toBeVisible();

  // An operator sees the team but cannot invite or change anyone.
  await invitee.page.goto("/app/team");
  await expect(invitee.page.getByText("Only owners and administrators can invite people and change roles.")).toBeVisible();
  await expect(invitee.page.getByRole("button", { name: /Remove/ })).toHaveCount(0);
  await expect(invitee.page.getByRole("button", { name: "Create invitation link" })).toHaveCount(0);
  await expect(invitee.page.getByText("Ingrid Owner", { exact: true })).toBeVisible();

  // The link worked once: someone it was forwarded to cannot use it, nor the cancelled one.
  const stranger = await newPage(browser, baseURL!, "en");
  for (const path of [link, cancelled, `/join/${"0".repeat(64)}`, "/join/not-a-token"]) {
    await stranger.page.goto(path);
    await expect(stranger.page.getByRole("heading", { level: 1 })).toHaveText("This invitation link is not valid");
    await expect(stranger.page.locator('input[name="email"]')).toHaveCount(0);
  }

  // The owner sees the new member by name, changes the role and finally removes them.
  await owner.page.reload();
  await expect(openInvitations.getByText("Invitation as Operator")).toHaveCount(0);
  const colleagueRow = owner.page.getByRole("listitem").filter({ hasText: colleague });
  await expect(colleagueRow.getByText("Kari Kollega", { exact: true })).toBeVisible();
  await owner.page.getByLabel("Role for Kari Kollega").selectOption("viewer");
  await owner.page.getByRole("button", { name: "Save role" }).click();
  // The role shown as text next to the name (the select also contains "Viewer" as an option).
  await expect(colleagueRow.getByRole("paragraph").filter({ hasText: /^Viewer$/ })).toBeVisible();

  owner.page.once("dialog", (dialog) => dialog.accept());
  await owner.page.getByRole("button", { name: "Remove Kari Kollega" }).click();
  await expect(owner.page.getByText(colleague)).toHaveCount(0);

  // Removed: the colleague is back to creating a company.
  await invitee.page.goto("/app");
  await expect(invitee.page).toHaveURL(/\/app\/onboarding$/);

  await owner.context.close();
  await invitee.context.close();
  await stranger.context.close();
});

test("someone who already has an account joins with a link after signing in", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const owner = await newPage(browser, baseURL!, "en");
  await signUp(owner.page, newEmail("link-owner"));
  await createCompany(owner.page, newCompanyName("link"));
  await owner.page.goto("/app/team");
  const link = await createLink(owner.page, "admin");

  // An owner of another company cannot use the link.
  const busy = await newPage(browser, baseURL!, "en");
  await signUp(busy.page, newEmail("busy"));
  await createCompany(busy.page, newCompanyName("busy"));
  await busy.page.goto(link);
  await expect(busy.page.getByText("You already belong to a company, so you cannot join another one.")).toBeVisible();
  await expect(busy.page.getByRole("button", { name: "Join the company" })).toHaveCount(0);

  // An existing account without a company: sign in from the link, then join.
  const email = newEmail("existing");
  const existing = await newPage(browser, baseURL!, "en");
  await signUp(existing.page, email, "Per", "Eksisterende");
  await existing.page.getByRole("button", { name: "Sign out" }).click();
  await existing.page.waitForURL("**/login");
  await existing.page.goto(link);
  await existing.page.getByRole("link", { name: "Sign in" }).click();
  await expect(existing.page).toHaveURL(/\/login\?next=/);
  await existing.page.locator('input[name="email"]').fill(email);
  await existing.page.locator('input[name="password"]').fill("Synthetic-pass-2026");
  await existing.page.locator('main form button[type="submit"]').click();
  await existing.page.waitForURL((url) => url.pathname === link);
  await existing.page.getByRole("button", { name: "Join the company" }).click();
  // Administrators set up two-step sign-in, like owners.
  await existing.page.waitForURL((url) => url.pathname === "/mfa");
  await passSecondStep(existing.page);
  await expect(existing.page.getByText("Your role: Administrator")).toBeVisible();

  await owner.context.close();
  await busy.context.close();
  await existing.context.close();
});

for (const locale of locales) {
  test(`team and invitation screens in ${locale} at every width`, async ({ browser, baseURL }) => {
    test.setTimeout(120_000);

    const owner = await newPage(browser, baseURL!, locale);
    await signUp(owner.page, newEmail(`shots-team-${locale}`), "Ingrid", "Ødegård-Kristiansen");
    await createCompany(owner.page, `Sørlandets Kjøleromsinstallasjonsleverandører Team ${locale.toUpperCase()} AS`);
    await owner.page.goto("/app/team");
    const link = await createLink(owner.page);
    await shootAllWidths(owner.page, "team", locale);

    const guest = await newPage(browser, baseURL!, locale);
    await guest.page.goto(link);
    await shootAllWidths(guest.page, "join", locale);
    await guest.page.goto(`/join/${"0".repeat(64)}`);
    await shootAllWidths(guest.page, "join-invalid", locale);

    await owner.context.close();
    await guest.context.close();
  });
}
