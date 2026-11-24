import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { requestEmail } = await import("./request-email");

const request = {
  company: 'Fjellkran "Vest" <AS>',
  name: "Kari\r\nBcc: x@y.test",
  phone: "+4791234567",
  email: "kari@nordmann.test",
  place: "Strandgaten 1, Bergen",
  wantedDate: "2026-12-01",
  service: "Kranbil",
  description: "Løfte <takstein>\nHelst før lunsj.",
};

describe("request e-mail", () => {
  it("tells the company what the customer asked for, in Norwegian", () => {
    const email = requestEmail(request, { to: "post@fjellkran.test", testMode: false });
    expect(email.subject).toBe("Ny forespørsel fra Kari Bcc: x@y.test");
    expect(email.text).toContain("Telefon: +47 912 34 567");
    expect(email.text).toContain("Ønsket dato: 01.12.2026");
    expect(email.text).toContain("Tjeneste: Kranbil");
    expect(email.text).toContain("Løfte <takstein>\nHelst før lunsj.");
    expect(email.text).toContain("https://maskingo.no/app/jobs/requests");
    expect(email.text).not.toContain("TEST");
    expect(email.replyTo).toBe("kari@nordmann.test");
    expect(email.from).toBe('"Fjellkran Vest AS via MaskinGo" <foresporsel@maskingo.no>');
  });

  it("escapes what the customer wrote and keeps line breaks out of the subject", () => {
    const email = requestEmail(request, { to: "post@fjellkran.test", testMode: false });
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.html).toContain("Løfte &lt;takstein&gt;");
    expect(email.html).not.toContain("<takstein>");
  });

  it("leaves out what was not given, and says plainly when it is a test", () => {
    const email = requestEmail({ ...request, email: null, wantedDate: null, service: null }, { to: "post@fjellkran.test", testMode: true });
    expect(email.subject.startsWith("TEST: ")).toBe(true);
    expect(email.text.split("\n")[0]).toContain("Mottaker: post@fjellkran.test");
    expect(email.text).not.toContain("Ønsket dato");
    expect(email.text).not.toContain("svaret direkte");
    expect(email.replyTo).toBeUndefined();
  });
});
