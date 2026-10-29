import { expect, type Page, test } from "@playwright/test";
import { formatOrgNumber } from "../src/lib/org-number";
import {
  addVehicle,
  createCompany,
  inviteColleague,
  locales,
  newCompanyName,
  newEmail,
  newOrgNumber,
  newPage,
  shootAllWidths,
  signUp,
} from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

type CustomerInput = {
  kind?: "company" | "private";
  name: string;
  orgNumber?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  street?: string;
  postalCode?: string;
  city?: string;
};

// On /app/customers/new (or a customer's page): fills the form and sends it.
async function fillCustomer(page: Page, customer: CustomerInput) {
  await page.locator(`input[name="kind"][value="${customer.kind ?? "company"}"]`).check();
  await page.locator('input[name="name"]').fill(customer.name);
  if (customer.kind !== "private") await page.locator('input[name="orgNumber"]').fill(customer.orgNumber ?? "");
  await page.locator('input[name="contactName"]').fill(customer.contactName ?? "");
  await page.locator('input[name="phone"]').fill(customer.phone ?? "");
  await page.locator('input[name="email"]').fill(customer.email ?? "");
  await page.locator('input[name="street"]').fill(customer.street ?? "");
  await page.locator('input[name="postalCode"]').fill(customer.postalCode ?? "");
  await page.locator('input[name="city"]').fill(customer.city ?? "");
  await page.locator('main form button[type="submit"]').first().click();
}

async function addCustomer(page: Page, customer: CustomerInput) {
  await page.goto("/app/customers/new");
  await fillCustomer(page, customer);
}

test("owner keeps customers and their own prices; a dispatcher adds customers but not prices; a driver does not see them", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const owner = await newPage(browser, baseURL!, "en");
  await signUp(owner.page, newEmail("customers-owner"), "Anna", "Berg");
  await createCompany(owner.page, newCompanyName("customers"));
  await owner.page.goto("/app/vehicles");
  await addVehicle(owner.page, { type: "crane_truck", name: "Kranbil 1", crane: "20", rate: "1450" });
  await expect(owner.page.getByText("Kranbil 1 was added.")).toBeVisible();

  await owner.page.getByRole("link", { name: "Customers", exact: true }).click();
  await expect(owner.page.getByRole("heading", { level: 1 })).toHaveText("Customers");
  await expect(owner.page.getByText("No customers yet. Add the first one.")).toBeVisible();

  // Wrong input is explained at the field, and what was typed stays.
  await owner.page.getByRole("link", { name: "Add a customer" }).click();
  await fillCustomer(owner.page, { name: "", orgNumber: "123456789", phone: "12", email: "post@", postalCode: "155" });
  await expect(owner.page.getByText("Enter a name (at most 120 characters).")).toBeVisible();
  await expect(owner.page.getByText("This is not a valid Norwegian organisation number (9 digits).")).toBeVisible();
  await expect(owner.page.getByText("Enter a phone number, for example 912 34 567 or +47 912 34 567.")).toBeVisible();
  await expect(owner.page.getByText("Enter an e-mail address, for example post@firma.no.")).toBeVisible();
  await expect(owner.page.getByText("Enter 4 digits, for example 0155.")).toBeVisible();
  await expect(owner.page.locator('input[name="orgNumber"]')).toHaveValue("123456789");

  // A company customer: on to its page, where its own prices are set.
  const orgNumber = newOrgNumber();
  await fillCustomer(owner.page, {
    name: "Nordbygg AS",
    orgNumber,
    contactName: "Per Hansen",
    phone: "912 34 567",
    email: "Post@Nordbygg.test",
    street: "Storgata 1",
    postalCode: "0155",
    city: "Oslo",
  });
  await owner.page.waitForURL(/\/app\/customers\/[0-9a-f-]{36}\?added=1$/);
  await expect(owner.page.getByRole("heading", { level: 1 })).toHaveText("Nordbygg AS");
  await expect(owner.page.getByText("Nordbygg AS was added. You can set the customer's own prices below.")).toBeVisible();
  await expect(owner.page.getByText(/^Added by Anna Berg · /)).toBeVisible();
  await expect(owner.page.locator('input[name="phone"]')).toHaveValue("912 34 567");
  await expect(owner.page.locator('input[name="email"]')).toHaveValue("post@nordbygg.test");

  const prices = owner.page.getByRole("region", { name: "The customer's own prices" });
  await expect(prices.getByText("Usual: NOK 1,450.00 per hour")).toBeVisible();
  await prices.getByLabel("Kranbil 1").fill("1 300");
  await prices.getByRole("button", { name: "Save price" }).click();
  await expect(prices.getByText("Price saved.")).toBeVisible();
  await owner.page.reload();
  await expect(prices.getByLabel("Kranbil 1")).toHaveValue("1300");

  // The same organisation number twice is refused, however it is written.
  await addCustomer(owner.page, { name: "Nordbygg Two AS", orgNumber: formatOrgNumber(orgNumber) });
  await expect(owner.page.getByText("Another customer already has this organisation number.")).toBeVisible();

  // A private person has no organisation number; switched off, the customer keeps its data.
  await owner.page.getByLabel("Private person").check();
  await expect(owner.page.locator('input[name="orgNumber"]')).toHaveCount(0);
  await fillCustomer(owner.page, { kind: "private", name: "Kari Nordmann", phone: "+47 41 23 45 67", city: "Bergen" });
  await expect(owner.page.getByRole("heading", { level: 1 })).toHaveText("Kari Nordmann");
  await owner.page.getByRole("button", { name: "Make inactive" }).click();
  await expect(owner.page.getByRole("button", { name: "Make active again" })).toBeVisible();

  await owner.page.getByRole("link", { name: "All customers" }).click();
  const list = owner.page.getByRole("region", { name: "All customers" });
  await expect(list.getByText("2 customers")).toBeVisible();
  const nordbygg = list.getByRole("listitem").filter({ hasText: "Nordbygg AS" });
  await expect(nordbygg.getByText(`Org. no. ${formatOrgNumber(orgNumber)}`)).toBeVisible();
  await expect(nordbygg.getByText("912 34 567")).toBeVisible();
  await expect(nordbygg.getByText("Per Hansen")).toBeVisible();
  await expect(list.getByRole("listitem").filter({ hasText: "Kari Nordmann" }).getByText("Inactive")).toBeVisible();

  // Search by phone however it is grouped, and by city.
  await owner.page.getByLabel("Search customers").fill("91234567");
  await owner.page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(list.getByText("1 customer found")).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveText(/Nordbygg AS/);
  await owner.page.getByLabel("Search customers").fill("bergen");
  await owner.page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveText(/Kari Nordmann/);
  await owner.page.getByLabel("Search customers").fill("100%");
  await owner.page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(list.getByText("No customer matches the search.")).toBeVisible();
  await list.getByRole("link", { name: "Show all" }).click();
  await expect(list.getByText("2 customers")).toBeVisible();

  // A dispatcher adds a customer taken by phone and reads the prices, but cannot change them.
  const dispatcher = await inviteColleague(browser, baseURL!, owner.page, "dispatcher", "Dina", "Dahl");
  await dispatcher.page.getByRole("link", { name: "Customers", exact: true }).click();
  await dispatcher.page.getByRole("link", { name: "Add a customer" }).click();
  await fillCustomer(dispatcher.page, { name: "Telefonkunde AS", phone: "22 33 44 55" });
  await expect(dispatcher.page.getByRole("heading", { level: 1 })).toHaveText("Telefonkunde AS");
  await expect(dispatcher.page.getByText(/^Added by Dina Dahl · /)).toBeVisible();
  await dispatcher.page.getByRole("link", { name: "All customers" }).click();
  // Who added each customer shows in the list too.
  const listed = dispatcher.page.getByRole("listitem");
  await expect(listed.filter({ hasText: "Telefonkunde AS" }).getByText(/^Added by Dina Dahl · /)).toBeVisible();
  await expect(listed.filter({ hasText: "Nordbygg AS" }).getByText(/^Added by Anna Berg · /)).toBeVisible();
  await dispatcher.page.getByRole("link", { name: /Nordbygg AS/ }).click();
  const readOnlyPrices = dispatcher.page.getByRole("region", { name: "The customer's own prices" });
  await expect(readOnlyPrices.getByText("Only owners and administrators can change prices.")).toBeVisible();
  await expect(readOnlyPrices.getByText("Own price: NOK 1,300.00 per hour")).toBeVisible();
  await expect(readOnlyPrices.locator("input")).toHaveCount(0);

  // A driver has no menu entry, and the address leads back to the overview.
  const driver = await inviteColleague(browser, baseURL!, owner.page, "driver");
  await expect(driver.page.getByRole("link", { name: "Customers", exact: true })).toHaveCount(0);
  await driver.page.goto("/app/customers");
  await expect(driver.page).toHaveURL(/\/app$/);

  await owner.context.close();
  await dispatcher.context.close();
  await driver.context.close();
});

for (const locale of locales) {
  test(`customer screens in ${locale} at every width`, async ({ browser, baseURL }) => {
    test.setTimeout(150_000);
    const owner = await newPage(browser, baseURL!, locale);
    await signUp(owner.page, newEmail(`shots-customers-${locale}`), "Ingrid", "Ødegård-Kristiansen");
    await createCompany(owner.page, `Vestlandets Kran- og Maskinentreprenør Kunder ${locale.toUpperCase()} AS`);
    await owner.page.goto("/app/vehicles");
    await addVehicle(owner.page, { type: "crane_truck_grab", name: "Scania R650 med Hiab X-HiPro 1058 og grabb", rate: "2 150" });
    await expect(owner.page.locator('[role="status"]')).toBeVisible();
    await owner.page.goto("/app/customers");
    await shootAllWidths(owner.page, "customers-empty", locale);

    await owner.page.goto("/app/customers/new");
    await shootAllWidths(owner.page, "customer-new", locale);

    // Long names, as people really write them.
    await fillCustomer(owner.page, {
      name: "Vestlandske Entreprenørforretning og Byggevareimport Holding AS",
      orgNumber: newOrgNumber(),
      contactName: "Kristoffer Haugland-Tveitereid",
      phone: "+47 912 34 567",
      email: "fakturamottak.prosjektavdelingen@vestlandske-entreprenor.test",
      street: "Industriveien 125, bygg C",
      postalCode: "5257",
      city: "Kokstad",
    });
    await owner.page.waitForURL(/\/app\/customers\/[0-9a-f-]{36}\?added=1$/);
    await shootAllWidths(owner.page, "customer", locale);

    await addCustomer(owner.page, { kind: "private", name: "Ingrid Ødegård-Kristiansen", phone: "41234567", city: "Kristiansand" });
    await owner.page.waitForURL(/\/app\/customers\/[0-9a-f-]{36}\?added=1$/);
    await owner.page.goto("/app/customers");
    await expect(owner.page.getByRole("region").getByRole("listitem")).toHaveCount(2);
    await shootAllWidths(owner.page, "customers", locale);

    await owner.context.close();
  });
}
