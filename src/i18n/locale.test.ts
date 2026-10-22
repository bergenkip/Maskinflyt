import { describe, expect, it } from "vitest";
import { matchAcceptLanguage, resolveLocale } from "./locale";

describe("matchAcceptLanguage", () => {
  it.each([
    ["nb-NO,nb;q=0.9,en;q=0.8", "nb"],
    ["no", "nb"],
    ["nn-NO", "nb"],
    ["lt-LT,lt;q=0.9", "lt"],
    ["en-GB,en;q=0.9", "en"],
    ["de-DE,de;q=0.9,lt;q=0.5", "lt"],
    ["en;q=0.5,nb;q=0.8", "nb"],
  ])("%s → %s", (header, expected) => {
    expect(matchAcceptLanguage(header)).toBe(expected);
  });

  it("returns undefined for unsupported or missing languages", () => {
    expect(matchAcceptLanguage("de-DE,fr;q=0.8")).toBeUndefined();
    expect(matchAcceptLanguage("")).toBeUndefined();
    expect(matchAcceptLanguage(null)).toBeUndefined();
    expect(matchAcceptLanguage("lt;q=0")).toBeUndefined();
  });
});

describe("resolveLocale", () => {
  it("prefers the profile over everything else", () => {
    expect(
      resolveLocale({ profile: "lt", cookie: "en", organization: "nb", acceptLanguage: "en-US" }),
    ).toBe("lt");
  });

  it("uses this device's choice when the profile has none", () => {
    expect(resolveLocale({ profile: null, cookie: "lt", organization: "nb", acceptLanguage: "en" })).toBe(
      "lt",
    );
  });

  it("uses the company default before the browser language", () => {
    expect(resolveLocale({ organization: "en", acceptLanguage: "lt-LT" })).toBe("en");
  });

  it("ignores invalid values", () => {
    expect(resolveLocale({ profile: "de", cookie: "<script>", acceptLanguage: "en-US" })).toBe("en");
  });

  it("falls back to Norwegian Bokmål", () => {
    expect(resolveLocale({ acceptLanguage: "de-DE" })).toBe("nb");
    expect(resolveLocale({})).toBe("nb");
  });
});
