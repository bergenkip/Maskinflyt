import { expect, type Locator, test } from "@playwright/test";
import {
  addCustomer,
  addMachine,
  addTodaysJob,
  approveTime,
  createCompany,
  driveThrough,
  locales,
  newCompanyName,
  newEmail,
  newPage,
  shootAllWidths,
  signUp,
} from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

async function openDetails(details: Locator) {
  if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
}

async function fillLine(form: Locator, line: { description: string; quantity: string; unit: string; price: string; vat: string }) {
  await form.locator('input[name="description"]').fill(line.description);
  await form.locator('input[name="quantity"]').fill(line.quantity);
  await form.locator('input[name="unit"]').fill(line.unit);
  await form.locator('input[name="unitPrice"]').fill(line.price);
  await form.locator('select[name="vatRate"]').selectOption(line.vat);
}

test("the office adds, changes and removes extra lines, and the draft adds up with VAT per rate", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const owner = await newPage(browser, baseURL!, "en");
  const { page } = owner;
  await signUp(page, newEmail("invoice-owner"), "Anna", "Berg");
  await createCompany(page, newCompanyName("invoice"));
  // 1 200 kr/h, +50 % from 15:00, no minimum.
  await addMachine(page, { name: "Kranbil 1", rate: "1200", minHours: "", from: "15:00", percent: "50" });
  await addCustomer(page, "Nordbygg AS");
  const job = await addTodaysJob(page, {
    customer: "Nordbygg AS",
    vehicle: "Kranbil 1",
    driver: "Anna Berg",
    address: "Storgata 1, 0155 Oslo",
    contact: "Per, 912 34 567",
  });
  await page.goto(job);
  const section = page.getByRole("region", { name: "Invoice draft" });
  await expect(section).toContainText("Draft, nothing is sent");
  await expect(section).toContainText("The working time comes into the draft when the job is finished");

  // 07:00–17:00 less 30 min: 7,5 h at 1 200 kr and 2 h at 1 800 kr (from 15:00).
  await driveThrough(page);
  await approveTime(page, job, { start: "07:00", end: "17:00", breaks: "30" });
  const items = section.getByRole("listitem");
  await expect(items.filter({ hasText: "Working time, Kranbil 1" })).toContainText("7.5 h × NOK 1,200.00 · VAT 25 %");
  await expect(items.filter({ hasText: "Working time, Kranbil 1" })).toContainText("NOK 9,000.00");
  await expect(items.filter({ hasText: "Working time at the higher rate, Kranbil 1" })).toContainText("NOK 3,600.00");
  await expect(section).toContainText("The customer has no invoice e-mail.");

  const add = section.locator("details").filter({ has: page.getByText("Add a line", { exact: true }) });
  await openDetails(add);
  await add.getByRole("button", { name: "Add line" }).click();
  await expect(add.getByText("Write what the line is for.")).toBeVisible();
  await fillLine(add, { description: "Ferje Bergen–Stord", quantity: "2.5", unit: "stk", price: "123.45", vat: "25" });
  await add.getByRole("button", { name: "Add line" }).click();
  await expect(add.getByText("The line is added to the draft.")).toBeVisible();
  const ferry = items.filter({ hasText: "Ferje Bergen–Stord" });
  await expect(ferry).toContainText("2.5 stk × NOK 123.45 · VAT 25 %");
  await expect(ferry).toContainText("NOK 308.63");
  await fillLine(add, { description: "Bompenger", quantity: "1", unit: "", price: "80", vat: "0" });
  await add.getByRole("button", { name: "Add line" }).click();
  await expect(items.filter({ hasText: "Bompenger" })).toContainText("NOK 80.00");

  // 12 600 + 308,63 + 80; VAT 25 % of 12 908,63 = 3 227,16; VAT 0 % of 80.
  const totals = section.locator("dl").last();
  await expect(totals).toContainText("Total excl. VAT");
  await expect(totals).toContainText("NOK 12,988.63");
  await expect(totals).toContainText("VAT 25 % of NOK 12,908.63");
  await expect(totals).toContainText("NOK 3,227.16");
  await expect(totals).toContainText("VAT 0 % of NOK 80.00");
  await expect(totals).toContainText("NOK 16,215.79");

  // Three ferries instead: 370,35; VAT 25 % of 12 970,35 = 3 242,59.
  const change = ferry.locator("details");
  await openDetails(change);
  await change.locator('input[name="quantity"]').fill("3");
  await change.getByRole("button", { name: "Save line" }).click();
  await expect(ferry).toContainText("NOK 370.35");
  await expect(totals).toContainText("NOK 16,292.94");

  await openDetails(items.filter({ hasText: "Bompenger" }).locator("details"));
  await items.filter({ hasText: "Bompenger" }).getByRole("button", { name: "Remove line" }).click();
  await expect(items.filter({ hasText: "Bompenger" })).toHaveCount(0);
  await expect(totals).not.toContainText("VAT 0 %");
  await expect(totals).toContainText("NOK 16,212.94");

  await owner.context.close();
});

for (const locale of locales) {
  test(`invoice draft in ${locale} at every width`, async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const owner = await newPage(browser, baseURL!, locale);
    const { page } = owner;
    await signUp(page, newEmail(`shots-invoice-${locale}`), "Ingrid", "Ødegård-Kristiansen");
    await createCompany(page, `Vestlandets Kran- og Maskinentreprenør Faktura ${locale.toUpperCase()} AS`);
    await addMachine(page, { name: "Scania R650 med Hiab X-HiPro 1058 og grabb", rate: "2 150", minHours: "4", from: "15:00", percent: "50" });
    await addCustomer(page, "Vestlandske Entreprenørforretning og Byggevareimport Holding AS");
    const job = await addTodaysJob(page, {
      customer: "Vestlandske Entreprenørforretning og Byggevareimport Holding AS",
      vehicle: "Scania R650 med Hiab X-HiPro 1058 og grabb",
      driver: "Ingrid Ødegård-Kristiansen",
      address: "Industriveien 125, bygg C, 5257 Kokstad",
      contact: "Per Kristian Halvorsen-Bakketun, +47 912 34 567",
    });
    await driveThrough(page);
    await approveTime(page, job, { start: "06:30", end: "17:15", breaks: "45" });

    const section = page.locator('section[aria-labelledby="invoice-title"]');
    const add = section.locator("details").last();
    await openDetails(add);
    const separator = locale === "en" ? "." : ",";
    for (const line of [
      { description: "Ferjebillett Halhjem–Sandvikvåg, vogntog over 19 meter, tur-retur", quantity: "2", unit: "tur", price: `1 845${separator}50`, vat: "12" },
      { description: "Pukk 0–16 mm levert fra Kokstad steinbrudd", quantity: `12${separator}5`, unit: "tonn", price: "289", vat: "25" },
      { description: "Bompenger", quantity: "1", unit: "", price: "142", vat: "0" },
    ]) {
      await fillLine(add, line);
      await add.locator('button[type="submit"]').click();
      await expect(section.getByRole("listitem").filter({ hasText: line.description })).toHaveCount(1);
    }
    // Not "Pukk": the form hints say "Pukk 0–16 mm" too (nb).
    await openDetails(section.getByRole("listitem").filter({ hasText: "levert fra Kokstad steinbrudd" }).locator("details"));
    await section.scrollIntoViewIfNeeded();
    await shootAllWidths(page, "invoice", locale);

    await owner.context.close();
  });
}
