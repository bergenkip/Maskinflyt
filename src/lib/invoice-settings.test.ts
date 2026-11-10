import { describe, expect, it } from "vitest";
import { formatBankAccount, isValidBankAccount, validateInvoiceSettings } from "./invoice-settings";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const good = {
  orgNumber: "123 456 785",
  street: " Storgata   1 ",
  postalCode: "0155",
  city: "Oslo",
  vatRegistered: "on",
  bankAccount: "1234.56.78903",
  paymentDays: "14",
  email: "Faktura@Fjellkran.test",
  phone: "+47 912 34 567",
  firstNumber: "1001",
};

describe("bank account", () => {
  it("accepts a kontonummer with the right MOD11 check digit, with or without spaces and dots", () => {
    expect(isValidBankAccount("12345678903")).toBe(true);
    expect(isValidBankAccount("1234 56 78903")).toBe(true);
    expect(isValidBankAccount("1503.12.34562")).toBe(true);
  });

  it("refuses a wrong check digit, a wrong length and letters", () => {
    expect(isValidBankAccount("12345678904")).toBe(false);
    expect(isValidBankAccount("1234567890")).toBe(false);
    expect(isValidBankAccount("1234567890A")).toBe(false);
  });

  it("is shown as banks print it", () => {
    expect(formatBankAccount("12345678903")).toBe("1234 56 78903");
  });
});

describe("validateInvoiceSettings", () => {
  it("cleans every field as the database stores it", () => {
    expect(validateInvoiceSettings(form(good), "NO").fields).toEqual({
      org_number: "123456785",
      street: "Storgata 1",
      postal_code: "0155",
      city: "Oslo",
      vat_registered: true,
      in_business_register: false,
      bank_account: "12345678903",
      payment_days: 14,
      email: "faktura@fjellkran.test",
      phone: "+4791234567",
      first_number: 1001,
    });
  });

  it("leaves the optional e-mail and phone empty", () => {
    const { fields } = validateInvoiceSettings(form({ ...good, email: "", phone: "" }), "NO");
    expect(fields?.email).toBeNull();
    expect(fields?.phone).toBeNull();
  });

  it("names each wrong field", () => {
    const { fieldErrors, fields } = validateInvoiceSettings(
      form({ ...good, orgNumber: "", street: "", postalCode: "155", city: "", bankAccount: "12345678904", paymentDays: "91", email: "x", phone: "12", firstNumber: "0" }),
      "NO",
    );
    expect(fields).toBeUndefined();
    expect(fieldErrors).toEqual({
      orgNumber: "orgNumberInvalid",
      street: "streetInvalid",
      postalCode: "postalCodeInvalid",
      city: "cityInvalid",
      bankAccount: "bankAccountInvalid",
      paymentDays: "paymentDaysInvalid",
      email: "emailInvalid",
      phone: "phoneInvalid",
      firstNumber: "firstNumberInvalid",
    });
  });

  it("refuses decimals and signs in the payment terms", () => {
    expect(validateInvoiceSettings(form({ ...good, paymentDays: "14.5" }), "NO").fieldErrors?.paymentDays).toBe("paymentDaysInvalid");
    expect(validateInvoiceSettings(form({ ...good, paymentDays: "-1" }), "NO").fieldErrors?.paymentDays).toBe("paymentDaysInvalid");
    expect(validateInvoiceSettings(form({ ...good, paymentDays: "0" }), "NO").fields?.payment_days).toBe(0);
  });

  it("takes other countries' postal codes and organisation numbers without the Norwegian rules", () => {
    const { fields } = validateInvoiceSettings(form({ ...good, orgNumber: "556677-8899", postalCode: "LT-01100" }), "LT");
    expect(fields?.org_number).toBe("5566778899");
    expect(fields?.postal_code).toBe("LT-01100");
  });
});
