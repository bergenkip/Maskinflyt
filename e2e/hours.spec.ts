import { expect, test } from "@playwright/test";
import {
  addCustomer,
  addMachine,
  addTodaysJob,
  approveTime,
  createCompany,
  driveThrough,
  inviteColleague,
  locales,
  newCompanyName,
  newEmail,
  newPage,
  resendStub,
  shootAllWidths,
  signUp,
  today,
} from "./helpers";

// These tests need a running Supabase (local `supabase start` in CI).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

test("a driver fills in an hours sheet, confirms it, and the accountant gets the PDF", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const owner = await newPage(browser, baseURL!, "en");
  await signUp(owner.page, newEmail("hours"), "Anna", "Berg");
  await createCompany(owner.page, newCompanyName("hours"));

  // The owner's rules: +50 % after 7.5 h, +100 % after 10 h; the accountant's e-mail.
  const accountant = `lonn-${Date.now()}@regnskap.test`;
  await owner.page.goto("/app/hours");
  await expect(owner.page.getByText("Overtime: after 8 h a day +50 %")).toBeVisible();
  await owner.page.getByRole("link", { name: "Overtime and accountant" }).click();
  const settings = owner.page.locator("main form");
  await settings.getByLabel("From (hours a day)").first().fill("7,5");
  await settings.getByLabel("From (hours a day)").nth(1).fill("10");
  await settings.getByLabel("Extra pay (%)").nth(1).fill("40");
  await settings.getByLabel("Accountant's e-mail").fill(accountant);
  await settings.getByRole("button", { name: "Save" }).click();
  await expect(settings.getByLabel("Extra pay (%)").nth(1)).toHaveAccessibleDescription("Must pay more than the first level.");
  await settings.getByLabel("Extra pay (%)").nth(1).fill("100");
  await settings.getByRole("button", { name: "Save" }).click();
  await expect(settings.getByRole("status")).toHaveText("Saved.");
  for (const locale of locales) {
    await owner.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await owner.page.goto("/app/hours/settings");
    await shootAllWidths(owner.page, "hour-settings", locale);
  }

  // The driver starts a sheet for November 2026.
  const driver = await inviteColleague(browser, baseURL!, owner.page, "driver", "Sander", "Lie");
  const { page } = driver;
  await page.getByRole("navigation", { name: "Main menu" }).getByRole("link", { name: "Hours" }).click();
  await expect(page.getByText("Overtime: after 7.5 h a day +50 %, after 10 h +100 %")).toBeVisible();
  await expect(page.getByRole("link", { name: "Overtime and accountant" })).toHaveCount(0);
  await page.getByLabel("From", { exact: true }).fill("2026-11-01");
  await page.getByLabel("To", { exact: true }).fill("2026-11-30");
  await page.getByRole("button", { name: "Start the sheet" }).click();
  await page.waitForURL(/\/app\/hours\/[0-9a-f-]{36}$/);
  const sheetUrl = page.url();

  // Two days: the form moves on to the next day and keeps the times.
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Save the day" }) });
  await expect(form.getByLabel("Date")).toHaveValue("2026-11-01");
  await form.getByLabel("Date").fill("2026-11-02");
  await form.getByLabel("Start").fill("07:00");
  await form.getByLabel("End", { exact: true }).fill("15:00");
  await form.getByLabel("Break (minutes)").fill("30");
  await form.getByRole("button", { name: "Save the day" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved. The next day is ready to fill in.");
  await expect(form.getByLabel("Date")).toHaveValue("2026-11-03");
  await form.getByLabel("Start").fill("06:00");
  await form.getByLabel("End", { exact: true }).fill("18:00");
  await form.getByLabel("Note (optional)").fill("Verksted og kran");
  await form.getByRole("button", { name: "Save the day" }).click();
  await expect(page.getByRole("heading", { name: "Days (2)" })).toBeVisible();
  // A day outside the period is told at the field.
  await form.getByLabel("Date").fill("2026-12-01");
  await form.getByRole("button", { name: "Save the day" }).click();
  await expect(form.getByLabel("Date")).toHaveAccessibleDescription("Choose a date in the sheet's period.");

  const days = page.locator("main ul").first();
  await expect(days.getByRole("listitem")).toHaveCount(2);
  await expect(days.getByRole("listitem").nth(1)).toContainText("11.50 h");
  await expect(days.getByRole("listitem").nth(1)).toContainText("Overtime +50 %: 2.50 · Overtime +100 %: 1.50");
  await expect(page.locator("dl")).toContainText("Total19.00 h");

  for (const locale of locales) {
    await driver.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await page.goto(sheetUrl);
    await shootAllWidths(page, "hours-sheet", locale);
  }
  await driver.context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await page.goto(sheetUrl);

  // Confirmed: locked, and e-mailed to the accountant (test inbox in test mode).
  await page.getByRole("button", { name: "Confirm and send" }).click();
  await expect(page.getByText("Confirm 2 days, 19.00 h? It cannot be changed afterwards.")).toBeVisible();
  await page.getByRole("button", { name: "Yes, confirm" }).click();
  await expect(page.getByText(`E-mailed to ${accountant}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save the day" })).toHaveCount(0);
  await expect(page.getByText(/^Confirmed /)).toBeVisible();

  const emails = (await (await page.request.get(`${resendStub}/emails`)).json()) as {
    to: string[]; subject: string; text: string; from: string; reply_to?: string[]; attachments: { filename: string; content: string }[];
  }[];
  const email = emails.find((sent) => sent.text.includes(`Mottaker: ${accountant}`));
  expect(email).toBeDefined();
  expect(email!.to).toEqual(["delivered@resend.dev"]);
  expect(email!.subject).toBe("TEST: Timeliste Sander Lie 01.11.2026–30.11.2026");
  expect(email!.text).toContain("Timer i alt: 19,00");
  expect(email!.text).toContain("Overtid 100 %: 1,50");
  expect(email!.attachments.map((file) => file.filename)).toEqual(["Timeliste-Sander-Lie-2026-11-01-2026-11-30.pdf"]);
  expect(Buffer.from(email!.attachments[0].content, "base64").subarray(0, 5).toString()).toBe("%PDF-");

  const pdf = await page.request.get(`${sheetUrl}/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // The sheet is the driver's own: the owner reads it, another employee does not.
  expect((await owner.page.request.get(`${sheetUrl}/pdf`)).status()).toBe(200);
  const colleague = await inviteColleague(browser, baseURL!, owner.page, "driver", "Kari", "Dahl");
  expect((await colleague.page.request.get(`${sheetUrl}/pdf`)).status()).toBe(404);
  await colleague.page.goto(sheetUrl);
  await expect(colleague.page.getByText("This page could not be found.")).toBeVisible();

  await page.goto("/app/hours");
  await expect(page.getByRole("listitem").filter({ hasText: "Confirmed" })).toContainText("19 h");
  await owner.context.close();
  await driver.context.close();
  await colleague.context.close();
});

test("overtime by the time of day: 15–19 +50 % and 19–06 +100 %", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const owner = await newPage(browser, baseURL!, "en");
  await signUp(owner.page, newEmail("hours-clock"), "Anna", "Berg");
  await createCompany(owner.page, newCompanyName("hours-clock"));
  const { page } = owner;

  await page.goto("/app/hours/settings");
  const settings = page.locator("main form");
  await settings.getByRole("radio", { name: /By the time of day/ }).check();
  await expect(settings.getByLabel("From (hours a day)")).toHaveCount(0);
  await settings.getByLabel("From", { exact: true }).first().fill("15:00");
  await settings.getByLabel("To", { exact: true }).first().fill("19:00");
  await settings.getByLabel("Extra pay (%)").first().fill("50");
  await settings.getByLabel("From", { exact: true }).nth(1).fill("19:00");
  await settings.getByLabel("Extra pay (%)").nth(1).fill("100");
  await settings.getByRole("button", { name: "Save" }).click();
  // The second window needs its end too.
  await expect(settings.getByLabel("To", { exact: true }).nth(1)).toHaveAccessibleDescription("Choose when it ends, not the same as the start.");
  await settings.getByLabel("To", { exact: true }).nth(1).fill("06:00");
  await settings.getByRole("button", { name: "Save" }).click();
  await expect(settings.getByRole("status")).toHaveText("Saved.");
  for (const locale of locales) {
    await owner.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await page.goto("/app/hours/settings");
    await shootAllWidths(page, "hour-settings-clock", locale);
  }
  await owner.context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);

  // The owner keeps a sheet too: one long day and one night.
  await page.goto("/app/hours");
  await expect(page.getByText("Overtime: 15:00–19:00 +50 %, 19:00–06:00 +100 %")).toBeVisible();
  await page.getByLabel("From", { exact: true }).fill("2026-11-01");
  await page.getByLabel("To", { exact: true }).fill("2026-11-30");
  await page.getByRole("button", { name: "Start the sheet" }).click();
  await page.waitForURL(/\/app\/hours\/[0-9a-f-]{36}$/);
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Save the day" }) });
  await form.getByLabel("Date").fill("2026-11-02");
  await form.getByLabel("Start").fill("07:00");
  await form.getByLabel("End", { exact: true }).fill("21:00");
  await form.getByLabel("Break (minutes)").fill("30");
  await form.getByRole("button", { name: "Save the day" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved. The next day is ready to fill in.");
  await form.getByLabel("Start").fill("22:00");
  await form.getByLabel("End", { exact: true }).fill("06:00");
  await form.getByRole("button", { name: "Save the day" }).click();
  await expect(page.getByRole("heading", { name: "Days (2)" })).toBeVisible();

  const days = page.locator("main ul").first();
  await expect(days.getByRole("listitem").first()).toContainText("13.50 h");
  await expect(days.getByRole("listitem").first()).toContainText("Overtime +50 %: 4.00 · Overtime +100 %: 2.00");
  await expect(days.getByRole("listitem").nth(1)).toContainText("Overtime +100 %: 7.50");
  await expect(page.locator("dl")).toContainText("Total21.00 h");
  await expect(page.locator("dl")).toContainText("Normal7.50 h");

  // Confirmed with the same numbers (the database splits it again), and the PDF is made.
  await page.getByRole("button", { name: "Confirm and send" }).click();
  await page.getByRole("button", { name: "Yes, confirm" }).click();
  await expect(page.getByText(/^Confirmed /)).toBeVisible();
  await expect(page.locator("dl")).toContainText("Overtime +100 %9.50 h");
  const pdf = await page.request.get(`${page.url()}/pdf`);
  expect(pdf.status()).toBe(200);
  await owner.context.close();
});

test("the accountant sees every employee's sheets and the finished jobs behind them", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const owner = await newPage(browser, baseURL!, "en");
  const { page } = owner;
  await signUp(page, newEmail("hours-all"), "Anna", "Berg");
  await createCompany(page, newCompanyName("hours-all"));

  // Anna drives a job today and the office approves 07:00–11:00.
  await addMachine(page, { name: "Kranbil 1", rate: "1200", minHours: "", from: "15:00", percent: "50" });
  await addCustomer(page, "Nordbygg AS");
  const job = await addTodaysJob(page, { customer: "Nordbygg AS", vehicle: "Kranbil 1", driver: "Anna Berg", address: "Storgata 1, 0155 Oslo", contact: "Per, 912 34 567" });
  await driveThrough(page);
  await approveTime(page, job, { start: "07:00", end: "11:00", breaks: "0" });

  // Her sheet for this month, with today written; not confirmed yet.
  await page.goto("/app/hours");
  await page.getByRole("button", { name: "Start the sheet" }).click();
  await page.waitForURL(/\/app\/hours\/[0-9a-f-]{36}$/);
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Save the day" }) });
  await form.getByLabel("Date").fill(today);
  await form.getByLabel("Start").fill("07:00");
  await form.getByLabel("End", { exact: true }).fill("11:00");
  await form.getByLabel("Break (minutes)").fill("0");
  await form.getByRole("button", { name: "Save the day" }).click();
  await expect(page.getByRole("heading", { name: "Days (1)" })).toBeVisible();

  // A driver has no way in; the accountant has.
  const driver = await inviteColleague(browser, baseURL!, page, "driver", "Sander", "Lie");
  await driver.page.goto("/app/hours");
  await expect(driver.page.getByRole("link", { name: /Employees' hours sheets/ })).toHaveCount(0);
  await driver.page.goto("/app/hours/all");
  await driver.page.waitForURL((url) => url.pathname === "/app/hours");

  const accountant = await inviteColleague(browser, baseURL!, page, "accountant", "Lise", "Regnskap");
  const books = accountant.page;
  await books.goto("/app/hours");
  await books.getByRole("link", { name: /Employees' hours sheets/ }).click();
  await books.waitForURL(/\/app\/hours\/all$/);
  const card = books.getByRole("listitem").filter({ hasText: "Anna Berg" });
  await expect(card).toContainText("Being filled in");
  await expect(card).toContainText("4 h");
  await expect(card).toContainText("1 job");
  // The month before has none.
  await books.getByRole("link", { name: "Previous month" }).click();
  await expect(books.getByText("No hours sheets for this month.")).toBeVisible();
  await books.getByRole("link", { name: "Next month" }).click();
  for (const locale of locales) {
    await accountant.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await books.reload();
    await shootAllWidths(books, "hours-all", locale);
  }
  await accountant.context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await books.reload();

  // The sheet lists the job; a press opens it.
  await books.getByRole("listitem").filter({ hasText: "Anna Berg" }).getByRole("link").click();
  await books.waitForURL(/\/app\/hours\/[0-9a-f-]{36}$/);
  const jobs = books.locator('section[aria-labelledby="jobs-title"]');
  await expect(jobs.getByRole("heading", { name: "Finished jobs in the period (1)" })).toBeVisible();
  await expect(jobs).toContainText("Nordbygg AS");
  await expect(jobs).toContainText("4.00 h");
  await expect(books.getByRole("button", { name: "Save the day" })).toHaveCount(0);
  for (const locale of locales) {
    await accountant.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await books.reload();
    await shootAllWidths(books, "hours-sheet-jobs", locale);
  }
  await accountant.context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await books.reload();
  await jobs.getByRole("link", { name: /^Job 1 · / }).click();
  await books.waitForURL(job);

  await owner.context.close();
  await driver.context.close();
  await accountant.context.close();
});
