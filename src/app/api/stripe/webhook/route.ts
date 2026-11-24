import type Stripe from "stripe";
import { getStripe, syncSubscription } from "@/lib/stripe-server";

// Stage 14a: Stripe tells the app what was paid. Only signed messages are
// believed (STRIPE_WEBHOOK_SECRET); everything in them is data.
export async function POST(request: Request): Promise<Response> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response("Not configured", { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  try {
    if (event.type.startsWith("customer.subscription.")) {
      // The message may be older than what Stripe knows now, so ask for the current state.
      const sent = event.data.object as Stripe.Subscription;
      await syncSubscription(await stripe.subscriptions.retrieve(sent.id));
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const id = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (id) await syncSubscription(await stripe.subscriptions.retrieve(id));
    }
  } catch (error) {
    // Stripe tries again later.
    console.error("Stripe webhook failed", event.type, error instanceof Error ? error.message : error);
    return new Response("Could not save", { status: 500 });
  }
  return Response.json({ received: true });
}
