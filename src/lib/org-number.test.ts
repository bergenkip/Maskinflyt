import { describe, expect, it } from "vitest";
import { isValidOrgNumber, normalizeOrgNumber } from "./org-number";

describe("isValidOrgNumber", () => {
  it.each(["100000008", "100000016", "100 000 008"])("accepts %s", (value) => {
    expect(isValidOrgNumber(value)).toBe(true);
  });

  it.each(["100000009", "12345678", "1234567890", "abcdefghi", ""])("rejects %s", (value) => {
    expect(isValidOrgNumber(value)).toBe(false);
  });
});

describe("normalizeOrgNumber", () => {
  it("removes spaces", () => {
    expect(normalizeOrgNumber(" 100 000 008 ")).toBe("100000008");
  });
});

describe("other countries", () => {
  it("removes dashes and dots and upper-cases letters", () => {
    expect(normalizeOrgNumber("556677-8899")).toBe("5566778899");
    expect(normalizeOrgNumber("sc 123.456")).toBe("SC123456");
  });

  it.each([
    ["SE", "556677-8899"],
    ["GB", "SC123456"],
    ["LT", "100000009"],
  ])("accepts %s %s without a check digit", (country, value) => {
    expect(isValidOrgNumber(value, country)).toBe(true);
  });

  it.each([
    ["SE", "1"],
    ["DE", "123456789012345678901"],
    ["LT", "12/34"],
  ])("rejects %s %s", (country, value) => {
    expect(isValidOrgNumber(value, country)).toBe(false);
  });
});
