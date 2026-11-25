import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { OutgoingEmail } from "./resend";

// Mail that arrives at hei@maskingo.no is passed on to the owner's own inbox
// (INBOUND_FORWARD_TO), so replies from customers are not missed. Resend
// tells the app through a signed webhook (Svix format). Everything in the
// mail is data: it is copied as text and escaped, never followed.

const TOLERANCE_SECONDS = 5 * 60;

export type SignatureHeaders = { id: string | null; timestamp: string | null; signature: string | null };

export function verifyWebhook(
  body: string,
  headers: SignatureHeaders,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const sent = Number(timestamp);
  if (!Number.isInteger(sent) || Math.abs(nowSeconds - sent) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

  // The header may hold several "v1,<base64>" entries (for example while a key is rotated).
  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  created_at: string;
  attachments?: unknown[];
};

// "Kari <kari@firma.test>" -> "kari@firma.test"
export function addressOf(value: string): string {
  const match = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function plainFromHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Returns null when the mail must not be forwarded: it came from our own
// domain or from the forward address itself (that would loop).
export function buildForward(email: ReceivedEmail, forwardTo: string): OutgoingEmail | null {
  const sender = addressOf(email.from);
  if (!sender.includes("@")) return null;
  if (sender.endsWith("@maskingo.no") || sender === addressOf(forwardTo)) return null;

  const subject = oneLine(email.subject ?? "") || "(uten emne)";
  const original = email.text?.trim() || (email.html ? plainFromHtml(email.html) : "") || "(tom e-post)";
  const files = email.attachments?.length ?? 0;
  const lines = [
    "---------- Videresendt e-post ----------",
    `Fra: ${oneLine(email.from)}`,
    `Til: ${oneLine(email.to.join(", "))}`,
    `Dato: ${email.created_at}`,
    `Emne: ${subject}`,
    ...(files > 0 ? [`Vedlegg: ${files} (ikke videresendt, se Resend)`] : []),
    "",
  ];
  const text = `${lines.join("\n")}\n${original}\n`;
  const html = `<pre style="font-family:inherit;white-space:pre-wrap;margin:0">${escapeHtml(text)}</pre>`;

  return {
    from: "MaskinGo <hei@maskingo.no>",
    to: forwardTo,
    // "Reply" in Gmail answers the customer, not MaskinGo.
    replyTo: sender,
    subject: `Fwd: ${subject}`,
    text,
    html,
    idempotencyKey: `inbound-${email.id}`,
  };
}

export async function fetchReceivedEmail(id: string): Promise<ReceivedEmail | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const base = process.env.RESEND_API_URL ?? "https://api.resend.com";
  try {
    const response = await fetch(`${base}/emails/receiving/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.error("Resend did not give the received e-mail", response.status);
      return null;
    }
    return (await response.json()) as ReceivedEmail;
  } catch {
    console.error("Resend could not be reached");
    return null;
  }
}
