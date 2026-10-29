import { expect, test } from "@playwright/test";
import {
  addVehicle,
  createCompany,
  inviteColleague,
  locales,
  newCompanyName,
  newEmail,
  newPage,
  newPlates,
  shootAllWidths,
  signUp,
} from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

test("owner adds, changes and switches off a machine; a dispatcher only reads; a driver does not see it", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150_000);
  const owner = await newPage(browser, baseURL!, "en");
  await signUp(owner.page, newEmail("vehicles-owner"));
  await createCompany(owner.page, newCompanyName("vehicles"));

  await owner.page.getByRole("link", { name: "Machines", exact: true }).click();
  await expect(owner.page.getByRole("heading", { level: 1 })).toHaveText("Machines");
  await expect(owner.page.getByText("No machines yet.")).toBeVisible();

  // Wrong input is explained at the field, and what was typed stays.
  await addVehicle(owner.page, { type: "crane_truck", name: "", plates: "AB/1", crane: "20,55", rate: "abc" });
  await expect(owner.page.getByText("Enter a name (at most 100 characters).")).toBeVisible();
  await expect(owner.page.getByText("Use 2–10 letters and digits, for example AB 12345.")).toBeVisible();
  await expect(owner.page.getByText("Enter the crane capacity in tm, for example 20,5.")).toBeVisible();
  await expect(owner.page.getByText("Enter an amount, for example 1450 or 1450,50.")).toBeVisible();
  await expect(owner.page.locator('input[name="hourlyRate"]')).toHaveValue("abc");

  // A crane truck with plates written in small letters, and an excavator without plates.
  const plates = newPlates();
  await addVehicle(owner.page, { type: "crane_truck", name: "Kranbil 1", plates: plates.toLowerCase(), crane: "20,5", rate: "1 450,50" });
  await expect(owner.page.getByText("Kranbil 1 was added.")).toBeVisible();
  await expect(owner.page.locator('input[name="name"]')).toHaveValue("");
  // Everyone sees who added a machine.
  const kranbil = owner.page.getByRole("listitem").filter({ hasText: "Kranbil 1" });
  await expect(kranbil.getByText(/^Added by Kari Nordmann · /)).toBeVisible();
  await addVehicle(owner.page, { type: "excavator", name: "Gravemaskin", rate: "" });
  await expect(owner.page.getByText("Gravemaskin was added.")).toBeVisible();

  // A type that is not in the list: "Other", with the company's own name for it.
  await addVehicle(owner.page, { type: "other", typeName: "", name: "Volvo FH" });
  await expect(owner.page.getByText("Write the type (at most 60 characters).")).toBeVisible();
  await addVehicle(owner.page, { type: "other", typeName: "Trekkvogn", name: "Volvo FH" });
  await expect(owner.page.getByText("Volvo FH was added.")).toBeVisible();

  const list = owner.page.getByRole("region", { name: "All machines" });
  await expect(list.getByText("3 machines")).toBeVisible();
  await expect(list.getByRole("listitem").filter({ hasText: "Volvo FH" }).getByText("Trekkvogn · No plates")).toBeVisible();
  const crane = list.getByRole("listitem").filter({ hasText: "Kranbil 1" });
  await expect(crane.getByText(`Crane truck · ${plates}`)).toBeVisible();
  await expect(crane.getByText("Crane 20.5 tm")).toBeVisible();
  await expect(crane.getByText("NOK 1,450.50 per hour")).toBeVisible();
  await expect(crane.getByText("In use")).toBeVisible();
  await expect(list.getByRole("listitem").filter({ hasText: "Gravemaskin" }).getByText("Excavator · No plates")).toBeVisible();

  // The same plates twice are refused, however they are written.
  await addVehicle(owner.page, { type: "tipper", name: "Tippbil", plates: plates.replace(" ", "-") });
  await expect(owner.page.getByText("Another machine already has this registration number.")).toBeVisible();

  // Change the rate and switch the machine off; it keeps its data.
  await crane.getByRole("link").click();
  await expect(owner.page.getByRole("heading", { level: 1 })).toHaveText("Kranbil 1");
  await expect(owner.page.locator('input[name="hourlyRate"]')).toHaveValue("1450.50");
  await owner.page.locator('input[name="hourlyRate"]').fill("1500");
  await owner.page.getByRole("button", { name: "Save changes" }).click();
  await expect(owner.page.getByText("Changes saved.")).toBeVisible();
  await owner.page.getByRole("button", { name: "Take out of use" }).click();
  await expect(owner.page.getByRole("button", { name: "Put back in use" })).toBeVisible();
  await owner.page.getByRole("link", { name: "All machines" }).click();
  await expect(crane.getByText("Out of use")).toBeVisible();
  await expect(crane.getByText("NOK 1,500.00 per hour")).toBeVisible();

  // A dispatcher reads the list but cannot add or open a machine to change it.
  const dispatcher = await inviteColleague(browser, baseURL!, owner.page, "dispatcher");
  await dispatcher.page.getByRole("link", { name: "Machines", exact: true }).click();
  await expect(dispatcher.page.getByText("Only owners and administrators can add and change machines.")).toBeVisible();
  await expect(dispatcher.page.getByText("Kranbil 1")).toBeVisible();
  await expect(dispatcher.page.locator('input[name="name"]')).toHaveCount(0);
  await expect(dispatcher.page.getByRole("region", { name: "All machines" }).getByRole("link")).toHaveCount(0);

  // A driver has no menu entry, and the address leads back to the overview.
  const driver = await inviteColleague(browser, baseURL!, owner.page, "driver");
  await expect(driver.page.getByRole("link", { name: "Machines", exact: true })).toHaveCount(0);
  await driver.page.goto("/app/vehicles");
  await expect(driver.page).toHaveURL(/\/app$/);

  await owner.context.close();
  await dispatcher.context.close();
  await driver.context.close();
});

for (const locale of locales) {
  test(`machine screens in ${locale} at every width`, async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const owner = await newPage(browser, baseURL!, locale);
    await signUp(owner.page, newEmail(`shots-vehicles-${locale}`), "Ingrid", "Ødegård-Kristiansen");
    await createCompany(owner.page, `Sørlandets Kran- og Maskinentreprenør ${locale.toUpperCase()} AS`);
    await owner.page.goto("/app/vehicles");
    await shootAllWidths(owner.page, "vehicles-empty", locale);

    // Long names, as people really write them.
    await addVehicle(owner.page, {
      type: "crane_truck_grab",
      name: "Scania R650 med Hiab X-HiPro 1058 og grabb",
      plates: newPlates(),
      crane: "95,5",
      rate: "2 150",
    });
    await expect(owner.page.locator('[role="status"]')).toBeVisible();
    await addVehicle(owner.page, { type: "wheel_loader", name: "Volvo L120H hjullaster", rate: "1 290" });
    await expect(owner.page.getByRole("region").last().getByRole("listitem")).toHaveCount(2);
    await shootAllWidths(owner.page, "vehicles", locale);

    await owner.page.getByRole("region").last().getByRole("link").first().click();
    await expect(owner.page.getByRole("heading", { level: 1 })).not.toBeEmpty();
    await owner.page.waitForURL(/\/app\/vehicles\/[0-9a-f-]{36}$/);
    await shootAllWidths(owner.page, "vehicle-edit", locale);

    await owner.context.close();
  });
}
