import { expect, test } from "@playwright/test";
import { createCompany, locales, newCompanyName, newEmail, newPage, resendStub, shootAllWidths, signUp } from "./helpers";

// Stage 15c: the company opens its free times; a visitor picks one on the
// company page; the office sees the time and plans the job at it. Turned off,
// the page takes plain requests again. Needs Supabase and the e-mail stand-in
// (the e2e-auth CI job).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

test("a visitor picks a free time; the office plans the job at it", async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const { page } = await newPage(browser, baseURL!, "en");
  await signUp(page, newEmail("times"), "Anna", "Berg");
  const name = newCompanyName("times");
  await createCompany(page, name);

  // Free times need a company page first.
  await page.goto("/app/public-page");
  const times = page.getByRole("region", { name: "Free times" });
  await expect(times.getByText("Create the company page first, then open your times.")).toBeVisible();

  const slug = await page.getByLabel("Address").inputValue();
  await page.getByLabel("About the company").fill("Kranbil med fører i Bergen.");
  await page.getByRole("checkbox", { name: "Crane truck" }).check();
  await page.getByLabel("Town or city").fill("Bergen");
  await page.getByLabel("E-mail").fill(`post-${Date.now()}@fjellkran.test`);
  await page.getByRole("checkbox", { name: "Show publicly" }).check();
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved. The page is public.")).toBeVisible();
  await page.reload();

  // Showing times with no open day is explained; then every day 08–16, two-hour bookings.
  await times.getByRole("radio", { name: "Show free times" }).check();
  await times.getByRole("button", { name: "Save" }).click();
  await expect(times.getByText("Open at least one day to show free times.")).toBeVisible();
  for (const day of weekdayNames) {
    await times.getByRole("checkbox", { name: `Open on ${day}` }).check();
    await times.getByLabel(`From ${day}`).fill("08:00");
    await times.getByLabel(`To ${day}`).fill("16:00");
  }
  await times.getByLabel("Length of one booking").selectOption("120");
  await times.getByRole("button", { name: "Save" }).click();
  await expect(times.getByText("Saved. Customers see your free times.")).toBeVisible();

  // A day off three days ahead is not offered.
  const dayOff = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await times.getByLabel("Day", { exact: true }).fill(dayOff);
  await times.getByLabel("Note (optional)").fill("Juleferie");
  await times.getByRole("button", { name: "Add day off" }).click();
  await expect(times.getByText("Juleferie")).toBeVisible();

  for (const locale of locales) {
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await page.goto("/app/public-page");
    await shootAllWidths(page, "company-hours", locale);
  }
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);

  // The visitor sees the days and the times, not the date field.
  const visitor = await newPage(browser, baseURL!, "en");
  for (const locale of locales) {
    await visitor.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await visitor.page.goto(`/firma/${slug}`);
    const region = visitor.page.locator("#request");
    await region.locator("select").first().selectOption({ index: 1 });
    await shootAllWidths(visitor.page, "job-request-times", locale);
  }
  await visitor.context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await visitor.page.goto(`/firma/${slug}`);
  await expect(visitor.page.locator("html")).toHaveAttribute("lang", "en");
  const form = visitor.page.getByRole("region", { name: "Send a request" });
  await expect(form.getByText("Pick a time (optional)")).toBeVisible();
  await expect(form.locator('input[type="date"]')).toHaveCount(0);
  const daySelect = form.getByRole("combobox", {
    name: "Preferred date (optional)",
  });
  await expect(daySelect.locator(`option[value="${dayOff}"]`)).toHaveCount(0);
  await daySelect.selectOption({ index: 1 });
  const chosenDay = await daySelect.inputValue();
  const firstTime = form.getByRole("radio").first();
  await expect(firstTime).toBeChecked();
  const startsAt = await firstTime.getAttribute("value");
  const clock = (await form.locator("label", { has: firstTime }).innerText()).trim();
  expect(clock).toMatch(/^\d{2}:\d{2}$/);

  await form.getByLabel("Name").fill("Kari Nordmann");
  await form.getByLabel("E-mail").fill("kari@nordmann.test");
  await form.getByLabel("Where is the job?").fill("Strandgaten 1, Bergen");
  await form.getByLabel("What do you need help with?").fill("Løfte takstein til 3. etasje.");
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(form.getByText("Your request has been sent")).toBeVisible();

  // With one machine slot, the time is now taken for the next visitor.
  await visitor.page.goto(`/firma/${slug}`);
  const daySelectAgain = form.getByRole("combobox", {
    name: "Preferred date (optional)",
  });
  if ((await daySelectAgain.locator(`option[value="${chosenDay}"]`).count()) > 0) {
    await daySelectAgain.selectOption(chosenDay);
    await expect(form.locator(`input[value="${startsAt}"]`)).toHaveCount(0);
  }

  // The company e-mail names the time.
  const emails = (await (await page.request.get(`${resendStub}/emails`)).json()) as { subject: string; text: string }[];
  const email = emails.find((sent) => sent.subject === "TEST: Ny forespørsel fra Kari Nordmann" && sent.text.includes("Ønsket tid:"));
  expect(email, "the company e-mail names the picked time").toBeDefined();
  expect(email!.text).toContain(`kl. ${clock}`);

  // The office sees the time and plans the job at it.
  await page.goto("/app/jobs/requests");
  const kari = page.getByRole("article", { name: "Kari Nordmann" });
  await expect(kari.getByText(new RegExp(`^Preferred: .* at ${clock}$`))).toBeVisible();
  await kari.getByRole("button", { name: "Accept and plan the job" }).click();
  await page.waitForURL("**/app/jobs/new?**");
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(chosenDay);
  await expect(page.getByLabel("Start", { exact: true })).toHaveValue(clock);

  const answers = (await (await page.request.get(`${resendStub}/emails`)).json()) as { subject: string; text: string }[];
  const answer = answers.find((sent) => sent.text.includes("Recipient: kari@nordmann.test") && sent.subject.includes(name));
  expect(answer).toBeDefined();
  expect(answer!.text).toMatch(new RegExp(`Preferred time: .*${clock.replace(":", "[:.]")}`));

  // Turned off: customers write a wished-for day again.
  await page.goto("/app/public-page");
  await times.getByRole("radio", { name: "Requests only" }).check();
  await times.getByRole("button", { name: "Save" }).click();
  await expect(times.getByText("Saved. Customers send requests only.")).toBeVisible();
  await visitor.page.goto(`/firma/${slug}`);
  await expect(form.locator('input[type="date"]')).toBeVisible();
  await expect(form.getByText("Pick a time (optional)")).toHaveCount(0);
});
