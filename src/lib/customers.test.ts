import { describe, expect, it } from "vitest";
import {
  formatPhone,
  normalizeEmail,
  normalizePhone,
  normalizePostalCode,
  searchPattern,
  toCustomerFormValues,
  validateCustomer,
} from "./customers";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("normalizePhone", () => {
  it.each([
    ["912 34 567", "91234567"],
    ["+47 912 34 567", "+4791234567"],
    ["0047 91234567", "+4791234567"],
    ["(+47) 912-34-567", "+4791234567"],
    ["+370 612 34567", "+37061234567"],
    ["", null],
    ["   ", null],
    ["1234", undefined],
    ["91234567x", undefined],
    ["+47 912 34 567 890 1234", undefined],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe("formatPhone", () => {
  it("groups Norwegian numbers", () => {
    expect(formatPhone("91234567")).toBe("912 34 567");
    expect(formatPhone("+4791234567")).toBe("+47 912 34 567");
  });
  it("leaves other numbers as stored", () => {
    expect(formatPhone("+37061234567")).toBe("+37061234567");
  });
});

describe("normalizeEmail", () => {
  it("lower-cases and trims", () => {
    expect(normalizeEmail("  Post@NordBygg.test ")).toBe("post@nordbygg.test");
  });
  it.each(["post", "post@", "post@nordbygg", "po st@nordbygg.test"])("refuses %s", (input) => {
    expect(normalizeEmail(input)).toBeUndefined();
  });
  it("treats empty as no address", () => {
    expect(normalizeEmail("")).toBeNull();
  });
});

describe("normalizePostalCode", () => {
  it.each([
    ["0155", "0155"],
    [" 2000 ", "2000"],
    ["", null],
    ["155", undefined],
    ["NO-0155", undefined],
  ])("%s → %s", (input, expected) => {
    expect(normalizePostalCode(input)).toBe(expected);
  });
});

describe("validateCustomer", () => {
  const company = {
    kind: "company",
    name: "  Nordbygg   AS ",
    orgNumber: "123 456 785",
    contactName: "Kari  Nordmann",
    phone: "+47 912 34 567",
    email: "Post@Nordbygg.test",
    invoiceEmail: "",
    street: "Storgata 1",
    postalCode: "0155",
    city: "Oslo",
    note: "Ring før levering.\r\nPorten er på baksiden.",
  };

  it("cleans a valid company into database fields", () => {
    const { fields, fieldErrors } = validateCustomer(form(company));
    expect(fieldErrors).toBeUndefined();
    expect(fields).toEqual({
      kind: "company",
      name: "Nordbygg AS",
      org_number: "123456785",
      contact_name: "Kari Nordmann",
      phone: "+4791234567",
      email: "post@nordbygg.test",
      invoice_email: null,
      street: "Storgata 1",
      postal_code: "0155",
      city: "Oslo",
      note: "Ring før levering.\nPorten er på baksiden.",
    });
  });

  it("needs only a name", () => {
    const { fields } = validateCustomer(form({ kind: "company", name: "Nordbygg AS" }));
    expect(fields).toMatchObject({ name: "Nordbygg AS", org_number: null, phone: null, email: null, note: null });
  });

  it("refuses a wrong check digit and explains every field at once", () => {
    const { fields, fieldErrors, values } = validateCustomer(
      form({ ...company, name: "", orgNumber: "123456789", phone: "12", email: "post@", postalCode: "155" }),
    );
    expect(fields).toBeUndefined();
    expect(fieldErrors).toEqual({
      name: "nameRequired",
      orgNumber: "orgNumberInvalid",
      phone: "phoneInvalid",
      email: "emailInvalid",
      postalCode: "postalCodeInvalid",
    });
    // What was typed stays in the form.
    expect(values.orgNumber).toBe("123456789");
  });

  it("ignores an organization number left over when the customer is a private person", () => {
    const { fields } = validateCustomer(form({ ...company, kind: "private", orgNumber: "999" }));
    expect(fields?.kind).toBe("private");
    expect(fields?.org_number).toBeNull();
  });

  it("refuses an unknown kind and too long texts", () => {
    const { fieldErrors } = validateCustomer(
      form({ kind: "partner", name: "x".repeat(121), note: "x".repeat(1001), city: "x".repeat(101) }),
    );
    expect(fieldErrors).toMatchObject({
      kind: "kindInvalid",
      name: "nameRequired",
      note: "noteInvalid",
      city: "cityInvalid",
    });
  });

  it("round-trips through the edit form", () => {
    const { fields } = validateCustomer(form(company));
    const values = toCustomerFormValues(fields!);
    expect(values.orgNumber).toBe("123 456 785");
    expect(values.phone).toBe("+47 912 34 567");
    expect(validateCustomer(form(values)).fields).toEqual(fields);
  });
});

describe("searchPattern", () => {
  it("is null for an empty search", () => {
    expect(searchPattern("   ")).toBeNull();
  });
  it("lower-cases words", () => {
    expect(searchPattern(" Nordbygg  AS ")).toBe("%nordbygg as%");
  });
  it("finds numbers however they are grouped", () => {
    expect(searchPattern("912 34 567")).toBe("%91234567%");
    expect(searchPattern("123 456 785")).toBe("%123456785%");
  });
  it("matches % and _ literally", () => {
    expect(searchPattern("100%_a\\")).toBe("%100\\%\\_a\\\\%");
  });
});
