import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { addressOf, buildForward, verifyWebhook } = await import("./inbound");

const secret = `whsec_${Buffer.from("test-signing-key-123").toString("base64")}`;

function sign(body: string, id: string, timestamp: number): string {
  const key = Buffer.from(secret.slice(6), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

describe("webhook signature", () => {
  const body = '{"type":"email.received","data":{"email_id":"abc"}}';
  const now = 1_800_000_000;

  it("accepts a correctly signed message", () => {
    const headers = { id: "msg_1", timestamp: String(now), signature: sign(body, "msg_1", now) };
    expect(verifyWebhook(body, headers, secret, now)).toBe(true);
  });

  it("accepts when one of several signatures matches", () => {
    const headers = { id: "msg_1", timestamp: String(now), signature: `v1,AAAA ${sign(body, "msg_1", now)}` };
    expect(verifyWebhook(body, headers, secret, now)).toBe(true);
  });

  it("rejects a changed body", () => {
    const headers = { id: "msg_1", timestamp: String(now), signature: sign(body, "msg_1", now) };
    expect(verifyWebhook(body.replace("abc", "xyz"), headers, secret, now)).toBe(false);
  });

  it("rejects an old message", () => {
    const headers = { id: "msg_1", timestamp: String(now - 600), signature: sign(body, "msg_1", now - 600) };
    expect(verifyWebhook(body, headers, secret, now)).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(verifyWebhook(body, { id: null, timestamp: String(now), signature: "v1,x" }, secret, now)).toBe(false);
  });
});

describe("forwarded e-mail", () => {
  const received = {
    id: "rcv_1",
    from: "Kari Nordmann <Kari@Fjellkran.test>",
    to: ["hei@maskingo.no"],
    subject: "Re: MaskinGo\r\nBcc: x@evil.test",
    text: "Hei, <b>interessert</b>!",
    html: null,
    created_at: "2026-11-25T15:00:00Z",
    attachments: [{}],
  };

  it("goes to the owner with reply-to the customer", () => {
    const email = buildForward(received, "owner@inbox.test")!;
    expect(email.to).toBe("owner@inbox.test");
    expect(email.from).toBe("MaskinGo <hei@maskingo.no>");
    expect(email.replyTo).toBe("kari@fjellkran.test");
    expect(email.idempotencyKey).toBe("inbound-rcv_1");
  });

  it("keeps the subject on one line", () => {
    const email = buildForward(received, "owner@inbox.test")!;
    expect(email.subject).toBe("Fwd: Re: MaskinGo Bcc: x@evil.test");
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("escapes the html and mentions attachments", () => {
    const email = buildForward(received, "owner@inbox.test")!;
    expect(email.html).toContain("&lt;b&gt;interessert&lt;/b&gt;");
    expect(email.html).not.toContain("<b>");
    expect(email.text).toContain("Vedlegg: 1");
  });

  it("uses the html as text when there is no text part", () => {
    const email = buildForward({ ...received, text: null, html: "<p>Ja takk</p><script>x()</script>" }, "owner@inbox.test")!;
    expect(email.text).toContain("Ja takk");
    expect(email.text).not.toContain("x()");
  });

  it("sends a notice when the content could not be read", () => {
    const email = buildForward({ ...received, text: null }, "owner@inbox.test", true)!;
    expect(email.text).toContain("Les e-posten i Resend");
    expect(email.subject).toContain("Re: MaskinGo");
    expect(email.replyTo).toBe("kari@fjellkran.test");
  });

  it("does not forward our own mail or the owner's (no loops)", () => {
    expect(buildForward({ ...received, from: "hei@maskingo.no" }, "owner@inbox.test")).toBeNull();
    expect(buildForward({ ...received, from: "Owner <OWNER@inbox.test>" }, "owner@inbox.test")).toBeNull();
  });

  it("reads the address from a display name", () => {
    expect(addressOf("Kari <kari@fjellkran.test>")).toBe("kari@fjellkran.test");
    expect(addressOf(" kari@fjellkran.test ")).toBe("kari@fjellkran.test");
  });
});
