import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  addCustomer,
  addTodaysJob,
  addVehicle,
  createCompany,
  inviteColleague,
  locales,
  newCompanyName,
  newEmail,
  newPage,
  shootAllWidths,
  signUp,
} from "./helpers";

// These tests need a running Supabase with Storage (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

// A real JPEG to upload: a screenshot of the page itself.
async function photoOf(page: Page) {
  return { name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: await page.screenshot({ type: "jpeg", quality: 70 }) };
}

// A signature drawn with the pointer, as a finger would.
async function sign(card: Locator, page: Page, name: string) {
  await card.getByText(/^(Customer signature \(optional\)|Kundens signatur \(valgfritt\)|Kliento parašas \(nebūtinas\))$/).click();
  const pad = card.locator("canvas");
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height * 0.7);
  await page.mouse.down();
  for (const [dx, dy] of [[60, -40], [110, 20], [160, -50], [220, 10]]) {
    await page.mouse.move(box.x + dx, box.y + box.height * 0.6 + dy, { steps: 5 });
  }
  await page.mouse.up();
  await card.locator('input[id^="signer-"]').fill(name);
  await card.locator('input[id^="signer-"]').press("Tab");
  await card.locator("button").filter({ hasText: /^(Save signature|Lagre signatur|Išsaugoti parašą)$/ }).click();
}

async function loaded(image: Locator) {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
}

test("a driver adds a photo and the customer's signature; only the company sees them, through private links", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(180_000);
  const owner = await newPage(browser, baseURL!, "en");
  await signUp(owner.page, newEmail("files-owner"), "Anna", "Berg");
  await createCompany(owner.page, newCompanyName("files"));
  await owner.page.goto("/app/vehicles");
  await addVehicle(owner.page, { type: "crane_truck", name: "Kranbil 1" });
  await expect(owner.page.getByText("Kranbil 1 was added.")).toBeVisible();
  await addCustomer(owner.page, "Nordbygg AS");
  const driver = await inviteColleague(browser, baseURL!, owner.page, "driver", "Sander", "Lie");
  const job = await addTodaysJob(owner.page, {
    customer: "Nordbygg AS",
    vehicle: "Kranbil 1",
    driver: "Sander Lie",
    address: "Storgata 1, 0155 Oslo",
    contact: "Per, 912 34 567",
  });

  // On the phone: a photo, made smaller before it is sent, then the signature.
  const { page } = driver;
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/app/my-jobs");
  const card = page.getByRole("article", { name: "Nordbygg AS" });
  await card.locator('input[type="file"]').setInputFiles(await photoOf(page));
  const photo = card.getByRole("img", { name: /^Photo 1, / });
  await loaded(photo);
  await sign(card, page, "  Per   Hansen ");
  await expect(card.getByText(/^Signed by Per Hansen · /)).toBeVisible();
  await loaded(card.getByRole("img", { name: "Signature of Per Hansen" }));
  await expect(card.getByText("Customer signature (optional)", { exact: true })).toHaveCount(0);

  // The links are signed and short-lived; the same file is not public.
  const src = (await photo.getAttribute("src"))!;
  expect(src).toContain("/storage/v1/object/sign/job-files/");
  const publicUrl = src.replace("/object/sign/", "/object/public/").replace(/\?.*$/, "");
  expect((await request.get(publicUrl)).ok()).toBe(false);

  // The office sees both on the job.
  await owner.page.goto(job);
  const files = owner.page.getByRole("region", { name: "Photos and signature" });
  await loaded(files.getByRole("img", { name: /^Photo 1, / }));
  await expect(files.getByText(/^Signed by Per Hansen · /)).toBeVisible();

  await owner.context.close();
  await driver.context.close();
});

for (const locale of locales) {
  test(`photos and signature in ${locale} at every width`, async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const owner = await newPage(browser, baseURL!, locale);
    const { page } = owner;
    await signUp(page, newEmail(`shots-files-${locale}`), "Ingrid", "Ødegård-Kristiansen");
    await createCompany(page, `Vestlandets Kran- og Maskinentreprenør Bilder ${locale.toUpperCase()} AS`);
    await page.goto("/app/vehicles");
    await addVehicle(page, { type: "crane_truck_grab", name: "Scania R650 med Hiab X-HiPro 1058 og grabb" });
    await expect(page.locator('[role="status"]')).toBeVisible();
    await addCustomer(page, "Vestlandske Entreprenørforretning og Byggevareimport Holding AS");
    const job = await addTodaysJob(page, {
      customer: "Vestlandske Entreprenørforretning og Byggevareimport Holding AS",
      vehicle: "Scania R650 med Hiab X-HiPro 1058 og grabb",
      driver: "Ingrid Ødegård-Kristiansen",
      address: "Industriveien 125, bygg C, 5257 Kokstad",
      contact: "Per Kristian Halvorsen-Bakketun, +47 912 34 567",
    });

    await page.goto("/app/my-jobs");
    const card = page.getByRole("article");
    for (let i = 1; i <= 4; i++) {
      await card.locator('input[type="file"]').setInputFiles(await photoOf(page));
      await expect(card.locator("ul img")).toHaveCount(i);
    }
    await card.getByText(/^(Customer signature \(optional\)|Kundens signatur \(valgfritt\)|Kliento parašas \(nebūtinas\))$/).click();
    await shootAllWidths(page, "my-jobs-sign", locale);
    await page.setViewportSize({ width: 375, height: 900 });
    await sign(card, page, "Per Kristian Halvorsen-Bakketun");
    await expect(card.locator("figure img")).toBeVisible();
    await shootAllWidths(page, "my-jobs-files", locale);

    await page.goto(job);
    await expect(page.locator('section[aria-labelledby="files-title"] figure img')).toBeVisible();
    await shootAllWidths(page, "job-files", locale);

    await owner.context.close();
  });
}
