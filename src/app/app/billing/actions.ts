"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { extraPeople, isInterval, isPlan, planFits, type SubscriptionRow } from "@/lib/billing";
import { getCurrentMembership } from "@/lib/membership";
import { hasSecondStep } from "@/lib/mfa";
import { canManageBilling } from "@/lib/roles";
import {
  appOrigin,
  billingConfigured,
  ensureExtraPrice,
  ensurePrice,
  getStripe,
  itemChanges,
  saveCustomer,
  subscriptionEnded,
  syncSubscription,
  taxRates,
} from "@/lib/stripe-server";
import { createClient } from "@/lib/supabase/server";

export type BillingActionState = { error?: "notAllowed" | "notConfigured" | "tooSmall" | "unknown"; done?: boolean };

// Stripe wants a trial to end at least two days ahead.
const MIN_TRIAL_MS = 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000;

// Owners and admins with the second step; the rest of the checks run against Stripe and the database.
async function billingContext() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  if (!canManageBilling(membership)) return null;
  if (!(await hasSecondStep())) redirect("/mfa");
  const supabase = await createClient();
  const [{ data: row }, { data: usage }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, billing_interval, status, trial_ends_at, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id")
      .eq("organization_id", membership.organization.id)
      .maybeSingle(),
    supabase.rpc("seat_usage", { org: membership.organization.id }).single(),
  ]);
  return {
    membership,
    row: (row as SubscriptionRow | null) ?? null,
    taken: (usage as { taken: number } | null)?.taken ?? 0,
  };
}

// Choose a plan: the first time through Stripe's payment page, later by
// changing the running subscription (Stripe settles the difference).
export async function choosePlan(_prev: BillingActionState, formData: FormData): Promise<BillingActionState> {
  const plan = formData.get("plan");
  const interval = formData.get("interval");
  if (!isPlan(plan) || !isInterval(interval)) return { error: "unknown" };

  const context = await billingContext();
  if (!context) return { error: "notAllowed" };
  const stripe = getStripe();
  if (!stripe || !billingConfigured()) return { error: "notConfigured" };
  const { membership, row, taken } = context;
  if (!planFits(plan, taken)) return { error: "tooSmall" };
  const org = membership.organization;

  let checkoutUrl: string | null = null;
  try {
    if (row?.stripe_subscription_id && !subscriptionEnded(row.status)) {
      // The plan's line changes; Bedrift also gets (or loses) the line for people past 40.
      const current = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      const changes = await itemChanges(stripe, current, plan, interval, taken);
      if (!changes) return { error: "unknown" };
      if (changes.length > 0) {
        const updated = await stripe.subscriptions.update(current.id, {
          items: changes,
          proration_behavior: "create_prorations",
          metadata: { organization_id: org.id },
        });
        await syncSubscription(updated);
      }
      revalidatePath("/app", "layout");
      return { done: true };
    }

    const price = await ensurePrice(stripe, plan, interval);
    const extra = extraPeople(plan, taken);

    let customer = row?.stripe_customer_id ?? null;
    if (!customer) {
      const locale = await getLocale();
      const created = await stripe.customers.create(
        { name: org.name, metadata: { organization_id: org.id }, preferred_locales: [locale] },
        { idempotencyKey: `customer-${org.id}` },
      );
      customer = created.id;
      await saveCustomer(org.id, customer);
    }

    const trialEnds = row?.status === "trialing" && row.trial_ends_at ? Date.parse(row.trial_ends_at) : NaN;
    const keepTrial = !Number.isNaN(trialEnds) && trialEnds - Date.now() > MIN_TRIAL_MS;
    const origin = await appOrigin();
    const locale = await getLocale();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: org.id,
      line_items: [
        { price, quantity: 1, ...taxRates() },
        // Bedrift: the people past 40.
        ...(extra > 0 ? [{ price: await ensureExtraPrice(stripe, interval), quantity: extra, ...taxRates() }] : []),
      ],
      subscription_data: {
        metadata: { organization_id: org.id },
        ...(keepTrial ? { trial_end: Math.floor(trialEnds / 1000) } : {}),
      },
      customer_update: { name: "auto", address: "auto" },
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      locale: locale === "nb" ? "nb" : locale === "lt" ? "lt" : "en",
      success_url: `${origin}/app/billing?session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app/billing`,
    });
    checkoutUrl = session.url;
  } catch (error) {
    console.error("Billing: could not choose a plan", error instanceof Error ? error.message : error);
    return { error: "unknown" };
  }
  if (!checkoutUrl) return { error: "unknown" };
  redirect(checkoutUrl);
}

// Stripe's own page for the card, the invoices (receipts) and cancelling.
export async function openPortal(): Promise<BillingActionState> {
  const context = await billingContext();
  if (!context) return { error: "notAllowed" };
  const stripe = getStripe();
  if (!stripe || !billingConfigured()) return { error: "notConfigured" };
  const customer = context.row?.stripe_customer_id;
  if (!customer) return { error: "unknown" };

  let url: string;
  try {
    const locale = await getLocale();
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${await appOrigin()}/app/billing`,
      locale: locale === "nb" ? "nb" : locale === "lt" ? "lt" : "en",
    });
    url = session.url;
  } catch (error) {
    console.error("Billing: could not open the portal", error instanceof Error ? error.message : error);
    return { error: "unknown" };
  }
  redirect(url);
}
