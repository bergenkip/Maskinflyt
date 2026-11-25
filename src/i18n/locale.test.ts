import { describe, expect, it } from "vitest";
import { resolveLocale, visibleLocales } from "./locale";

describe("resolveLocale", () => {
  it("prefers the profile over everything else", () => {
    expect(
      resolveLocale({ profile: "lt", cookie: "en", organization: "nb" }),
    ).toBe("lt");
  });

  it("uses this device's choice when the profile has none", () => {
    expect(resolveLocale({ profile: null, cookie: "lt", organization: "nb" })).toBe(
      "lt",
    );
  });

  it("uses the company default when nothing else is set", () => {
    expect(resolveLocale({ organization: "en" })).toBe("en");
  });

  it("ignores invalid values", () => {
    expect(resolveLocale({ profile: "de", cookie: "<script>", organization: "en" })).toBe("en");
  });

  it("falls back to Norwegian Bokmål", () => {
    expect(resolveLocale({})).toBe("nb");
  });
});

describe("visibleLocales", () => {
  it("lists only Norwegian and English to everyone", () => {
    expect(visibleLocales("nb")).toEqual(["nb", "en"]);
    expect(visibleLocales("en")).toEqual(["nb", "en"]);
    expect(visibleLocales("de")).toEqual(["nb", "en"]);
  });

  it("keeps Lithuanian in the list once it is switched on", () => {
    expect(visibleLocales("lt")).toEqual(["nb", "en", "lt"]);
  });
});
