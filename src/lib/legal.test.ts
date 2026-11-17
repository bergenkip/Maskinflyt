import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import lt from "../../messages/lt.json";
import nb from "../../messages/nb.json";
import { COMPANY, fillCompany } from "./legal";

describe("fillCompany", () => {
  it("fills every placeholder", () => {
    const company = { name: "Test AS", orgNumber: "123456789", address: "Gate 1, 0001 Oslo", email: "hei@maskingo.no" };
    expect(fillCompany("{company} ({orgNumber}), {address}, {email}. {company}", company)).toBe(
      "Test AS (123456789), Gate 1, 0001 Oslo, hei@maskingo.no. Test AS",
    );
  });
});

describe.each([
  ["nb", nb],
  ["en", en],
  ["lt", lt],
])("legal texts in %s", (_name, messages) => {
  it("use only known placeholders", () => {
    const texts = [messages.Legal.privacy, messages.Legal.terms].flatMap((doc) =>
      doc.sections.flatMap((section) => [section.title, ...section.body]),
    );
    for (const text of texts) {
      expect(fillCompany(text)).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });

  it("name the company's contact address", () => {
    expect(JSON.stringify(messages.Legal.privacy)).toContain("{email}");
    expect(COMPANY.email).toMatch(/@maskingo\.no$/);
  });
});
