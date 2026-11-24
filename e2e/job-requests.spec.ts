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
  await visitor.page.goto(`/firma/${slug}#request`);

  // Only the company's own services are offered.
  const service = form.getByLabel("Service");
  await expect(service.locator("option")).toHaveText(["Not sure / other", "Crane truck", "Transport"]);

  await form.getByLabel("Name").fill("Kari Nordmann");
  await form.getByLabel("Phone").fill("+47 912 34 568");
  await form.getByLabel("E-mail").fill("kari@nordmann.test");
  await form.getByLabel("Where is the job?").fill("Strandgaten 1, Bergen");
  await service.selectOption("crane_truck");
  await form.getByLabel("Preferred date (optional)").fill("2030-06-14");
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
  expect(email!.text).toContain("Ønsket dato: 14.06.2030");
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
  await expect(request.getByText(/^Preferred: .*2030$/)).toBeVisible();
  await expect(request.getByRole("link", { name: "+47 912 34 568" })).toHaveAttribute("href", "tel:+4791234568");
  await expect(request.getByRole("link", { name: "kari@nordmann.test" })).toHaveAttribute("href", "mailto:kari@nordmann.test");

  for (const locale of locales) {
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
    await page.goto("/app/jobs/requests");
    await expect(page, "the owner stays on the requests").toHaveURL(/\/app\/jobs\/requests$/);
    await shootAllWidths(page, "job-requests", locale);
  }
});
