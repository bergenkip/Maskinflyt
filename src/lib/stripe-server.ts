import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import Stripe from "stripe";
import { lookupKey, planPrice, rowFromStripe, type Interval, type Plan, type StripeSubscriptionLike } from "./billing";
import { requireSupabaseEnv } from "./supabase/env";

// Stage 14a: everything that talks to Stripe, or writes what Stripe says. The
// keys live only in Vercel's environment variables, never in the code.

let client: Stripe | null = null;

// Null until STRIPE_SECRET_KEY is set: the billing page then says payments are not set up yet.
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key, { appInfo: { name: "MaskinGo" } });
  return client;
}

export function billingConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.SUPABASE_SECRET_KEY;
}

// Writes public.subscriptions, which members can only read. The secret key
// passes RLS, so it is used here and nowhere else.
function createBillingWriter() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not set");
  const { url } = requireSupabaseEnv();
  return createSupabaseClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// The page the person comes back to, built from the request so previews link to themselves.
export async function appOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// The Stripe price for a plan: found by its lookup key, or made the first time.
export async function ensurePrice(stripe: Stripe, plan: Plan, interval: Interval): Promise<string> {
  const key = lookupKey(plan, interval);
  const found = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const price = found.data[0];
  if (price) return price.id;
  const name = `MaskinGo ${plan[0].toUpperCase()}${plan.slice(1)}`;
  const created = await stripe.prices.create({
    lookup_key: key,
    currency: "nok",
    unit_amount: planPrice(plan, interval),
    recurring: { interval },
    // The price is without VAT (MVA); Stripe adds the tax rate on top when one is set.
    tax_behavior: "exclusive",
    product_data: { name, metadata: { plan } },
    metadata: { plan, interval },
  });
  return created.id;
}

export async function saveCustomer(organizationId: string, customerId: string): Promise<void> {
  const { error } = await createBillingWriter()
    .from("subscriptions")
    .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
  if (error) throw new Error(`Could not save the Stripe customer: ${error.message}`);
}

// Copies a Stripe subscription into public.subscriptions. Returns false when it is not one of ours.
export async function syncSubscription(sub: StripeSubscriptionLike): Promise<boolean> {
  const row = rowFromStripe(sub);
  if (!row) return false;
  const writer = createBillingWriter();
  // A company's newer subscription wins over an older, ended one.
  const { data: current } = await writer
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("organization_id", row.organization_id)
    .maybeSingle();
  const ended = (status: string) => status === "canceled" || status === "incomplete_expired";
  if (current?.stripe_subscription_id && current.stripe_subscription_id !== row.stripe_subscription_id
      && !ended(current.status) && ended(row.status)) {
    return true;
  }
  const { error } = await writer
    .from("subscriptions")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
  if (error) throw new Error(`Could not save the subscription: ${error.message}`);
  return true;
}
