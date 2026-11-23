import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import lt from "../../messages/lt.json";
import nb from "../../messages/nb.json";
import { TRIAL_DAYS, YEAR_MONTHS, planPrice, planSeats } from "./billing";
import { BEDRIFT_EXTRA_PERSON_ORE } from "./pricing";

describe("price page facts", () => {
  it("match the plans Li agreed on 2026-11-23", () => {
    expect(planPrice("solo", "month")).toBe(29_000);
    expect(planPrice("start", "month")).toBe(79_000);
    expect(planPrice("pro", "month")).toBe(179_000);
    expect(planPrice("bedrift", "month")).toBe(349_000);
    expect(planSeats).toEqual({ solo: 2, start: 5, pro: 15, bedrift: 40 });
    expect(BEDRIFT_EXTRA_PERSON_ORE).toBe(7_900);
  });

  // The page's texts say "30 days" and "2 months free"; they must follow billing.ts.
  it.each([
    ["nb", nb],
    ["en", en],
    ["lt", lt],
  ])(
    "%s texts agree with the trial and the yearly discount",
    (_name, messages) => {
      expect(TRIAL_DAYS).toBe(30);
      expect(YEAR_MONTHS).toBe(10);
      expect(messages.Pricing.badge).toContain(String(TRIAL_DAYS));
      expect(messages.Pricing.cta).toContain(String(TRIAL_DAYS));
      expect(messages.Pricing.perYear).toContain(String(12 - YEAR_MONTHS));
    },
  );
});
