import { describe, expect, it } from "vitest";
import { isIndexable, ogLocale, publicPaths } from "./site";

describe("isIndexable", () => {
  it("only lets the live site into search results", () => {
    expect(isIndexable("production")).toBe(true);
    expect(isIndexable("preview")).toBe(false);
    expect(isIndexable("development")).toBe(false);
    expect(isIndexable(undefined)).toBe(false);
  });
});

describe("ogLocale", () => {
  it("adds the country Open Graph expects", () => {
    expect(ogLocale("nb")).toBe("nb_NO");
    expect(ogLocale("en")).toBe("en_GB");
    expect(ogLocale("lt")).toBe("lt_LT");
    expect(ogLocale("xx")).toBe("nb_NO");
  });
});

describe("publicPaths", () => {
  it("never lists the signed-in app", () => {
    expect(publicPaths.some((path) => path.startsWith("/app"))).toBe(false);
  });
});
