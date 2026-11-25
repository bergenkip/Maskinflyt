import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import lt from "../../messages/lt.json";
import nb from "../../messages/nb.json";
import { guideFromSlug, guidePath, guides, GUIDES_PATH, type GuideSection } from "./guides";
import { publicPaths } from "./site";

describe("guides", () => {
  it("every guide and the list of guides are public pages (sitemap, canonical)", () => {
    expect(publicPaths).toContain(GUIDES_PATH);
    for (const guide of guides) expect(publicPaths).toContain(guidePath(guide));
  });

  it("finds a guide from its address and nothing else", () => {
    for (const guide of guides) expect(guideFromSlug(guidePath(guide).split("/").pop()!)).toBe(guide);
    expect(guideFromSlug("ukjent")).toBeUndefined();
  });

  it("each language has the same sections, rows and questions in each guide", () => {
    for (const guide of guides) {
      const shape = (g: { sections: GuideSection[]; faq: unknown[] }) => ({
        sections: g.sections.map((s) => ({
          body: s.body?.length ?? 0,
          list: s.list?.length ?? 0,
          table: s.table?.rows.map((row) => row.length) ?? null,
          after: s.after?.length ?? 0,
        })),
        faq: g.faq.length,
      });
      expect(shape(en.Guides[guide])).toEqual(shape(nb.Guides[guide]));
      expect(shape(lt.Guides[guide])).toEqual(shape(nb.Guides[guide]));
    }
  });

  it("search snippets fit: title up to 70 characters, description 70 to 170", () => {
    for (const messages of [nb, en, lt]) {
      for (const guide of guides) {
        const { metaTitle, metaDescription } = messages.Guides[guide];
        expect(metaTitle.length, metaTitle).toBeLessThanOrEqual(70);
        expect(metaDescription.length, metaDescription).toBeGreaterThanOrEqual(70);
        expect(metaDescription.length, metaDescription).toBeLessThanOrEqual(170);
      }
    }
  });
});
