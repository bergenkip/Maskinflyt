import { expect, test } from "@playwright/test";
import { createCompany, fillSignUp, locales, newCompanyName, newEmail, newPage, resendStub, shootAllWidths, signUp } from "./helpers";

// Stage 16a: a customer signs up as a customer (no company), sends a request
// with their details filled in, follows it on /kunde and orders again. The
// company still accepts it and plans the job by hand; the customer then sees
// the planned time and gets it by e-mail (16b). Needs Supabase (the e2e-auth CI job).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

test("a customer account orders, follows the answer and orders again", async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const { page } = await newPage(browser, baseURL!, "en");
  await signUp(page, newEmail("cust-owner"), "Anna", "Berg");
  const name = newCompanyName("cust");
  await createCompany(page, name);
  await page.goto("/app/public-page");
  const slug = await page.getByLabel("Address").inputValue();
  await page.getByLabel("About the company").fill("Kranbil med fører i Bergen.");
  await page.getByRole("checkbox", { name: "Crane truck" }).check();
  await page.getByLabel("Town or city").fill("Bergen");
  await page.getByLabel("E-mail").fill(`post-${Date.now()}@fjellkran.test`);
  await page.getByRole("checkbox", { name: "Show publicly" }).check();
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved. The page is public.")).toBeVisible();

  // Signed out, /kunde asks to sign in first.
  const customer = await newPage(browser, baseURL!, "en");
  await customer.page.goto("/kunde");
  await customer.page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("next") === "/kunde");

  // The company page invites to a customer account; the form still works without one.
  await customer.page.goto(`/firma/${slug}`);
  const form = customer.page.getByRole("region", { name: "Send a request" });
  await expect(form.getByRole("heading", { name: "Order faster with a customer account" })).toBeVisible();
  await form.getByRole("link", { name: "Create a customer account" }).click();
  await customer.page.waitForURL("**/signup?konto=kunde");
  await expect(customer.page.getByRole("heading", { level: 1, name: "Create a customer account" })).toBeVisible();
  const email = newEmail("customer");
  await fillSignUp(customer.page, email, "Kari", "Nordmann");
  await customer.page.waitForURL((url) => url.pathname === "/kunde");
  await expect(customer.page.getByRole("heading", { level: 1, name: "Hi, Kari" })).toBeVisible();
  await expect(customer.page.getByText("No requests yet.", { exact: false })).toBeVisible();

  // The details that fill in every request.
  const details = customer.page.getByRole("region", { name: "Your details" });
  await details.getByLabel("Phone").fill("12");
  await details.getByRole("button", { name: "Save" }).click();
  await expect(details.getByText("Enter a valid phone number.")).toBeVisible();
  await details.getByLabel("Phone").fill("+47 912 34 569");
  await details.getByLabel("Usual place of work").fill("Strandgaten 1, Bergen");
  await details.getByRole("button", { name: "Save" }).click();
  await expect(details.getByText("Saved.")).toBeVisible();

  // A customer without a company is never asked to create one.
  await customer.page.goto("/app");
  await customer.page.waitForURL((url) => url.pathname === "/kunde");

  // Ordering: the form is filled in from the account.
  await customer.page.goto(`/firma/${slug}`);
  await expect(form.getByText("Signed in as Kari Nordmann.", { exact: false })).toBeVisible();
  await expect(form.getByLabel("Name")).toHaveValue("Kari Nordmann");
  await expect(form.getByLabel("Phone")).toHaveValue("+47 912 34 569");
  await expect(form.getByLabel("E-mail")).toHaveValue(email);
  await expect(form.getByLabel("Where is the job?")).toHaveValue("Strandgaten 1, Bergen");
  await form.getByLabel("What do you need help with?").fill("Løfte takstein til 3. etasje.");
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(form.getByText("Your request has been sent")).toBeVisible();
  await form.getByRole("link", { name: "See your requests" }).click();
  await customer.page.waitForURL((url) => url.pathname === "/kunde");
  const mine = customer.page.getByRole("article", { name });
  await expect(mine.getByText("Waiting for an answer")).toBeVisible();
  await expect(customer.page.getByRole("region", { name: "Your companies" }).getByText("1 request")).toBeVisible();

  // The office sees that it came from a customer account, and accepts it by hand.
  await page.goto("/app/jobs/requests");
  const kari = page.getByRole("article", { name: "Kari Nordmann" });
  await expect(kari.getByText("Customer account, e-mail confirmed")).toBeVisible();
  await kari.getByLabel("Message to the customer (optional)").fill("Vi kommer tirsdag.");
  await kari.getByRole("button", { name: "Accept and plan the job" }).click();
  await page.waitForURL("**/app/jobs/new?**");

  // Accepted, not planned yet: the customer is told the company will set the time.
  await customer.page.reload();
  await expect(mine.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(mine.getByText(`Answer from ${name}`)).toBeVisible();
  await expect(mine.getByText("Vi kommer tirsdag.")).toBeVisible();
  await expect(mine.getByText(`${name} will plan the time and let you know.`)).toBeVisible();

  // The office plans the job; the customer is told the time by e-mail (stage 16b).
  const day = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  await page.locator('input[name="date"]').fill(day);
  await page.locator('input[name="startTime"]').fill("08:00");
  await page.locator('input[name="durationHours"]').fill("4");
  await expect(page.getByRole("checkbox", { name: "Send the planned time to the customer" })).toBeChecked();
  await expect(page.getByText(`By e-mail to ${email}, once the job is saved.`)).toBeVisible();
  await shootAllWidths(page, "job-from-request", "en");
  await page.getByRole("button", { name: "Add job" }).click();
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]{36}\?added=1/);
  await expect(page.getByText("The customer got the planned time by e-mail.")).toBeVisible();
  const sent = (await (await page.request.get(`${resendStub}/emails`)).json()) as { subject: string; text: string; to: string[] }[];
  const planned = sent.find((one) => one.text.includes(`Recipient: ${email}`) && one.subject === `TEST: ${name} has planned your job`);
  expect(planned).toBeDefined();
  expect(planned!.to).toEqual(["delivered@resend.dev"]);
  expect(planned!.text).toMatch(/Time: .*8:00.AM.*12:00.PM/);
  expect(planned!.text).toContain("Place: Strandgaten 1, Bergen");
  expect(planned!.text).toContain("https://maskingo.no/kunde");

  // The request now leads to its job, and is planned only once.
  await page.goto("/app/jobs/requests");
  await expect(kari.getByRole("link", { name: /Planned: job \d+/ })).toBeVisible();
  await expect(kari.getByRole("link", { name: "Plan the job" })).toHaveCount(0);

  // The customer sees the planned time.
  await customer.page.reload();
  await expect(mine.getByText("Planned", { exact: true })).toBeVisible();
  await expect(mine.getByText("Planned time")).toBeVisible();
  await expect(mine.getByText(/8:00.AM.*12:00.PM/)).toBeVisible();
  await expect(mine.getByText("The end time is an estimate.", { exact: false })).toBeVisible();
  for (const locale of locales) {
    await customer.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await customer.page.goto("/kunde");
    await shootAllWidths(customer.page, "customer-account", locale);
  }
  await customer.context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await customer.page.goto("/kunde");

  // Ordering again: the earlier request fills in the form.
  await mine.getByRole("link", { name: "Send again" }).click();
  await customer.page.waitForURL(/\/firma\/.+\?gjenta=/);
  await expect(form.getByLabel("What do you need help with?")).toHaveValue("Løfte takstein til 3. etasje.");
  await expect(form.getByLabel("Where is the job?")).toHaveValue("Strandgaten 1, Bergen");
});
