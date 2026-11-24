import { describe, expect, it } from "vitest";
import {
  billingState,
  extraLookupKey,
  extraPeople,
  extraPersonPrice,
  fromLookupKey,
  isExtraLookupKey,
  isReadOnly,
  lookupKey,
  needsAttention,
  planFits,
  planPrice,
  rowFromStripe,
  type StripeSubscriptionLike,
  type SubscriptionRow,
} from "./billing";

const now = new Date("2026-11-23T12:00:00Z");
const base: SubscriptionRow = {
  plan: null,
  billing_interval: null,
  status: "trialing",
  trial_ends_at: "2026-12-23T12:00:00Z",
  current_period_end: null,
  cancel_at_period_end: false,
  stripe_customer_id: null,
  stripe_subscription_id: null,
};

describe("plan prices", () => {
  it("are kept in øre and a year costs ten months", () => {
    expect(planPrice("solo", "month")).toBe(29_000);
    expect(planPrice("bedrift", "month")).toBe(349_000);
    expect(planPrice("pro", "year")).toBe(1_790_000);
  });

  it("find the same Stripe price by its lookup key", () => {
    expect(lookupKey("start", "year")).toBe("maskingo_start_year");
    expect(fromLookupKey("maskingo_start_year")).toEqual({ plan: "start", interval: "year" });
    expect(fromLookupKey("maskingo_gold_month")).toBeNull();
    expect(fromLookupKey("other_start_month")).toBeNull();
    expect(fromLookupKey(null)).toBeNull();
  });

  it("fit only companies that are small enough", () => {
    expect(planFits("solo", 2)).toBe(true);
    expect(planFits("solo", 3)).toBe(false);
    expect(planFits("pro", 15)).toBe(true);
    expect(planFits("pro", 16)).toBe(false);
    expect(planFits("bedrift", 120)).toBe(true);
  });
});

describe("billingState", () => {
  it("counts the days left of the trial", () => {
    expect(billingState(base, now)).toEqual({ kind: "trial", daysLeft: 30, endsAt: base.trial_ends_at });
    expect(billingState({ ...base, trial_ends_at: "2026-11-23T13:00:00Z" }, now)).toMatchObject({ kind: "trial", daysLeft: 1 });
  });

  it("says when the trial has ended or is missing", () => {
    expect(billingState({ ...base, trial_ends_at: "2026-11-20T00:00:00Z" }, now).kind).toBe("trialEnded");
    expect(billingState({ ...base, trial_ends_at: null }, now).kind).toBe("trialEnded");
    expect(billingState(null, now).kind).toBe("trialEnded");
  });

  it("treats a plan chosen during the trial as paying", () => {
    const row = { ...base, plan: "start" as const, billing_interval: "month" as const, stripe_subscription_id: "sub_1" };
    expect(billingState(row, now)).toMatchObject({ kind: "active", plan: "start", interval: "month" });
  });

  it("knows active, behind and stopped subscriptions", () => {
    const paid = { ...base, plan: "pro" as const, billing_interval: "year" as const, stripe_subscription_id: "sub_1" };
    expect(billingState({ ...paid, status: "active", cancel_at_period_end: true }, now)).toMatchObject({ kind: "active", ending: true });
    expect(billingState({ ...paid, status: "past_due" }, now)).toEqual({ kind: "pastDue", plan: "pro" });
    expect(billingState({ ...paid, status: "canceled" }, now)).toEqual({ kind: "ended", plan: "pro" });
  });
});

describe("needsAttention", () => {
  it("reminds in the last week of the trial and on any trouble", () => {
    expect(needsAttention({ kind: "trial", daysLeft: 8, endsAt: "" })).toBe(false);
    expect(needsAttention({ kind: "trial", daysLeft: 7, endsAt: "" })).toBe(true);
    expect(needsAttention({ kind: "trialEnded", endsAt: null })).toBe(true);
    expect(needsAttention({ kind: "pastDue", plan: "solo" })).toBe(true);
    expect(needsAttention({ kind: "active", plan: "solo", interval: "month", renewsAt: null, ending: false })).toBe(false);
  });
});

describe("rowFromStripe", () => {
  const org = "11111111-2222-4333-8444-555555555555";
  const sub: StripeSubscriptionLike = {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    cancel_at_period_end: false,
    trial_end: 1_766_491_200,
    metadata: { organization_id: org },
    items: { data: [{ current_period_end: 1_769_169_600, price: { lookup_key: "maskingo_pro_month" } }] },
  };

  it("keeps what the app needs", () => {
    expect(rowFromStripe(sub)).toEqual({
      organization_id: org,
      plan: "pro",
      billing_interval: "month",
      status: "active",
      current_period_end: new Date(1_769_169_600_000).toISOString(),
      cancel_at_period_end: false,
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      trial_ends_at: new Date(1_766_491_200_000).toISOString(),
    });
    expect(rowFromStripe({ ...sub, customer: { id: "cus_2" }, trial_end: null })).not.toHaveProperty("trial_ends_at");
  });

  it("ignores subscriptions that are not ours", () => {
    expect(rowFromStripe({ ...sub, metadata: {} })).toBeNull();
    expect(rowFromStripe({ ...sub, metadata: { organization_id: "x' or 1=1" } })).toBeNull();
    expect(rowFromStripe({ ...sub, items: { data: [{ current_period_end: 1, price: { lookup_key: "other" } }] } })).toBeNull();
  });

  it("finds the plan's line when Bedrift's extra-person line comes first", () => {
    const bedrift = {
      ...sub,
      items: {
        data: [
          { current_period_end: 1_769_169_600, price: { lookup_key: "maskingo_bedrift_extra_year" } },
          { current_period_end: 1_769_169_600, price: { lookup_key: "maskingo_bedrift_year" } },
        ],
      },
    };
    expect(rowFromStripe(bedrift)).toMatchObject({ plan: "bedrift", billing_interval: "year" });
  });
});

describe("Bedrift's extra people", () => {
  it("bills each person past 40, at 79 kr a month or ten months a year", () => {
    expect(extraPersonPrice("month")).toBe(7_900);
    expect(extraPersonPrice("year")).toBe(79_000);
    expect(extraPeople("bedrift", 40)).toBe(0);
    expect(extraPeople("bedrift", 43)).toBe(3);
    expect(extraPeople("pro", 43)).toBe(0);
    expect(extraPeople(null, 43)).toBe(0);
  });

  it("has its own Stripe price, which is not mistaken for a plan", () => {
    expect(extraLookupKey("month")).toBe("maskingo_bedrift_extra_month");
    expect(isExtraLookupKey("maskingo_bedrift_extra_year")).toBe(true);
    expect(isExtraLookupKey("maskingo_bedrift_year")).toBe(false);
    expect(fromLookupKey("maskingo_bedrift_extra_month")).toBeNull();
  });
});

describe("isReadOnly (the same rule as private.is_read_only)", () => {
  const ended = "2026-11-22T12:00:00Z";
  it("lets a company write while trying, paying or while Stripe retries a payment", () => {
    expect(isReadOnly(base, now)).toBe(false);
    expect(isReadOnly({ ...base, status: "active", plan: "pro" }, now)).toBe(false);
    expect(isReadOnly({ ...base, status: "past_due", plan: "pro" }, now)).toBe(false);
    expect(isReadOnly({ ...base, trial_ends_at: ended, plan: "pro", stripe_subscription_id: "sub_1" }, now)).toBe(false);
    expect(isReadOnly(null, now)).toBe(false);
  });

  it("only reads when the trial is over without a plan, or the subscription ended", () => {
    expect(isReadOnly({ ...base, trial_ends_at: ended }, now)).toBe(true);
    expect(isReadOnly({ ...base, status: "canceled", plan: "pro" }, now)).toBe(true);
    expect(isReadOnly({ ...base, status: "unpaid", plan: "pro" }, now)).toBe(true);
    expect(isReadOnly({ ...base, status: "incomplete", trial_ends_at: ended }, now)).toBe(true);
  });
});
