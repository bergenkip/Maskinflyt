import { expect, test } from "@playwright/test";
import { createCompany, locales, newCompanyName, newEmail, newPage, resendStub, shootAllWidths, signUp } from "./helpers";

// Stage 15b-1: a customer sends a request from the company page, without an
// account; the company gets an e-mail and sees it in the app. Needs Supabase
// and the e-mail stand-in (the e2e-auth CI job).
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "needs Supabase: run in the e2e-auth CI job");

test("a visitor sends a request; the company is told and reads it", async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const { page } = await newPage(browser, baseURL!, "en");
  await signUp(page, newEmail("requests"), "Anna", "Berg");
  const name = newCompanyName("requests");
  await createCompany(page, name);

  // Before the page is public there is nothing to answer.
  await page.goto("/app/jobs/requests");
  await expect(page.getByText("No requests yet. Customers can send them once your company page is public.")).toBeVisible();

  const companyEmail = `post-${Date.now()}@fjellkran.test`;
  await page.goto("/app/public-page");
  const slug = await page.getByLabel("Address").inputValue();
  await page.getByLabel("About the company").fill("Kranbil med fører i Bergen.");
  await page.getByRole("checkbox", { name: "Crane truck" }).check();
  await page.getByRole("checkbox", { name: "Transport", exact: true }).check();
  await page.getByLabel("Town or city").fill("Bergen");
  await page.getByLabel("E-mail").fill(companyEmail);
  await page.getByRole("checkbox", { name: "Show publicly" }).check();
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved. The page is public.")).toBeVisible();

  // The visitor: the button leads to the form; empty fields are explained next to each field.
  const visitor = await newPage(browser, baseURL!, "en");
  await visitor.page.goto(`/firma/${slug}`);
  await visitor.page.getByRole("link", { name: "Send a request" }).click();
  await expect(visitor.page).toHaveURL(/#request$/);
  const form = visitor.page.getByRole("region", { name: "Send a request" });
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(form.getByText("Enter your name.")).toBeVisible();
  await expect(form.getByText("Give a phone number or an e-mail address.")).toBeVisible();
  await expect(form.getByText("Enter where the job is.")).toBeVisible();
  await expect(form.getByText("Describe briefly what you need.")).toBeVisible();

  for (const locale of locales) {
    await visitor.context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await visitor.page.goto(`/firma/${slug}`);
    await shootAllWidths(visitor.page, "job-request-form", locale);
  }
  await visitor.context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  // A full load (a link with only "#request" would not reload the page in the new language).
  await visitor.page.goto(`/firma/${slug}`);
  await expect(visitor.page.locator("html")).toHaveAttribute("lang", "en");

  // Only the company's own services are offered.
  const service = form.getByLabel("Service");
  await expect(service.locator("option")).toHaveText(["Not sure / other", "Crane truck", "Transport"]);

  await form.getByLabel("Name").fill("Kari Nordmann");
  await form.getByLabel("Phone").fill("+47 912 34 568");
  await form.getByLabel("E-mail").fill("kari@nordmann.test");
  await form.getByLabel("Where is the job?").fill("Strandgaten 1, Bergen");
  await service.selectOption("crane_truck");
  // A month ahead: the form takes today up to two years ahead.
  const wanted = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await form.getByLabel("Preferred date (optional)").fill(wanted);
  await form.getByLabel("What do you need help with?").fill("Løfte takstein til 3. etasje.\nHelst før lunsj.");
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(form.getByText("Your request has been sent")).toBeVisible();
  await expect(form.getByText(`${name} has received your request and will contact you.`, { exact: false })).toBeVisible();
  await shootAllWidths(visitor.page, "job-request-sent", "en");

  // The company is told by e-mail (the test inbox in test mode); a reply goes to the customer.
  const emails = (await (await page.request.get(`${resendStub}/emails`)).json()) as {
    to: string[]; subject: string; text: string; from: string; reply_to?: string[];
  }[];
  const email = emails.find((sent) => sent.text.includes(`Mottaker: ${companyEmail}`));
  expect(email).toBeDefined();
  expect(email!.to).toEqual(["delivered@resend.dev"]);
  expect(email!.subject).toBe("TEST: Ny forespørsel fra Kari Nordmann");
  expect(email!.reply_to).toEqual(["kari@nordmann.test"]);
  expect(email!.text).toContain("Telefon: +47 912 34 568");
  expect(email!.text).toContain(`Ønsket dato: ${wanted.split("-").reverse().join(".")}`);
  expect(email!.text).toContain("Tjeneste: Kranbil");

  // The office: a card on the overview, a mark on the jobs, and the request itself.
  await page.goto("/app");
  await expect(page.getByRole("link", { name: /New requests/ })).toContainText("1");
  await page.goto("/app/jobs");
  await expect(page.getByRole("link", { name: /Requests from the company page/ })).toContainText("1 new");
  await page.getByRole("link", { name: /Requests from the company page/ }).click();
  await page.waitForURL("**/app/jobs/requests");
  const request = page.getByRole("article", { name: "Kari Nordmann" });
  await expect(request.getByText("New", { exact: true })).toBeVisible();
  await expect(request.getByText("Strandgaten 1, Bergen")).toBeVisible();
  await expect(request.getByText("Crane truck")).toBeVisible();
  await expect(request.getByText(new RegExp(`^Preferred: .*${wanted.slice(0, 4)}$`))).toBeVisible();
  await expect(request.getByRole("link", { name: "+47 912 34 568" })).toHaveAttribute("href", "tel:+4791234568");
  await expect(request.getByRole("link", { name: "kari@nordmann.test" })).toHaveAttribute("href", "mailto:kari@nordmann.test");

  // A second request, by phone only, to be declined.
  await visitor.page.goto(`/firma/${slug}`);
  await form.getByLabel("Name").fill("Ola Nordmann");
  await form.getByLabel("Phone").fill("900 00 001");
  await form.getByLabel("Where is the job?").fill("Fjellveien 9, Bergen");
  await form.getByLabel("What do you need help with?").fill("Graving av grøft, ca. 25 meter.");
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(form.getByText("Your request has been sent")).toBeVisible();

  await page.goto("/app/jobs/requests");
  for (const locale of locales) {
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await page.goto("/app/jobs/requests");
    await expect(page, "the owner stays on the requests").toHaveURL(/\/app\/jobs\/requests$/);
    await shootAllWidths(page, "job-requests", locale);
  }
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await page.goto("/app/jobs/requests");

  // Declining asks once more; the customer without e-mail is to be called.
  const ola = page.getByRole("article", { name: "Ola Nordmann" });
  await expect(ola.getByText("The customer has no e-mail: call them with your answer.")).toBeVisible();
  await ola.getByRole("button", { name: "Decline" }).click();
  await ola.getByRole("button", { name: "Cancel" }).click();
  await ola.getByLabel("Message to the customer (optional)").fill("Beklager, vi har ikke ledig gravemaskin.");
  await ola.getByRole("button", { name: "Decline" }).click();
  await expect(ola.getByText("Decline the request from Ola Nordmann? It cannot be undone.")).toBeVisible();
  await ola.getByRole("button", { name: "Yes, decline" }).click();
  await expect(ola.getByText("Declined", { exact: true })).toBeVisible();
  await expect(ola.getByText("Beklager, vi har ikke ledig gravemaskin.")).toBeVisible();
  await expect(ola.getByRole("button", { name: "Decline" })).toHaveCount(0);

  // Accepting adds Kari as a customer and opens the job form, filled in from the request.
  const kari = page.getByRole("article", { name: "Kari Nordmann" });
  await kari.getByLabel("Message to the customer (optional)").fill("Vi ringer deg i morgen.");
  await kari.getByRole("button", { name: "Accept and plan the job" }).click();
  await page.waitForURL("**/app/jobs/new?**");
  await expect(page.getByText("The customer has been told by e-mail.")).toBeVisible();
  await expect(page.getByText("From the request of Kari Nordmann. Choose the time and save the job.")).toBeVisible();
  await expect(page.getByLabel("Customer").locator("option:checked")).toContainText("Kari Nordmann");
  await expect(page.getByLabel("Address")).toHaveValue("Strandgaten 1, Bergen");
  await expect(page.getByLabel("What is to be done")).toHaveValue("Løfte takstein til 3. etasje.\nHelst før lunsj.");
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(wanted);

  // Kari is told in English, the language the request was written in; replies go to the company.
  const answers = (await (await page.request.get(`${resendStub}/emails`)).json()) as {
    to: string[]; subject: string; text: string; reply_to?: string[];
  }[];
  const answer = answers.find((sent) => sent.text.includes("Recipient: kari@nordmann.test") && sent.subject.includes(name));
  expect(answer).toBeDefined();
  expect(answer!.subject).toBe(`TEST: ${name} has accepted your request`);
  expect(answer!.text).toContain("Vi ringer deg i morgen.");
  expect(answer!.reply_to).toEqual([companyEmail]);

  // Answered requests no longer count as new.
  await page.goto("/app/jobs");
  await expect(page.getByRole("link", { name: /Requests from the company page/ })).not.toContainText("new");
  await page.goto("/app/jobs/requests");
  await expect(kari.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(kari.getByRole("link", { name: "Plan the job" })).toBeVisible();
  await shootAllWidths(page, "job-requests-answered", "en");
});
