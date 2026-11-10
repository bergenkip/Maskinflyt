import "server-only";

// Sends one e-mail through Resend's HTTP API. The key lives only in the
// server's environment (Vercel), never in the code or the browser.
// RESEND_API_URL lets the end-to-end tests point it at a local stand-in.

export type OutgoingEmail = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Uint8Array }[];
  // The same key twice sends once (Resend keeps it for 24 hours).
  idempotencyKey: string;
};

export type SendResult = { ok: true; id: string } | { ok: false; reason: "notConfigured" | "rejected" | "unreachable" };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: "notConfigured" };
  const base = process.env.RESEND_API_URL ?? "https://api.resend.com";
  try {
    const response = await fetch(`${base}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey,
      },
      body: JSON.stringify({
        from: email.from,
        to: [email.to],
        reply_to: email.replyTo ? [email.replyTo] : undefined,
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: email.attachments?.map((file) => ({
          filename: file.filename,
          content: Buffer.from(file.content).toString("base64"),
        })),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      // The body may echo the address; only the status goes to the log.
      console.error("Resend refused an e-mail", response.status);
      return { ok: false, reason: "rejected" };
    }
    const body = (await response.json()) as { id?: string };
    return body.id ? { ok: true, id: body.id } : { ok: false, reason: "rejected" };
  } catch {
    console.error("Resend could not be reached");
    return { ok: false, reason: "unreachable" };
  }
}
