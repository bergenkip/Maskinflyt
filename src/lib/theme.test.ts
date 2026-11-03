import { describe, expect, it } from "vitest";
import { resolveTheme, themeColors } from "./theme";

describe("resolveTheme", () => {
  it("is light unless dark was chosen", () => {
    expect(resolveTheme(undefined)).toBe("light");
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("blue")).toBe("light");
  });
  it("has a browser bar colour for each theme", () => {
    expect(themeColors.light).toBe("#ffffff");
    expect(themeColors.dark).toBe("#1b1c1f");
  });
});
