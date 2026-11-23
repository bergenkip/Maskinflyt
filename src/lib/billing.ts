// Stage 14a: MaskinGo's plans (Li's decision 2026-11-23). Pure helpers for the
// screens, the Stripe calls and the tests; the database caps the people
// (private.plan_seats) and Stripe takes the money.

export const plans = ["solo", "start", "pro", "bedrift"] as const;
export type Plan = (typeof plans)[number];
export const intervals = ["month", "year"] as const;
export type Interval = (typeof intervals)[number];

export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && (plans as readonly string[]).includes(value);
}
export function isInterval(value: unknown): value is Interval {
  return typeof value === "string" && (intervals as readonly string[]).includes(value);
}

// People included (the same as private.plan_seats; Bedrift's people past 40 are billed one by one in stage 14b).
export const planSeats: Record<Plan, number> = { solo: 2, start: 5, pro: 15, bedrift: 40 };

// Price a month in øre, without VAT (MVA).
const monthly: Record<Plan, number> = { solo: 29_000, start: 79_000, pro: 179_000, bedrift: 349_000 };
// A year costs ten months.
export const YEAR_MONTHS = 10;
export const TRIAL_DAYS = 30;

export function planPrice(plan: Plan, interval: Interval): number {
  return interval === "year" ? monthly[plan] * YEAR_MONTHS : monthly[plan];
}

// The Stripe price's lookup key, so the app finds (or makes) the same price every time.
export const lookupKey = (plan: Plan, interval: Interval) => `maskingo_${plan}_${interval}`;

export function fromLookupKey(key: string | null | undefined): { plan: Plan; interval: Interval } | null {
  const match = /^maskingo_([a-z]+)_([a-z]+)$/.exec(key ?? "");
  if (!match || !isPlan(match[1]) || !isInterval(match[2])) return null;
  return { plan: match[1], interval: match[2] };
}

// The plans a company with this many people can choose.
export function planFits(plan: Plan, people: number): boolean {
  return plan === "bedrift" || people <= planSeats[plan];
}

export type SubscriptionRow = {
  plan: Plan | null;
  billing_interval: Interval | null;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

export type BillingState =
  | { kind: "trial"; daysLeft: number; endsAt: string }
  | { kind: "trialEnded"; endsAt: string | null }
  | { kind: "active"; plan: Plan; interval: Interval | null; renewsAt: string | null; ending: boolean }
  | { kind: "pastDue"; plan: Plan | null }
  | { kind: "ended"; plan: Plan | null };

const DAY = 24 * 60 * 60 * 1000;

// Where the company stands: trying, paying, behind on a payment, or stopped.
export function billingState(row: SubscriptionRow | null, now = new Date()): BillingState {
  if (!row) return { kind: "trialEnded", endsAt: null };
  if (row.status === "active" || (row.status === "trialing" && row.stripe_subscription_id && row.plan)) {
    // A paid plan chosen during the trial counts as active: Stripe charges when the trial ends.
    return { kind: "active", plan: row.plan!, interval: row.billing_interval, renewsAt: row.current_period_end, ending: row.cancel_at_period_end };
  }
  if (row.status === "trialing") {
    const ends = row.trial_ends_at ? Date.parse(row.trial_ends_at) : NaN;
    if (Number.isNaN(ends) || ends <= now.getTime()) return { kind: "trialEnded", endsAt: row.trial_ends_at };
    return { kind: "trial", daysLeft: Math.ceil((ends - now.getTime()) / DAY), endsAt: row.trial_ends_at! };
  }
  if (row.status === "past_due" || row.status === "unpaid" || row.status === "incomplete") return { kind: "pastDue", plan: row.plan };
  return { kind: "ended", plan: row.plan };
}

// Whether to remind the company: the last week of the trial, or any trouble.
export function needsAttention(state: BillingState): boolean {
  return (state.kind === "trial" && state.daysLeft <= 7) || state.kind === "trialEnded" || state.kind === "pastDue" || state.kind === "ended";
}

// The part of a Stripe subscription the app keeps (see the webhook).
export type StripeSubscriptionLike = {
  id: string;
  status: string;
  customer: string | { id: string };
  cancel_at_period_end: boolean;
  trial_end: number | null;
  metadata: Record<string, string>;
  items: { data: { current_period_end: number; price: { lookup_key: string | null } }[] };
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The row for public.subscriptions from a Stripe subscription; null when it is not one of ours.
export function rowFromStripe(sub: StripeSubscriptionLike): ({ organization_id: string } & Omit<SubscriptionRow, "trial_ends_at"> & { trial_ends_at?: string }) | null {
  const organization = sub.metadata.organization_id;
  const item = sub.items.data[0];
  const price = fromLookupKey(item?.price.lookup_key);
  if (!organization || !uuid.test(organization) || !price) return null;
  const at = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null);
  return {
    organization_id: organization,
    plan: price.plan,
    billing_interval: price.interval,
    status: sub.status,
    current_period_end: at(item.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    ...(sub.trial_end ? { trial_ends_at: at(sub.trial_end)! } : {}),
  };
}
