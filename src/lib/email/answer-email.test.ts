import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { answerEmail } = await import("./answer-email");

const answer = {
  accepted: true,
  company: 'Fjellkran "Vest" AS',
  name: "Kari\r\nNordmann",
  place: "Strandgaten 1, Bergen",
  wantedDate: "2026-12-01",
  message: "Vi ringer <deg> i morgen.",
  companyEmail: "post@fjellkran.test",
  companyPhone: "91234567",
  locale: "nb",
};

describe("answer e-mail", () => {
  it("tells the customer in Norwegian that the job is accepted", () => {
    const email = answerEmail(answer, { to: "kari@nordmann.test", testMode: false });
    expect(email.subject).toBe('Fjellkran "Vest" AS har godtatt forespørselen din');
    expect(email.text).toContain("Hei Kari Nordmann,");
    expect(email.text).toContain("Ønsket dato: 1. desember 2026");
    expect(email.text).toContain("Melding fra Fjellkran \"Vest\" AS:\nVi ringer <deg> i morgen.");
    expect(email.text).toContain("ring 912 34 567");
    expect(email.replyTo).toBe("post@fjellkran.test");
    expect(email.from).toBe('"Fjellkran Vest AS via MaskinGo" <foresporsel@maskingo.no>');
    expect(email.html).toContain("Vi ringer &lt;deg&gt; i morgen.");
    expect(email.html).not.toContain("<deg>");
  });

  it("answers in the customer's language, and says a decline plainly", () => {
    const lt = answerEmail({ ...answer, accepted: false, locale: "lt", message: null }, { to: "kari@nordmann.test", testMode: false });
    expect(lt.subject).toBe('Atsakymas į jūsų užklausą įmonei Fjellkran "Vest" AS');
    expect(lt.text).toContain('Deja, Fjellkran "Vest" AS negali atlikti šio darbo.');
    expect(lt.text).not.toContain("Žinutė");
    const en = answerEmail({ ...answer, locale: "en" }, { to: "kari@nordmann.test", testMode: false });
    expect(en.text).toContain("Preferred date: December 1, 2026");
  });

  it("falls back to Norwegian, and says plainly when it is a test", () => {
    const email = answerEmail({ ...answer, locale: "de", companyEmail: null, companyPhone: null }, { to: "kari@nordmann.test", testMode: true });
    expect(email.subject.startsWith("TEST: ")).toBe(true);
    expect(email.text.split("\n")[0]).toContain("Mottaker: kari@nordmann.test");
    expect(email.text).not.toContain("Spørsmål");
    expect(email.replyTo).toBeUndefined();
  });

  it("names a picked time in the company's time zone instead of the day", () => {
    const email = answerEmail(
      { ...answer, wantedStart: "2026-12-01T10:00:00Z", timeZone: "Europe/Oslo" },
      { to: "kari@nordmann.test", testMode: false },
    );
    expect(email.text).toMatch(/Ønsket tid: 1\. desember 2026.*11[:.]00/);
    expect(email.text).not.toContain("Ønsket dato");
  });
});
