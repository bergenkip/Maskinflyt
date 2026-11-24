import { describe, expect, it } from "vitest";
import { isValidSlug, normalizeWebsite, services, slugify, validateCompanyPage } from "./company-page";

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const one of Array.isArray(value) ? value : [value]) data.append(name, one);
  }
  return data;
}

describe("slugify", () => {
  it("makes an address from the company's name", () => {
    expect(slugify("Fjellkran AS")).toBe("fjellkran-as");
    expect(slugify("Ærlig Grøft & Bråte AS")).toBe("aerlig-groft-brate-as");
    expect(slugify("  Šiaurės Žemė, UAB ")).toBe("siaures-zeme-uab");
    expect(isValidSlug(slugify("Fjellkran AS"))).toBe(true);
  });

  it("refuses addresses that are too short or have odd characters", () => {
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("fjell kran")).toBe(false);
    expect(isValidSlug("-fjellkran")).toBe(false);
    expect(isValidSlug("fjell--kran")).toBe(false);
    expect(isValidSlug("a".repeat(61))).toBe(false);
  });
});

describe("normalizeWebsite", () => {
  it("adds https and keeps only https addresses", () => {
    expect(normalizeWebsite("Fjellkran.no")).toBe("https://fjellkran.no");
    expect(normalizeWebsite("https://www.fjellkran.no/om-oss")).toBe("https://www.fjellkran.no/om-oss");
    expect(normalizeWebsite("")).toBeNull();
    expect(normalizeWebsite("http://fjellkran.no")).toBeUndefined();
    expect(normalizeWebsite("javascript:alert(1)")).toBeUndefined();
    expect(normalizeWebsite("https://user:pw@fjellkran.no")).toBeUndefined();
    expect(normalizeWebsite("not a site")).toBeUndefined();
  });
});

describe("validateCompanyPage", () => {
  const complete = {
    slug: "fjellkran-as",
    published: "on",
    description: "Kranbil med fører.",
    services: ["crane_truck", "transport"],
    city: " Bergen ",
    phone: "+47 912 34 567",
    email: "",
    website: "fjellkran.no",
  };

  it("accepts a complete page and cleans the values", () => {
    const { fields, fieldErrors } = validateCompanyPage(form(complete));
    expect(fieldErrors).toEqual({});
    expect(fields).toMatchObject({
      page_slug: "fjellkran-as",
      page_published: true,
      page_services: ["crane_truck", "transport"],
      page_city: "Bergen",
      page_phone: "+4791234567",
      page_email: null,
      page_website: "https://fjellkran.no",
    });
  });

  it("lets a hidden page be saved half-done", () => {
    const { fields } = validateCompanyPage(form({ slug: "fjellkran-as" }));
    expect(fields?.page_published).toBe(false);
  });

  it("asks for what a published page needs", () => {
    const { fields, fieldErrors } = validateCompanyPage(form({ slug: "fjellkran-as", published: "on" }));
    expect(fields).toBeUndefined();
    expect(fieldErrors).toEqual({
      description: "descriptionRequired",
      services: "servicesRequired",
      city: "cityRequired",
      phone: "contactRequired",
    });
  });

  it("ignores services that are not on the list", () => {
    const { values } = validateCompanyPage(form({ ...complete, services: ["crane_truck", "rocket"] }));
    expect(values.services).toEqual(["crane_truck"]);
    expect(services).toHaveLength(8);
  });
});
