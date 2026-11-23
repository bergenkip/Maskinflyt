// Pages for one trade each (kranbil, maskinentreprenør, transport). Each one
// answers the searches of that trade; the texts live in messages/*.json under
// "Industry.<slug>". The slug is also the address: maskingo.no/<slug>.
export const industries = ["kranbil", "maskinentreprenor", "transport"] as const;

export type Industry = (typeof industries)[number];

export type IndustryPoint = { title: string; body: string };
export type IndustryQuestion = { q: string; a: string };
