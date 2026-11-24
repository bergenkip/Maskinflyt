import { describe, expect, it } from "vitest";
import { repeatPath, validateCustomerAccount } from "./customer-account";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe("customer account form", () => {
  it("cleans the phone and the place", () => {
    const { fields } = validateCustomerAccount(form({ phone: " +47 912 34 569 ", place: " Strandgaten 1,   Bergen " }));
    expect(fields).toEqual({ account_phone: "+4791234569", account_place: "Strandgaten 1, Bergen" });
  });

  it("allows both empty, and explains a bad phone or a long place", () => {
    expect(validateCustomerAccount(form({})).fields).toEqual({ account_phone: null, account_place: null });
    const bad = validateCustomerAccount(form({ phone: "12", place: "x".repeat(201) }));
    expect(bad.fields).toBeUndefined();
    expect(bad.fieldErrors).toEqual({ phone: "phoneInvalid", place: "placeTooLong" });
  });

  it("builds the address for ordering again", () => {
    expect(repeatPath("fjellkran-as", "1b2c")).toBe("/firma/fjellkran-as?gjenta=1b2c#request");
  });
});
