import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { plannedEmail } = await import("./planned-email");

const job = {
  company: 'Fjellkran "Vest" AS',
  name: "Kari\r\nNordmann",
  address: "Strandgaten <1>, Bergen",
  startsAt: "2026-12-01T07:00:00.000Z",
  endsAt: "2026-12-01T11:00:00.000Z",
  timeZone: "Europe/Oslo",
  companyEmail: "post@fjellkran.test",
  companyPhone: "91234567",
  locale: "nb",
  hasAccount: true,
};

describe("planned e-mail", () => {
  it("tells the customer the planned time in the company's time zone", () => {
    const email = plannedEmail(job, { to: "kari@nordmann.test", testMode: false });
    expect(email.subject).toBe('Fjellkran "Vest" AS har planlagt jobben din');
    expect(email.text).toContain("Hei Kari Nordmann,");
    expect(email.text).toMatch(/Tidspunkt: tirsdag 1\. desember 2026.*08:00.*12:00/);
    expect(email.text).toContain("Sted: Strandgaten <1>, Bergen");
    expect(email.text).toContain("Sluttidspunktet er et anslag.");
    expect(email.text).toContain("https://maskingo.no/kunde");
    expect(email.text).toContain("ring 912 34 567");
    expect(email.replyTo).toBe("post@fjellkran.test");
    expect(email.from).toBe('"Fjellkran Vest AS via MaskinGo" <foresporsel@maskingo.no>');
    expect(email.html).toContain("Strandgaten &lt;1&gt;, Bergen");
    expect(email.html).not.toContain("<1>");
  });

  it("writes in the customer's language, and leaves out the customer page without an account", () => {
    const en = plannedEmail({ ...job, locale: "en", hasAccount: false }, { to: "kari@nordmann.test", testMode: false });
    expect(en.subject).toBe('Fjellkran "Vest" AS has planned your job');
    expect(en.text).toMatch(/Time: Tuesday, December 1, 2026.*8:00.*12:00.PM/);
    expect(en.text).not.toContain("/kunde");
    const lt = plannedEmail({ ...job, locale: "lt" }, { to: "kari@nordmann.test", testMode: false });
    expect(lt.subject).toBe('Fjellkran "Vest" AS suplanavo jūsų darbą');
  });

  it("falls back to Norwegian, and says plainly when it is a test", () => {
    const email = plannedEmail({ ...job, locale: "de", companyEmail: null, companyPhone: null }, { to: "kari@nordmann.test", testMode: true });
    expect(email.subject.startsWith("TEST: ")).toBe(true);
    expect(email.text.split("\n")[0]).toContain("Mottaker: kari@nordmann.test");
    expect(email.text).not.toContain("Spørsmål");
    expect(email.replyTo).toBeUndefined();
  });
});
