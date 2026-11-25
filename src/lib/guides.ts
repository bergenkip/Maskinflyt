import type { LandingPage } from "@/lib/industries";

// Guides: articles that answer what people in the trade search for (timesheets,
// invoicing hours, minimum time). Texts live in messages/*.json under
// "Guides.<id>"; the address is maskingo.no/guider/<slug>, in Norwegian.
export const guides = ["timesheet", "invoicing", "minimumTime"] as const;

export type Guide = (typeof guides)[number];

export const guideSlugs = {
  timesheet: "timeliste-anlegg",
  invoicing: "fakturere-maskintimer",
  minimumTime: "minstetid-kveldstillegg-kranbil",
} as const satisfies Record<Guide, string>;

// The MaskinGo page each guide leads on to.
export const guideRelated: Record<Guide, LandingPage> = {
  timesheet: "timeforing",
  invoicing: "faktura",
  minimumTime: "kranbil",
};

// The day the guides were last checked, shown on each guide and given to search engines.
export const GUIDES_UPDATED = "2026-11-25";

export const GUIDES_PATH = "/guider" as const;

export function guidePath(guide: Guide): `/guider/${(typeof guideSlugs)[Guide]}` {
  return `${GUIDES_PATH}/${guideSlugs[guide]}`;
}

export function guideFromSlug(slug: string): Guide | undefined {
  return guides.find((guide) => guideSlugs[guide] === slug);
}

export type GuideSection = {
  heading: string;
  body?: string[];
  list?: string[];
  table?: { caption: string; head: string[]; rows: string[][] };
  after?: string[];
};
