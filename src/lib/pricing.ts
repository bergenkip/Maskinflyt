// Facts for the public price page that src/lib/billing.ts does not hold yet.
// Plans, people per plan, prices and the trial come from billing.ts, so the
// price page and the app always show the same numbers.

// MaskinGo is not registered for VAT (MVA) yet (Li, 2026-11-23): it must be
// once sales pass 50 000 kr in 12 months. Switch to true then, and the price
// page says "eks. mva." instead.
export const VAT_REGISTERED = false;

// Bedrift: each person past the 40 included, in øre a month (Li, 2026-11-23).
// Not billed yet (stage 14b); move this to billing.ts when it is.
export const BEDRIFT_EXTRA_PERSON_ORE = 7_900;
