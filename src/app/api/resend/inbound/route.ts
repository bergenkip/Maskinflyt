import { buildForward, fetchReceivedEmail, verifyWebhook } from "@/lib/email/inbound";
import { sendEmail } from "@/lib/email/resend";

// Resend calls this when a mail arrives at hei@maskingo.no. Only signed
// messages (RESEND_WEBHOOK_SECRET) are believed. The mail is forwarded to
// INBOUND_FORWARD_TO; a 500 makes Resend try again later.
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const forwardTo = process.env.INBOUND_FORWARD_TO;
  if (!secret || !forwardTo || !process.env.RESEND_API_KEY) return new Response("Not configured", { status: 503 });

  const body = await request.text();
  const signed = verifyWebhook(
    body,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    secret,
  );
  if (!signed) return new Response("Bad signature", { status: 400 });

  let event: {
    type?: string;
    data?: { email_id?: string; from?: string; to?: string[]; subject?: string; created_at?: string; attachments?: unknown[] };
  };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad body", { status: 400 });
  }
  if (event.type !== "email.received") return Response.json({ ignored: true });
  const id = event.data?.email_id;
  if (!id) return new Response("Missing e-mail id", { status: 400 });

  // If the mail itself cannot be read, forward what the signed webhook says
  // (sender, subject), so the owner is told at once.
  const full = await fetchReceivedEmail(id);
  const data = event.data!;
  const email = full ?? {
    id,
    from: data.from ?? "",
    to: data.to ?? [],
    subject: data.subject ?? null,
    text: null,
    html: null,
    created_at: data.created_at ?? new Date().toISOString(),
    attachments: data.attachments,
  };

  const forward = buildForward(email, forwardTo, !full);
  if (!forward) return Response.json({ skipped: true });

  const sent = await sendEmail(forward);
  if (!sent.ok) return new Response("Could not forward", { status: 500 });
  return Response.json({ forwarded: true });
}
