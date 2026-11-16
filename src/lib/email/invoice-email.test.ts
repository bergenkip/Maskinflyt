import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { invoiceEmail, invoiceEmailLive, senderName } = await import("./invoice-email");
const { sendEmail } = await import("./resend");

const invoice = {
  number: 1001,
  issue_date: "2026-11-10",
  due_date: "2026-11-24",
  currency: "NOK",
  seller: {
    name: 'Fjellkran "Vest" <AS>',
    org_number: "123456785",
    country: "NO",
    street: "Kranveien 5",
    postal_code: "0581",
    city: "Oslo",
    vat_registered: true,
    in_business_register: true,
    bank_account: "12345678903",
    email: "faktura@fjellkran.test",
    phone: null,
  },
  buyer: { name: "Nordbygg AS", org_number: "987654325", street: null, postal_code: null, city: null, email: "faktura@nordbygg.test" },
  job: { number: 12, address: "Storgata 1, 0155 Oslo", ends_at: "2026-11-02T16:00:00Z", vehicle: "Kranbil 1", timezone: "Europe/Oslo" },
  net: 1305035,
  vat: 324259,
  total: 1629294,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("invoice e-mail", () => {
  it("says what to pay, by when and where, in Norwegian", () => {
    const email = invoiceEmail(invoice, { to: "faktura@nordbygg.test", testMode: false });
    expect(email.subject).toBe('Faktura 1001 fra Fjellkran "Vest" <AS>');
    expect(email.text).toContain("Vedlagt finner du faktura 1001");
    expect(email.text).toContain("Beløp å betale: 16 292,94 NOK");
    expect(email.text).toContain("Forfallsdato: 24.11.2026");
    expect(email.text).toContain("Kontonummer: 1234 56 78903");
    expect(email.text).not.toContain("TEST");
    expect(email.replyTo).toBe("faktura@fjellkran.test");
    expect(email.filename).toBe("Faktura-1001.pdf");
  });

  it("keeps the company's name out of the header syntax and escapes it in the HTML", () => {
    expect(senderName('Fjellkran "Vest" <AS>\r\nBcc: x@y.test')).toBe("Fjellkran Vest AS Bcc: x@y.test via MaskinGo");
    const email = invoiceEmail(invoice, { to: "faktura@nordbygg.test", testMode: false });
    expect(email.from).toBe('"Fjellkran Vest AS via MaskinGo" <faktura@maskingo.no>');
    expect(email.html).toContain("Fjellkran &quot;Vest&quot; &lt;AS&gt;");
    expect(email.html).not.toContain("<AS>");
  });

  it("says plainly when it is a test", () => {
    const email = invoiceEmail(invoice, { to: "faktura@nordbygg.test", testMode: true });
    expect(email.subject.startsWith("TEST: ")).toBe(true);
    expect(email.text.split("\n")[0]).toContain("ikke en ekte faktura. Mottaker: faktura@nordbygg.test");
  });

  it("is in test mode unless switched on", () => {
    expect(invoiceEmailLive()).toBe(false);
    vi.stubEnv("INVOICE_EMAIL_LIVE", "1");
    expect(invoiceEmailLive()).toBe(true);
  });
});

describe("sending through Resend", () => {
  const email = { from: "a", to: "b@c.test", subject: "s", text: "t", html: "h", idempotencyKey: "k1", attachments: [{ filename: "f.pdf", content: new Uint8Array([37, 80]) }] };

  it("sends nothing without the key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail(email)).toEqual({ ok: false, reason: "notConfigured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the e-mail with its attachment and idempotency key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail(email)).toEqual({ ok: true, id: "msg_1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers["Idempotency-Key"]).toBe("k1");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["b@c.test"]);
    expect(body.attachments).toEqual([{ filename: "f.pdf", content: "JVA=" }]);
  });

  it("reports a refusal", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 422 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendEmail(email)).toEqual({ ok: false, reason: "rejected" });
  });
});
