import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import Stripe from "stripe";
import {
  extraLookupKey,
  extraPeople,
  extraPersonPrice,
  fromLookupKey,
  isExtraLookupKey,
  lookupKey,
  planPrice,
  rowFromStripe,
  type Interval,
  type Plan,
  type StripeSubscriptionLike,
  type SubscriptionRow,
} from "./billing";
import { requireSupabaseEnv } from "./supabase/env";
import { createClient } from "./supabase/server";

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
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.BILLING_WRITE_TOKEN;
}

// public.subscriptions is read-only for members. What Stripe says is written
// through two database functions that accept only the server's billing token
// (BILLING_WRITE_TOKEN), so the app never holds Supabase's all-powerful secret key.
function billingWriter() {
  const token = process.env.BILLING_WRITE_TOKEN;
  if (!token) throw new Error("BILLING_WRITE_TOKEN is not set");
  const { url, key } = requireSupabaseEnv();
  const client = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { client, token };
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

// The Stripe price for one Bedrift person past the 40 included.
export async function ensureExtraPrice(stripe: Stripe, interval: Interval): Promise<string> {
  const key = extraLookupKey(interval);
  const found = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const price = found.data[0];
  if (price) return price.id;
  const created = await stripe.prices.create({
    lookup_key: key,
    currency: "nok",
    unit_amount: extraPersonPrice(interval),
    recurring: { interval },
    tax_behavior: "exclusive",
    product_data: { name: "MaskinGo Bedrift: extra person", metadata: { plan: "bedrift", extra: "person" } },
    metadata: { plan: "bedrift", interval, extra: "person" },
  });
  return created.id;
}

// A new line on a subscription carries the VAT rate too, once one is set.
export function taxRates(): { tax_rates?: string[] } {
  const taxRate = process.env.STRIPE_TAX_RATE_ID;
  return taxRate ? { tax_rates: [taxRate] } : {};
}

export const subscriptionEnded = (status: string) => status === "canceled" || status === "incomplete_expired";

// What to change on a running subscription so it is on this plan, with one
// extra-person line for Bedrift's people past 40 (none for the other plans).
// Empty when nothing needs to change; null when it is not one of ours.
export async function itemChanges(
  stripe: Stripe,
  current: Stripe.Subscription,
  plan: Plan,
  interval: Interval,
  people: number,
): Promise<Stripe.SubscriptionUpdateParams.Item[] | null> {
  const base = current.items.data.find((item) => fromLookupKey(item.price.lookup_key));
  if (!base) return null;
  const extra = current.items.data.find((item) => isExtraLookupKey(item.price.lookup_key));
  const wanted = extraPeople(plan, people);
  const changes: Stripe.SubscriptionUpdateParams.Item[] = [];

  const price = await ensurePrice(stripe, plan, interval);
  if (base.price.id !== price) changes.push({ id: base.id, price });
  if (wanted === 0) {
    if (extra) changes.push({ id: extra.id, deleted: true });
  } else {
    const extraPrice = await ensureExtraPrice(stripe, interval);
    if (!extra) changes.push({ price: extraPrice, quantity: wanted, ...taxRates() });
    else if (extra.price.id !== extraPrice || extra.quantity !== wanted) changes.push({ id: extra.id, price: extraPrice, quantity: wanted });
  }
  return changes;
}

// After someone joins or leaves a Bedrift company: bill the people past 40
// (Stripe settles the part of the period). Never stops the join or the removal:
// a failure is logged and fixed the next time the people or the billing page change.
export async function syncExtraPeople(organizationId: string): Promise<void> {
  const stripe = getStripe();
  if (!stripe || !billingConfigured()) return;
  try {
    const supabase = await createClient();
    const [{ data: row }, { data: usage }] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("plan, billing_interval, status, stripe_subscription_id")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase.rpc("seat_usage", { org: organizationId }).single(),
    ]);
    const sub = row as Pick<SubscriptionRow, "plan" | "billing_interval" | "status" | "stripe_subscription_id"> | null;
    const taken = (usage as { taken: number } | null)?.taken;
    if (!sub?.stripe_subscription_id || sub.plan !== "bedrift" || subscriptionEnded(sub.status) || taken === undefined) return;

    const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const changes = await itemChanges(stripe, current, "bedrift", sub.billing_interval ?? "month", taken);
    if (!changes || changes.length === 0) return;
    const updated = await stripe.subscriptions.update(current.id, { items: changes, proration_behavior: "create_prorations" });
    await syncSubscription(updated);
  } catch (error) {
    console.error("Billing: could not update Bedrift's extra people", error instanceof Error ? error.message : error);
  }
}

export async function saveCustomer(organizationId: string, customerId: string): Promise<void> {
  const { client, token } = billingWriter();
  const { error } = await client.rpc("save_stripe_customer", { token, org: organizationId, customer: customerId });
  if (error) throw new Error(`Could not save the Stripe customer: ${error.message}`);
}

// Copies a Stripe subscription into public.subscriptions. Returns false when it is not one of ours.
export async function syncSubscription(sub: StripeSubscriptionLike): Promise<boolean> {
  const row = rowFromStripe(sub);
  if (!row) return false;
  const { client, token } = billingWriter();
  const { error } = await client.rpc("save_subscription", {
    token,
    org: row.organization_id,
    new_plan: row.plan,
    new_interval: row.billing_interval,
    new_status: row.status,
    period_end: row.current_period_end,
    cancelling: row.cancel_at_period_end,
    customer: row.stripe_customer_id,
    subscription: row.stripe_subscription_id,
    trial_end: row.trial_ends_at ?? null,
  });
  if (error) throw new Error(`Could not save the subscription: ${error.message}`);
  return true;
}
