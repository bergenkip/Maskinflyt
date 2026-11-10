import { expect, test } from "@playwright/test";
import { createCompany, inviteColleague, locales, newCompanyName, newEmail, newOrgNumber, newPage, shootAllWidths, signUp } from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

test("an owner fills in the invoice details, and the office reads them", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const owner = await newPage(browser, baseURL!, "en");
  const { page } = owner;
  const orgNumber = newOrgNumber();
  await signUp(page, newEmail("invoice-settings"), "Anna", "Berg");
  await createCompany(page, newCompanyName("invoice-settings"), orgNumber);

  // Missing at first, said in words and with an icon.
  await page.goto("/app/invoices");
  const link = page.getByRole("link", { name: /Invoice details/ });
  await expect(link).toContainText("Missing");
  await link.click();
  await expect(page.getByRole("heading", { level: 1, name: "Invoice details" })).toBeVisible();
  await expect(page.getByRole("region", { name: "On the invoice" })).toHaveCount(0);

  // The organisation number from the sign-up is already there.
  const form = page.getByRole("region", { name: "Invoice details" });
  await expect(form.getByLabel("Organisation number")).toHaveValue(orgNumber.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3"));

  // A mistyped account number is caught at the field.
  await form.getByLabel("Street address").fill("Storgata 1");
  await form.getByLabel("Postal code").fill("0155");
  await form.getByLabel("City").fill("Oslo");
  await form.getByLabel("Bank account").fill("1234 56 78904");
  await form.getByRole("button", { name: "Save invoice details" }).click();
  await expect(form.getByLabel("Bank account")).toHaveAccessibleDescription(/Enter a valid Norwegian account number/);
  await expect(form.getByLabel("Street address")).toHaveValue("Storgata 1");

  // Fixed and saved: the seller part of the invoice shows it all.
  await form.getByLabel("Bank account").fill("1234 56 78903");
  await form.getByLabel("Payment terms (days)").fill("14");
  await form.getByLabel("E-mail for invoice questions (optional)").fill("faktura@fjellkran.test");
  await form.getByRole("button", { name: "Save invoice details" }).click();
  await expect(form.getByRole("status")).toHaveText("Invoice details saved.");
  const preview = page.getByRole("region", { name: "On the invoice" });
  await expect(preview).toContainText(/Org\. no\. \d{3} \d{3} \d{3} MVA/);
  await expect(preview).toContainText("Foretaksregisteret");
  await expect(preview).toContainText("Bank account 1234 56 78903");
  await expect(preview).toContainText("Due 14 days after the invoice date");
  await expect(preview).toContainText("faktura@fjellkran.test");

  // Not registered for VAT: no "MVA".
  await form.getByRole("checkbox", { name: "Registered for VAT" }).click();
  await form.getByRole("button", { name: "Save invoice details" }).click();
  await expect(form.getByRole("status")).toHaveText("Invoice details saved.");
  await expect(preview).not.toContainText("MVA");
  await form.getByRole("checkbox", { name: "Registered for VAT" }).click();
  await form.getByRole("button", { name: "Save invoice details" }).click();
  await expect(preview).toContainText(/\d{3} MVA/);

  await page.goto("/app/invoices");
  await expect(link).toContainText("Filled in");

  // A dispatcher reads them and changes nothing.
  const dispatcher = await inviteColleague(browser, baseURL!, page, "dispatcher", "Dina", "Lie");
  await dispatcher.page.goto("/app/invoices/settings");
  await expect(dispatcher.page.getByRole("region", { name: "On the invoice" })).toContainText("Bank account 1234 56 78903");
  await expect(dispatcher.page.getByRole("button", { name: "Save invoice details" })).toHaveCount(0);
  await expect(dispatcher.page.getByText("Only owners and admins change the invoice details.")).toBeVisible();
  await dispatcher.context.close();

  // A driver does not get the page.
  const driver = await inviteColleague(browser, baseURL!, page, "driver", "Sander", "Lie");
  await driver.page.goto("/app/invoices/settings");
  await expect(driver.page).toHaveURL(/\/app$/);
  await driver.context.close();

  // The page in every language and width.
  for (const locale of locales) {
    await owner.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await page.goto("/app/invoices/settings");
    await shootAllWidths(page, "invoice-settings", locale);
    await page.goto("/app/invoices");
    await shootAllWidths(page, "invoices-with-settings", locale);
  }

  await owner.context.close();
});
