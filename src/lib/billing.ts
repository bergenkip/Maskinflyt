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

// People included (the same as private.plan_seats). Bedrift has no limit: each person past 40 is billed.
export const planSeats: Record<Plan, number> = { solo: 2, start: 5, pro: 15, bedrift: 40 };

// MaskinGo is not in the VAT (MVA) register yet (Li, 2026-11-23: it will be at
// 50 000 kr turnover). While false, the prices are final and no VAT is added;
// when true, the screens say "eks. mva" and Stripe adds STRIPE_TAX_RATE_ID.
export const VAT_REGISTERED = false;

// Price a month in øre, before any VAT (MVA).
const monthly: Record<Plan, number> = { solo: 29_000, start: 79_000, pro: 179_000, bedrift: 349_000 };
// A year costs ten months.
export const YEAR_MONTHS = 10;
export const TRIAL_DAYS = 30;

export function planPrice(plan: Plan, interval: Interval): number {
  return interval === "year" ? monthly[plan] * YEAR_MONTHS : monthly[plan];
}

// The Stripe price's lookup key, so the app finds (or makes) the same price every time.
export const lookupKey = (plan: Plan, interval: Interval) => `maskingo_${plan}_${interval}`;

// Bedrift: each person past the 40 included, in øre a month (Li, 2026-11-23); a year costs ten months.
export const BEDRIFT_EXTRA_PERSON_ORE = 7_900;

export function extraPersonPrice(interval: Interval): number {
  return interval === "year" ? BEDRIFT_EXTRA_PERSON_ORE * YEAR_MONTHS : BEDRIFT_EXTRA_PERSON_ORE;
}

// The Stripe price for one extra Bedrift person (a second line on the subscription, its quantity the people past 40).
export const extraLookupKey = (interval: Interval) => `maskingo_bedrift_extra_${interval}`;

export function isExtraLookupKey(key: string | null | undefined): boolean {
  return key === extraLookupKey("month") || key === extraLookupKey("year");
}

// How many people to bill on top of the plan.
export function extraPeople(plan: Plan | null, people: number): number {
  return plan === "bedrift" ? Math.max(0, people - planSeats.bedrift) : 0;
}

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

// Whether the company can only read (the same rule as private.is_read_only in the
// database, which is what actually stops the writes; this only explains it on screen).
export function isReadOnly(row: SubscriptionRow | null, now = new Date()): boolean {
  if (!row) return false;
  if (row.status === "active" || row.status === "past_due") return false;
  if (row.status === "trialing" && row.stripe_subscription_id) return false;
  if (row.status === "trialing" || row.status === "incomplete") {
    const ends = row.trial_ends_at ? Date.parse(row.trial_ends_at) : NaN;
    return Number.isNaN(ends) || ends <= now.getTime();
  }
  return true;
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
  // The plan's line; a Bedrift subscription may also have a line for the extra people.
  const item = sub.items.data.find((line) => fromLookupKey(line.price.lookup_key));
  const price = fromLookupKey(item?.price.lookup_key);
  if (!organization || !uuid.test(organization) || !item || !price) return null;
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
