// Pages for one trade each (kranbil, maskinentreprenør, transport). Each one
// answers the searches of that trade; the texts live in messages/*.json under
// "Industry.<slug>". The slug is also the address: maskingo.no/<slug>.
export const industries = [
  "kranbil",
  "maskinentreprenor",
  "transport",
] as const;

export type Industry = (typeof industries)[number];

// Pages for one task every trade has (timeføring, faktura), built from the same
// template and texts under "Industry.<slug>". They link to the trade pages.
export const topics = ["timeforing", "faktura"] as const;

export type Topic = (typeof topics)[number];

export type LandingPage = Industry | Topic;

export function isIndustry(page: LandingPage): page is Industry {
  return (industries as readonly string[]).includes(page);
}

export type IndustryPoint = { title: string; body: string };
export type IndustryQuestion = { q: string; a: string };
