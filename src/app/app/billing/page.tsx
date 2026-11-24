import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { billingState, type SubscriptionRow } from "@/lib/billing";
import { getCurrentMembership } from "@/lib/membership";
import { canManageBilling } from "@/lib/roles";
import { billingConfigured, getStripe, syncExtraPeople, syncSubscription } from "@/lib/stripe-server";
import { createClient } from "@/lib/supabase/server";
import { BillingView } from "./billing-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Billing");
  return { title: `${t("title")} · MaskinGo` };
}

const columns = "plan, billing_interval, status, trial_ends_at, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id";

// Back from Stripe's payment page: save the new subscription at once, so the
// page is right even before Stripe's webhook arrives.
async function syncCheckout(sessionId: string, organizationId: string): Promise<boolean> {
  const stripe = getStripe();
  if (!stripe || !billingConfigured() || !/^cs_[A-Za-z0-9_]{10,250}$/.test(sessionId)) return false;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.client_reference_id !== organizationId || !session.subscription) return false;
    const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    return await syncSubscription(await stripe.subscriptions.retrieve(id));
  } catch (error) {
    console.error("Billing: could not read the checkout", error instanceof Error ? error.message : error);
    return false;
  }
}

export default async function BillingPage({ searchParams }: PageProps<"/app/billing">) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/app/onboarding");
  const params = await searchParams;
  const org = membership.organization.id;
  const manages = canManageBilling(membership);

  const session = typeof params.session === "string" ? params.session : null;
  const paid = manages && session ? await syncCheckout(session, org) : false;
  // Bedrift: bill the people past 40 as they are now (someone may have joined at sign-up).
  if (manages) await syncExtraPeople(org);

  const supabase = await createClient();
  const [{ data: row }, { data: usage }] = await Promise.all([
    supabase.from("subscriptions").select(columns).eq("organization_id", org).maybeSingle(),
    supabase.rpc("seat_usage", { org }).single(),
  ]);
  const subscription = (row as SubscriptionRow | null) ?? null;
  const state = billingState(subscription);
  const seatInfo = (usage as { taken: number; seats: number | null } | null) ?? { taken: 0, seats: null };
  const interval =
    params.interval === "year" || params.interval === "month"
      ? params.interval
      : state.kind === "active" && state.interval
        ? state.interval
        : "month";

  return (
    <BillingView
      state={state}
      taken={seatInfo.taken}
      seats={seatInfo.seats}
      interval={interval}
      manages={manages}
      configured={billingConfigured()}
      hasCustomer={!!subscription?.stripe_customer_id}
      notice={paid ? "paid" : null}
    />
  );
}
